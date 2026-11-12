// Online signing (/api/signing/*, /sign/:token) — port of legacy src/routes/signing.js.
// Same responses, same stored SigningRequest, same Bitrix notes/stage moves, same mails.
// Document rendering is a plug-in point (signing/documents.ts, phase 5).
// Differences (secure by design): only token routes and the page are public (legacy's path
// gate also left `POST /api/signing/` with a trailing slash open); a document `kind` lookup
// can't hit prototype keys.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SigningRequest } from "../platform/models.js";
import type { DealWrites } from "../integrations/bitrix-deal.js";
import { STAGES } from "../integrations/bitrix-deal.js";
import type { Mailer } from "../integrations/mail.js";
import { buildEmailHtml } from "../email/template.js";
import { resolveAnsprechpartner } from "./offers-write.js";
import { tokenFromHeaders, verifyToken } from "../platform/auth.js";
import { injectHead } from "../web/register.js";
import {
  DEFAULT_EXPIRY_DAYS, REQUIRED_FIELDS_BY_KEY, baseDocKey, buildGreetingLine, deriveBitrixTarget, deriveCustomerType,
  docKeysFor, docLabel, extractPrefill, hasPaymentChoice, isAhOffer, isExpired, isPartnerKey, recomputeStatus, resolveFields,
} from "../signing/fields.js";
import { documentHtml, documentPdf, signedPdf, type SigningRenderer } from "../signing/documents.js";
import {
  OfferChangedError, OfferSend, SEND_ID, assertUnchangedSinceSent, claimSigningCompletion, finishSigningCompletion, offerChangedBody, patchSend, readSendFile,
  sendForSigning, storeSendFile, type SendFile,
} from "../modules/sends/index.js";
import { offerIdentity } from "../modules/sends/index.js";
import type { EnsureSentOffer } from "../modules/sends/index.js";

export interface SigningDeps {
  deals: Pick<DealWrites, "addTimelineComment" | "updateDealAfterSigning" | "ensurePartnerContact" | "getDealContactId" | "addTask">;
  renderer: SigningRenderer;
  /** signing transport (legacy: SMTP_PORT || 587, SMTP_SECURE, SMTP_PASS optional) */
  mailer: Mailer;
  officeEmail?: string | undefined;
  assetsDir: string;
  signPageFile: string;
  publicBaseUrl?: string | undefined;
  apDefaultEmail: string;
  authSecret: string;
  log: { warn(o: object, m: string): void; error(o: object, m: string): void };
  /** makes the locked offer (pinned price) exist when an offer is handed over for signature */
  ensureSentOffer?: EnsureSentOffer | undefined;
}

const SIGN_LINK_INTRO =
  "Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem – nutzen Sie " +
  "einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu " +
  "unterschreiben und direkt an uns zurückzuschicken:";
// Strict: the image is stored and later placed into the HTML that is rendered into the signed
// PDF (audit signing S-10) — only base64 after the prefix, a size cap, and a real PNG header.
const PNG_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SIGNATURE_LENGTH = 5 * 1024 * 1024;
export function isValidSignature(v: unknown): boolean {
  if (typeof v !== "string" || v.length > MAX_SIGNATURE_LENGTH || !PNG_URL.test(v)) return false;
  const head = Buffer.from(v.slice(22, 38), "base64");
  return head.length >= 8 && head.subarray(0, 8).equals(PNG_MAGIC);
}
const msg = (e: unknown) => (e as Error)?.message || String(e);
const pdfName = (sr: any, key: string) => `${key}_${sr.offerNumber || "signiert"}.pdf`;
const toAttachments = (pdfs: { filename: string; buffer: Buffer }[]) => pdfs.map((p) => ({ filename: p.filename, base64: p.buffer.toString("base64") }));

export function signingService(d: SigningDeps) {
  async function postTimeline(sr: any, comment: string, attachments: { filename: string; base64: string }[] = []) {
    if (!sr.bitrixEntityType || !sr.bitrixEntityId) return { skipped: true };
    try {
      return await d.deals.addTimelineComment({ entityType: sr.bitrixEntityType, entityId: sr.bitrixEntityId, comment, attachments });
    } catch (err) {
      d.log.warn({ err: msg(err) }, "signing: Bitrix timeline comment failed");
      return { ok: false, error: msg(err) };
    }
  }

  /** Returns { sr, link, token, customerType, warning?, reused? } or { needsConfirm, warning }. Posts the "🔗 versendet" note. */
  async function createRequest(a: { payload: any; offerNumber?: unknown; offerType?: unknown; dealId?: unknown; contactId?: unknown; baseUrl?: string; force?: boolean }) {
    const { payload } = a;
    const customerType = deriveCustomerType(payload);
    const prefill = extractPrefill(payload);
    const { bitrixEntityType, bitrixEntityId } = deriveBitrixTarget({ dealId: a.dealId, contactId: a.contactId });
    const base = String(a.baseUrl || "").replace(/\/+$/, "");

    // Reuse an open request for the same offer (keeps already-signed documents).
    const offerNumberStr = String(a.offerNumber || payload?.offerNumber || "");
    let warning: string | null = null;
    if (offerNumberStr) {
      const candidates = await SigningRequest.find({ offerNumber: offerNumberStr, status: { $nin: ["completed", "expired"] } }).sort({ createdAt: -1 });
      const existing: any = candidates.find((c) => !isExpired(c as any));
      if (existing) {
        if (JSON.stringify(existing.payloadSnapshot) === JSON.stringify(payload)) {
          return { sr: existing, link: `${base}/sign/${existing.token}`, token: existing.token, customerType: existing.customerType, reused: true };
        }
        const signedCount = (existing.documents || []).filter((x: any) => x.status === "signed").length;
        if (signedCount > 0) {
          warning =
            `Das Angebot wurde geändert, seit der Kunde ${signedCount} von ` +
            `${existing.documents.length} Dokument(en) unterschrieben hat. ` +
            `Der bisherige Fortschritt geht mit dem neuen Link verloren.`;
          if (!a.force) return { needsConfirm: true as const, warning };
        }
      }
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const documents = docKeysFor(payload, a.offerType, customerType).map((key) => ({ key, status: "pending" }));
    const sr: any = await SigningRequest.create({
      token,
      offerNumber: String(a.offerNumber || payload?.offerNumber || ""),
      offerType: String(a.offerType || payload?.activeOffer || ""),
      customerType, bitrixEntityType, bitrixEntityId,
      customerEmail: prefill.email || "",
      customerName: `${prefill.firstName} ${prefill.lastName}`.trim(),
      payloadSnapshot: payload, prefill, documents, status: "sent", expiresAt,
    });
    const link = `${base}/sign/${token}`;
    await postTimeline(sr,
      `🔗 Signatur-Link an Kunde versendet` + (sr.offerNumber ? ` (${sr.offerNumber})` : "") +
      `\nGültig bis: ${expiresAt.toLocaleDateString("de-DE")}\n>> Hier Unterlagen online ausfüllen und unterzeichnen <<\n${link}`);
    return { sr, link, token, customerType, warning };
  }

  /** The signed PDF as it was produced at completion (stored on the send record), else rendered now. */
  async function storedOrRendered(sr: any, doc: any): Promise<Buffer> {
    try {
      const rec = await sendForSigning(sr.token);
      const file = (rec?.files as SendFile[] | undefined)?.find((f) => f.role === "signed" && f.filename === pdfName(sr, doc.key));
      const stored = file ? await readSendFile(file.fileId) : null;
      if (stored) return stored;
    } catch (err) { d.log.warn({ err: msg(err) }, "signing: stored signed PDF not readable — rendering"); }
    return signedPdf(d.renderer, sr, doc);
  }

  async function signedPdfs(sr: any, docs: any[], { fresh = false } = {}) {
    const out: { filename: string; buffer: Buffer }[] = [];
    for (const doc of docs) out.push({ filename: pdfName(sr, doc.key), buffer: fresh ? await signedPdf(d.renderer, sr, doc) : await storedOrRendered(sr, doc) });
    return out;
  }

  /** Keeps the signed PDFs exactly as the customer received them (with hashes) on the send record. */
  async function storeSigned(sr: any, pdfs: { filename: string; buffer: Buffer }[]) {
    let rec = await sendForSigning(sr.token);
    if (!rec) {
      // request created by the old app or without a send record: give it one now
      const sendId = `sign-${String(sr.token).slice(0, 40)}`;
      await OfferSend.create({
        sendId, channel: "signlink", status: "done", offerNumber: sr.offerNumber || "", offerType: sr.offerType || "", dealId: sr.bitrixEntityType === "deal" ? sr.bitrixEntityId : "",
        to: sr.customerEmail || "", signingToken: sr.token, identity: offerIdentity(sr.payloadSnapshot, sr.offerNumber), startedAt: sr.createdAt ?? new Date(), finishedAt: new Date(),
      });
      rec = await sendForSigning(sr.token);
    }
    const have = new Set(((rec?.files ?? []) as SendFile[]).filter((f) => f.role === "signed").map((f) => f.filename));
    for (const p of pdfs) if (!have.has(p.filename)) await storeSendFile(rec.sendId, "signed", p.filename, p.buffer);
    await patchSend(rec.sendId, { signedAt: new Date(), ...(rec.identity ? {} : { identity: rec.identityOnSign ?? offerIdentity(sr.payloadSnapshot, sr.offerNumber) }) });
  }

  /** Admin panel: push whatever is already signed to Bitrix. */
  async function sendSignedDocsToBitrix(sr: any) {
    const docs = (sr.documents || []).filter((x: any) => x.status === "signed");
    if (!docs.length) return { sent: [] as string[] };
    const pdfs = await signedPdfs(sr, docs);
    await postTimeline(sr,
      `📎 Unterschriebene Unterlagen manuell gesendet` + (sr.offerNumber ? ` (${sr.offerNumber})` : "") +
      ` — Vorgang war nicht vollständig abgeschlossen.\nSignierte PDFs sind angehängt.`, toAttachments(pdfs));
    return { sent: pdfs.map((p) => p.filename) };
  }

  /** Two-person offers: person 1's PDFs to the main contact, person 2's to the partner contact. */
  async function filePerPersonDocs(sr: any, pdfs: { filename: string; buffer: Buffer }[]) {
    const k = sr.payloadSnapshot?.Kundendaten || {};
    const dealId = sr.bitrixEntityType === "deal" ? sr.bitrixEntityId : "";
    const mainContactId = sr.bitrixEntityType === "contact" ? Number(sr.bitrixEntityId) : dealId ? await d.deals.getDealContactId(dealId) : null;
    let partnerContactId: any = Number(sr.partnerContactId) || null;
    if (!partnerContactId) {
      const r: any = await d.deals.ensurePartnerContact({
        dealId, firstName: k.partnerFirstName, lastName: k.partnerLastName, postalCode: sr.prefill?.postalCode,
        city: sr.prefill?.city, street: sr.prefill?.street, phone: sr.prefill?.phone, email: sr.prefill?.email,
      });
      if (r.ambiguous) {
        await postTimeline(sr,
          `⚠️ Partner „${k.partnerFirstName} ${k.partnerLastName}": mehrere passende Kontakte in Bitrix ` +
          `(IDs ${r.candidates.join(", ")}). Bitte Kontakt manuell zuordnen – die Unterlagen von ` +
          `Person 2 liegen am Deal.`);
        return;
      }
      partnerContactId = r.contactId;
      sr.partnerContactId = String(partnerContactId);
      await postTimeline(sr, r.created
        ? `👥 Kontakt für Partner angelegt: ${k.partnerFirstName} ${k.partnerLastName} (ID ${partnerContactId})`
        : `👥 Partner mit bestehendem Kontakt verknüpft: ${k.partnerFirstName} ${k.partnerLastName} (ID ${partnerContactId})`);
    }
    const isP2 = (p: { filename: string }) => /^(vollmacht|abtretung)_p2_/.test(p.filename);
    const note = (who: string) => `✅ Unterschriebene Unterlagen ${who}` + (sr.offerNumber ? ` (${sr.offerNumber})` : "");
    if (mainContactId) await d.deals.addTimelineComment({ entityType: "contact", entityId: mainContactId, comment: note("(Person 1)"), attachments: toAttachments(pdfs.filter((p) => !isP2(p))) });
    await d.deals.addTimelineComment({ entityType: "contact", entityId: partnerContactId, comment: note("(Person 2)"), attachments: toAttachments(pdfs.filter(isP2)) });
  }

  async function complete(sr: any) {
    const result: Record<string, unknown> = { ok: true, email: "skipped", bitrix: "skipped", partnerFiling: "skipped", dealMove: "skipped" };
    const pdfs = await signedPdfs(sr, sr.documents, { fresh: true });
    // first of all: keep what was signed — every later step may fail without losing it
    try { await storeSigned(sr, pdfs); result.stored = true; }
    catch (err) { d.log.error({ err: msg(err) }, "signing: storing the signed PDFs failed"); result.stored = false; }
    if (d.mailer.configured) {
      const attachments: any[] = pdfs.map((p) => ({ filename: p.filename, content: p.buffer, contentType: "application/pdf" }));
      const body = [
        buildGreetingLine(sr.prefill), "",
        "Ihre Unterlagen haben uns erreicht - vielen Dank!",
        "Anbei erhalten Sie jeweils eine Kopie im Anhang.", "",
        "Nach erfolgreicher Überprüfung der Unterlagen melden wir uns " + "bzgl. des nächsten Schrittes umgehend bei Ihnen zurück.", "",
        "Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung!",
      ].join("\n");
      const cid = "emc2-signature-picture";
      const pic = path.join(d.assetsDir, "signaturepicture.png");
      const hasPic = fs.existsSync(pic);
      if (hasPic) attachments.push({ filename: "signaturepicture.png", path: pic, cid });
      try {
        await d.mailer.send({
          from: d.mailer.from, replyTo: d.mailer.replyTo, to: sr.customerEmail, bcc: d.officeEmail || undefined,
          subject: `Unterschriebene Unterlagen – ${sr.offerNumber || "Angebot"}`,
          text: body, html: buildEmailHtml(body, { signatureCid: hasPic ? cid : null, contactName: "", isAh: isAhOffer(sr) }),
          attachments,
        });
        result.email = "ok";
      } catch (err) {
        d.log.warn({ err: msg(err) }, "signing: completion email failed");
        result.email = "failed"; result.emailError = msg(err);
      }
    }
    const filed: any = await postTimeline(sr, `✅ Alle Dokumente unterschrieben` + (sr.offerNumber ? ` (${sr.offerNumber})` : "") + `\nSignierte PDFs sind angehängt.`, toAttachments(pdfs));
    if (sr.documents.some((x: any) => isPartnerKey(x.key))) {
      try { await filePerPersonDocs(sr, pdfs); result.partnerFiling = "ok"; }
      catch (err) { d.log.warn({ err: msg(err) }, "signing: per-contact filing failed"); result.partnerFiling = "failed"; }
    }
    result.bitrix = filed?.skipped ? "skipped" : filed?.ok === false ? "failed" : "ok";
    if (sr.bitrixEntityType === "deal" && sr.bitrixEntityId) {
      try {
        // "Antrag an Kasse stellen" requires the Eigenanteil on Bitrix's side (not for AH).
        let selfPayAmount: number | undefined;
        if (sr.customerType === "KASSE" && !isAhOffer(sr)) {
          const { computed } = await d.renderer.renderData(sr.payloadSnapshot || {});
          selfPayAmount = Number(computed?.selfPayAmount) || 0;
        }
        await d.deals.updateDealAfterSigning({
          dealId: sr.bitrixEntityId, customerType: sr.customerType, selfPayAmount,
          ...(isAhOffer(sr) && { categoryId: STAGES.AH_SIGNING.categoryId, stageId: STAGES.AH_SIGNING.stageId }),
        });
        result.dealMove = "ok";
      } catch (err) {
        d.log.warn({ err: msg(err) }, "signing: Bitrix deal stage update failed");
        result.dealMove = "failed";
      }
    }
    return result;
  }

  return { createRequest, sendSignedDocsToBitrix, postTimeline, complete, storedOrRendered };
}

const PREFILL_CARRY_KEYS = ["lastName", "firstName", "street", "postalCode", "city", "phone", "geburtsdatum"];
const KUNDENDATEN_CARRY_KEYS = ["kassenkundeName", "kk_versichertennr"];
const PARTNER_CARRY: Record<string, string> = {
  lastName: "partnerLastName", firstName: "partnerFirstName", geburtsdatum: "partnerGeburtsdatum",
  kassenkundeName: "partnerKassenkundeName", kk_versichertennr: "partnerKvnr",
  kk_pflegegradSeit: "partnerPflegegradSeit", kk_krankenkasseAdresse: "partnerKrankenkasseAdresse",
};

export async function registerSigning(app: FastifyInstance, d: SigningDeps) {
  const svc = signingService(d);
  const PUBLIC = { config: { public: true } };
  const err500 = (req: FastifyRequest, reply: FastifyReply, what: string, err: unknown) => {
    req.log.error({ err }, `${what} failed`);
    return reply.status(500).send({ error: { code: "SIGNING_FAILED", message: msg(err), requestId: req.id } });
  };
  const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
    reply.status(status).send({ error: { code, message, requestId: req.id } });
  const baseUrl = (req: FastifyRequest) => {
    const fromEnv = String(d.publicBaseUrl || "").trim();
    return fromEnv ? fromEnv.replace(/\/+$/, "") : `${req.protocol}://${req.headers.host}`;
  };

  // ---------- internal ----------
  app.post("/api/signing", async (req, reply) => {
    try {
      const b = (req.body ?? {}) as any;
      const payload = b.payload;
      if (!payload || typeof payload !== "object") return fail(req, reply, 400, "BAD_REQUEST", "payload ist erforderlich");
      // Decision C: an offer that was sent cannot be handed over for signature with changed content
      const offerNo = String(b.offerNumber || payload?.offerNumber || "");
      const identity = offerIdentity(payload, offerNo);
      const asSent = structuredClone(payload);
      try { await assertUnchangedSinceSent(offerNo, payload); }
      catch (e) {
        if (e instanceof OfferChangedError) return reply.status(409).send(offerChangedBody(e, req.id));
        req.log.warn({ err: e }, "sent-offer check failed — continuing");
      }
      payload.Kundendaten = await resolveAnsprechpartner(payload.Kundendaten, req.user, d.apDefaultEmail);
      const result: any = await svc.createRequest({
        payload, offerNumber: b.offerNumber, offerType: b.offerType, dealId: b.dealId, contactId: b.contactId, baseUrl: baseUrl(req), force: !!b.force,
      });
      if (result.needsConfirm) return reply.status(409).send({ needsConfirm: true, warning: result.warning });
      const { sr, link, token, customerType, reused } = result;
      const prefill = sr.prefill || {};
      if (b.via === "post" && sr.via !== "post") { sr.via = "post"; await sr.save(); }

      // Send record for the hand-over (clients that send a sendId): on-site signing counts as
      // "sent" from the first signature on, a mailed link at once. The locked offer (pinned price)
      // is made sure of on the server — before, that was the browser's best-effort save.
      if (SEND_ID.test(String(b.sendId || ""))) {
        try {
          if (!(await sendForSigning(token))) {
            const mailed = !!b.sendEmail;
            await OfferSend.create({
              sendId: String(b.sendId), channel: mailed ? "signlink" : "onsite", status: "done", by: String(req.user?.email || ""),
              dealId: String(b.dealId || ""), contactId: String(b.contactId || ""), offerNumber: sr.offerNumber || offerNo, offerType: sr.offerType || String(b.offerType || ""),
              to: mailed ? String(prefill.email || "") : "", subject: mailed ? "Link zur Online-Unterschrift" : "Unterschrift vor Ort",
              payload: asSent, identity: mailed ? identity : null, identityOnSign: identity, signingToken: token, startedAt: new Date(), finishedAt: new Date(),
            });
          }
          if (d.ensureSentOffer) await d.ensureSentOffer({ offerNumber: sr.offerNumber || offerNo, offerType: sr.offerType || String(b.offerType || "bu"), payload: asSent });
        } catch (e) { req.log.warn({ err: e }, "send record for signing failed"); }
      }

      let emailResult: Record<string, unknown> = { skipped: true };
      if (b.sendEmail && prefill.email && d.mailer.configured) {
        const html =
          `<p style="font-weight:bold;">${SIGN_LINK_INTRO}</p>` +
          `<p><a href="${link}">&gt;&gt; Hier Unterlagen online ausfüllen und unterzeichnen &lt;&lt;</a></p>`;
        try {
          const info = await d.mailer.send({
            from: d.mailer.from, replyTo: d.mailer.replyTo, to: prefill.email,
            subject: `Ihre Unterlagen zur Unterschrift – ${sr.offerNumber || "Angebot"}`, text: `${SIGN_LINK_INTRO}\n\n${link}`, html,
          });
          emailResult = { ok: true, messageId: info.messageId };
        } catch (err) {
          emailResult = { ok: false, error: msg(err) };
        }
      }
      return reply.status(201).send({ id: sr._id, token, link, customerType, documents: sr.documents.map((x: any) => x.key), emailResult, reused: !!reused });
    } catch (err) { return err500(req, reply, "POST /api/signing", err); }
  });

  app.get("/api/signing/status/:offerNumber", async (req, reply) => {
    try {
      const list: any[] = await SigningRequest.find({ offerNumber: String((req.params as any).offerNumber || "").trim() }).sort({ createdAt: -1 }).lean();
      return list.map((sr) => ({
        token: sr.token, status: sr.status, via: sr.via || "", customerType: sr.customerType,
        openedAt: sr.openedAt, completedAt: sr.completedAt, expiresAt: sr.expiresAt,
        documents: (sr.documents || []).map((x: any) => ({ key: x.key, status: x.status, signedAt: x.signedAt })),
      }));
    } catch (err) { return err500(req, reply, "GET /api/signing/status", err); }
  });

  app.get("/api/signing/status/:offerNumber/signed", async (req, reply) => {
    try {
      const sr: any = await SigningRequest.findOne({ offerNumber: String((req.params as any).offerNumber || "").trim(), status: "completed", via: "post" })
        .sort({ completedAt: -1, createdAt: -1 });
      if (!sr) return fail(req, reply, 404, "NOT_FOUND", "Keine vollständig unterschriebenen Unterlagen gefunden.");
      const documents = [];
      for (const x of sr.documents) documents.push({ key: x.key, filename: pdfName(sr, x.key), base64: (await svc.storedOrRendered(sr, x)).toString("base64") });
      return { offerNumber: sr.offerNumber, completedAt: sr.completedAt, documents };
    } catch (err) { return err500(req, reply, "GET /api/signing/status/:offerNumber/signed", err); }
  });

  // ---------- public (token = the only credential) ----------
  async function loadByToken(req: FastifyRequest, reply: FastifyReply): Promise<any | null> {
    const token = String((req.params as any).token || "").trim();
    const sr: any = await SigningRequest.findOne({ token });
    if (!sr) { fail(req, reply, 404, "NOT_FOUND", "Ungültiger oder abgelaufener Link"); return null; }
    if (isExpired(sr)) {
      if (sr.status !== "completed") { sr.status = "expired"; await sr.save(); }
      // 410 is cacheable by default — without no-store a reload shows the state from before
      // "Neuen Link anfordern" (main PR #321)
      reply.header("Cache-Control", "no-store").status(410).send({
        error: { code: "EXPIRED", message: "Dieser Link ist abgelaufen", requestId: req.id },
        expired: true, newLinkRequested: !!sr.newLinkRequestedAt,
      });
      return null;
    }
    return sr;
  }

  // Bitrix users for the "new link requested" task (main PR #321): HP responsible, JP + RF
  // Mitwirkende, SW Beobachter.
  const NEW_LINK_TASK = { responsible: 2586, accomplices: [2136, 2920], auditors: [6] };

  // The customer on an expired link asks for a new one: one Bitrix task + timeline note per
  // link; repeated clicks do nothing (atomic claim on newLinkRequestedAt).
  app.post("/api/signing/:token/request-new-link", PUBLIC, async (req, reply) => {
    try {
      const token = String((req.params as any).token || "").trim();
      const sr: any = await SigningRequest.findOne({ token });
      if (!sr) return fail(req, reply, 404, "NOT_FOUND", "Ungültiger Link");
      if (!isExpired(sr) && sr.status !== "expired") return fail(req, reply, 400, "BAD_REQUEST", "Dieser Link ist noch gültig");
      const claimed = await SigningRequest.findOneAndUpdate({ _id: sr._id, newLinkRequestedAt: null }, { $set: { newLinkRequestedAt: new Date() } }, { new: true });
      if (!claimed) return { ok: true, already: true };

      const p = sr.prefill || {};
      const name = [p.salutation, p.firstName, p.lastName].filter(Boolean).join(" ").trim() || sr.customerName;
      const entity = sr.bitrixEntityType === "deal" ? "D" : sr.bitrixEntityType === "contact" ? "C" : "";
      const entityUrl = entity ? `https://emczwei.bitrix24.de/crm/${entity === "D" ? "deal" : "contact"}/details/${sr.bitrixEntityId}/` : "";
      const ocUrl = `${baseUrl(req)}/?offer=${encodeURIComponent(sr.offerNumber || "")}`;
      const lines = [
        `Kunde fordert über die Signaturseite einen neuen Signatur-Link an.`,
        ``,
        `Kunde: ${name}`,
        `E-Mail: ${p.email || sr.customerEmail || "-"}`,
        `Telefon: ${p.phone || "-"}`,
        `Angebot: ${sr.offerNumber || "-"}`,
        entityUrl ? `Bitrix: ${entityUrl}` : null,
        `OC: ${ocUrl}`,
        `Alter Link: /sign/${sr.token.slice(0, 8)}… (abgelaufen)`,
        ``,
        `Bitte Angebot in OC öffnen und den Signatur-Link neu an den Kunden senden.`,
      ].filter((l) => l !== null);

      let task: any;
      try {
        task = await d.deals.addTask({
          TITLE: `Neuer Signatur-Link angefordert – ${sr.offerNumber || ""} – ${name}`,
          DESCRIPTION: lines.join("\n"),
          RESPONSIBLE_ID: NEW_LINK_TASK.responsible,
          ACCOMPLICES: NEW_LINK_TASK.accomplices,
          AUDITORS: NEW_LINK_TASK.auditors,
          ...(entity ? { UF_CRM_TASK: [`${entity}_${sr.bitrixEntityId}`] } : {}),
        });
      } catch (err) {
        // release the claim so the customer can try again instead of losing the request silently
        req.log.error({ err: msg(err) }, "signing: new-link task failed");
        await SigningRequest.updateOne({ _id: sr._id }, { $set: { newLinkRequestedAt: null } });
        return fail(req, reply, 502, "BITRIX_FAILED", "Anfrage konnte nicht übermittelt werden. Bitte rufen Sie uns an.");
      }
      const taskId = task?.result?.task?.id;
      await svc.postTimeline(sr,
        `Kunde fordert einen neuen Signatur-Link an (${sr.offerNumber || ""})\n` +
        `Der bisherige Link ist abgelaufen. Bitte neuen Signatur-Link an ${p.email || sr.customerEmail || "den Kunden"} senden.` +
        (taskId ? `\nAufgabe: https://emczwei.bitrix24.de/company/personal/user/${NEW_LINK_TASK.responsible}/tasks/task/view/${taskId}/` : ""));
      return { ok: true, taskId: taskId || null };
    } catch (err) { return err500(req, reply, "POST signing request-new-link", err); }
  });

  app.get("/api/signing/:token", PUBLIC, async (req, reply) => {
    try {
      const sr = await loadByToken(req, reply);
      if (!sr) return reply;
      if (!sr.openedAt) {
        sr.openedAt = new Date();
        recomputeStatus(sr);
        await sr.save();
        await svc.postTimeline(sr, `👁 Signatur-Link geöffnet am ${sr.openedAt.toLocaleString("de-DE")}` + (sr.offerNumber ? ` (${sr.offerNumber})` : ""));
      }
      return {
        offerNumber: sr.offerNumber, customerType: sr.customerType, status: sr.status, completed: sr.status === "completed", prefill: sr.prefill,
        documents: (sr.documents || []).map((x: any) => ({ key: x.key, label: docLabel(sr, x.key), status: x.status })),
      };
    } catch (err) { return err500(req, reply, "GET /api/signing/:token", err); }
  });

  app.get("/api/signing/:token/documents/:key/html", PUBLIC, async (req, reply) => {
    try {
      const sr = await loadByToken(req, reply);
      if (!sr) return reply;
      const key = String((req.params as any).key || "");
      const doc = (sr.documents || []).find((x: any) => x.key === key);
      if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Dokument nicht gefunden");
      const html = await documentHtml(d.renderer, sr, doc);
      if (html === null) return fail(req, reply, 404, "NOT_FOUND", "Keine HTML-Ansicht für dieses Dokument");
      return reply.type("text/html; charset=utf-8").send(html);
    } catch (err) { return err500(req, reply, "GET signing document html", err); }
  });

  app.get("/api/signing/:token/documents/:key/pdf", PUBLIC, async (req, reply) => {
    try {
      const sr = await loadByToken(req, reply);
      if (!sr) return reply;
      const key = String((req.params as any).key || "");
      if (!(sr.documents || []).some((x: any) => x.key === key)) return fail(req, reply, 404, "NOT_FOUND", "Dokument nicht gefunden");
      const pdf = await documentPdf(d.renderer, sr, key);
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="${key}.pdf"`).send(pdf);
    } catch (err) { return err500(req, reply, "GET signing document pdf", err); }
  });

  // Runs the completion (signed PDFs, confirmation mail, Bitrix filing, stage move) for a fully
  // signed request — exactly once, also after a failed or interrupted attempt.
  async function runCompletion(sr: any): Promise<{ ran: boolean; ok: boolean; error?: string }> {
    if (!(await claimSigningCompletion(sr.token))) return { ran: false, ok: true };
    // The same facts on the signing request itself, in the shape main writes since PR #332
    // (completionClaimedAt / completionResult) — legacy tools and the admin view read them there.
    const startedAt = new Date();
    const onRequest = (result: Record<string, unknown>) =>
      SigningRequest.updateOne({ _id: sr._id }, { $set: { completionResult: { ...result, finishedAt: new Date() } } })
        .catch((e) => d.log.error({ err: msg(e) }, "signing: completionResult write failed"));
    await SigningRequest.updateOne({ _id: sr._id }, { $set: { completionClaimedAt: startedAt, completionResult: null } });
    try {
      const result = await svc.complete(sr);
      await finishSigningCompletion(sr.token, result);
      // complete() may have linked the partner contact on the in-memory document
      if (sr.partnerContactId) await SigningRequest.updateOne({ _id: sr._id }, { $set: { partnerContactId: sr.partnerContactId } });
      await onRequest({
        ok: true, startedAt, email: result.email, bitrixTimeline: result.bitrix, partnerFiling: result.partnerFiling, dealMove: result.dealMove,
        ...(result.emailError ? { emailError: result.emailError } : {}),
        ...(result.bitrixError ? { bitrixTimelineError: result.bitrixError } : {}),
      });
      return { ran: true, ok: true };
    } catch (err) {
      await finishSigningCompletion(sr.token, { ok: false, error: msg(err) }).catch(() => {});
      await onRequest({ ok: false, startedAt, email: "skipped", bitrixTimeline: "skipped", partnerFiling: "skipped", dealMove: "skipped", error: msg(err) });
      return { ran: true, ok: false, error: msg(err) };
    }
  }
  const docsView = (sr: any) => sr.documents.map((x: any) => ({ key: x.key, status: x.status }));

  // The document is already signed: a repeated submit (double tap, retry after a dropped
  // connection, second device) gets the first result. If the completion failed before, it is
  // run again — with the signature that is already stored.
  async function answerAlreadySigned(req: FastifyRequest, reply: FastifyReply, sr: any, key: string, sig: string) {
    const cur = (sr.documents || []).find((x: any) => x.key === key);
    const allSigned = sr.documents.length > 0 && sr.documents.every((x: any) => x.status === "signed");
    if (cur?.status === "signed" && allSigned) {
      const c = await runCompletion(sr);
      if (c.ran && !c.ok) return reply.status(500).send({ error: { code: "SIGNING_FAILED", message: c.error, requestId: req.id } });
      if (c.ran || cur.signatureImage === sig) return { ok: true, status: sr.status, documents: docsView(sr), completed: true, duplicate: true };
    } else if (cur?.status === "signed" && cur.signatureImage === sig) {
      return { ok: true, status: sr.status, documents: docsView(sr), completed: false, duplicate: true };
    }
    return fail(req, reply, 409, "ALREADY_SIGNED", "Dokument wurde bereits unterschrieben");
  }

  app.post("/api/signing/:token/documents/:key", PUBLIC, async (req, reply) => {
    try {
      let sr = await loadByToken(req, reply);
      if (!sr) return reply;
      const b = (req.body ?? {}) as any;
      const key = String((req.params as any).key || "");
      const doc = (sr.documents || []).find((x: any) => x.key === key);
      if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Dokument nicht gefunden");
      const sig = String(b.signatureImage || "");
      if (doc.status === "signed") return answerAlreadySigned(req, reply, sr, key, sig);
      if (!sig) return fail(req, reply, 400, "BAD_REQUEST", "Unterschrift fehlt");
      if (!isValidSignature(sig)) return fail(req, reply, 400, "BAD_REQUEST", sig.startsWith("data:image/png;base64,") ? "Die Unterschrift ist ungültig. Bitte unterschreiben Sie erneut." : "Unterschrift fehlt");

      // BU Angebot: a payment term is required when the offer offers a choice (AH: none).
      const extraFields = b.extraFields || {};
      if (key === "angebot" && !isAhOffer(sr)) {
        const { data } = await d.renderer.renderData(sr.payloadSnapshot || {});
        if (hasPaymentChoice(data.SelfPayLines)) {
          const idx = Number(extraFields.paymentTermIdx);
          if (!Number.isFinite(idx) || idx < 0) return fail(req, reply, 400, "BAD_REQUEST", "Bitte wählen Sie eine Zahlungsbedingung aus");
        }
      }
      // AH Zusatzblatt: a named Bevollmächtigte/r must sign too.
      const editedFields = b.editedFields || {};
      if (key === "zusatzblatt") {
        const bevName = String(editedFields.bevollmaechtigterName || "").trim();
        if (bevName && !isValidSignature(extraFields.bevollmaechtigterSignature)) {
          return fail(req, reply, 400, "BAD_REQUEST", "Bitte lassen Sie den/die Bevollmächtigte/n unterschreiben");
        }
      }
      if (extraFields.bevollmaechtigterSignature && !isValidSignature(extraFields.bevollmaechtigterSignature)) {
        return fail(req, reply, 400, "BAD_REQUEST", "Die Unterschrift des/der Bevollmächtigten ist ungültig. Bitte erneut unterschreiben.");
      }
      // Vollmacht/Abtretung: every displayed field is mandatory.
      const required = Object.hasOwn(REQUIRED_FIELDS_BY_KEY, baseDocKey(key)) ? REQUIRED_FIELDS_BY_KEY[baseDocKey(key)] : undefined;
      if (required) {
        const fields = resolveFields(sr, { key, editedFields });
        const missing = required.filter(([f]) => !String(fields[f] || "").trim()).map(([, label]) => label);
        if (missing.length) return fail(req, reply, 400, "BAD_REQUEST", `Bitte füllen Sie alle Felder aus: ${missing.join(", ")}`);
      }

      // Carry shared fields into the snapshot so the next document is prefilled.
      const partnerDoc = isPartnerKey(key);
      let touchedPrefill = false, touchedSnapshot = false;
      if (["vollmacht", "abtretung", "abtretung_ah"].includes(baseDocKey(key))) {
        sr.prefill = sr.prefill || {};
        for (const k of partnerDoc ? ["street", "postalCode", "city", "phone"] : PREFILL_CARRY_KEYS) {
          const v = String(editedFields[k] || "").trim();
          if (v) { sr.prefill[k] = v; touchedPrefill = true; }
        }
        sr.payloadSnapshot = sr.payloadSnapshot || {};
        sr.payloadSnapshot.Kundendaten = sr.payloadSnapshot.Kundendaten || {};
        const carryMap = partnerDoc ? PARTNER_CARRY : Object.fromEntries(KUNDENDATEN_CARRY_KEYS.map((k) => [k, k]));
        for (const [from, to] of Object.entries(carryMap)) {
          const v = String(editedFields[from] || "").trim();
          if (v) { sr.payloadSnapshot.Kundendaten[to] = v; touchedSnapshot = true; }
        }
      }

      // The signature is stored FIRST, atomically: only the request that turns this document
      // from "pending" into "signed" goes on. Nothing after this line can lose it.
      const signedAt = new Date();
      const set: Record<string, unknown> = {
        "documents.$.signatureImage": sig, "documents.$.editedFields": editedFields, "documents.$.extraFields": extraFields,
        "documents.$.place": String(b.place || sr.prefill?.city || "").trim(), "documents.$.signedAt": signedAt,
        "documents.$.signedIp": String(req.headers["x-forwarded-for"] || "").split(",")[0]!.trim() || req.ip || "",
        "documents.$.userAgent": String(req.headers["user-agent"] || "").slice(0, 300), "documents.$.status": "signed",
      };
      if (touchedPrefill) set.prefill = sr.prefill;
      if (touchedSnapshot) set.payloadSnapshot = sr.payloadSnapshot;
      const claimed: any = await SigningRequest.findOneAndUpdate({ _id: sr._id, documents: { $elemMatch: { key, status: "pending" } } }, { $set: set }, { new: true });
      if (!claimed) return answerAlreadySigned(req, reply, await SigningRequest.findById(sr._id), key, sig);
      sr = claimed;

      // on-site signing: from the first signature on the offer counts as sent (decision C)
      try {
        const rec = await sendForSigning(sr.token);
        if (rec && !rec.identity && rec.identityOnSign) await patchSend(rec.sendId, { identity: rec.identityOnSign });
      } catch (e) { req.log.warn({ err: e }, "send record update at signature failed"); }

      await svc.postTimeline(sr, `✍️ Dokument „${docLabel(sr, key)}" unterschrieben am ${signedAt.toLocaleString("de-DE")}` + (sr.offerNumber ? ` (${sr.offerNumber})` : ""));

      recomputeStatus(sr); // sets completed + completedAt when everything is signed
      await SigningRequest.updateOne({ _id: sr._id, status: { $ne: "expired" } }, { $set: { status: sr.status, completedAt: sr.completedAt ?? null } });

      let completion: { completed: boolean } = { completed: false };
      if (sr.status === "completed") {
        const c = await runCompletion(sr);
        if (c.ran && !c.ok) return reply.status(500).send({ error: { code: "SIGNING_FAILED", message: c.error, requestId: req.id } });
        completion = { completed: true }; // also when a parallel request ran the completion
      }
      return { ok: true, status: sr.status, documents: docsView(sr), ...completion };
    } catch (err) { return err500(req, reply, "POST signing document", err); }
  });

  // ---------- the customer page ----------
  // A logged-in rep (session cookie) gets a "back to OC" link; a customer never has the cookie.
  app.get("/sign/:token", PUBLIC, async (req, reply) => {
    const internal = !!verifyToken(tokenFromHeaders(req.headers), d.authSecret);
    const html = injectHead(fs.readFileSync(d.signPageFile, "utf8").replace('data-internal-user="false"', `data-internal-user="${internal}"`));
    return reply.type("text/html; charset=utf-8").send(html);
  });

  // ---------- admin panel (legacy src/routes/admin.js, online-signing dashboard) ----------
  const ADMIN = { config: { admin: true } };
  app.get("/admin/api/signing", ADMIN, async (req, reply) => {
    try {
      // lazy-expire overdue, not-yet-completed requests
      await SigningRequest.updateMany({ status: { $in: ["sent", "opened", "partially_signed"] }, expiresAt: { $lt: new Date() } }, { $set: { status: "expired" } });
      const q0 = req.query as Record<string, unknown>;
      const status = String(q0.status || "").trim();
      const q = String(q0.q || "").trim();
      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (q) {
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [{ offerNumber: re }, { customerName: re }, { customerEmail: re }];
      }
      const docs: any[] = await SigningRequest.find(filter).sort({ createdAt: -1 }).limit(500).lean();
      const items = docs.map((sr) => ({
        token: sr.token, offerNumber: sr.offerNumber, customerType: sr.customerType, customerName: sr.customerName, customerEmail: sr.customerEmail,
        status: sr.status, signedCount: (sr.documents || []).filter((x: any) => x.status === "signed").length, docCount: (sr.documents || []).length,
        documents: (sr.documents || []).map((x: any) => ({ key: x.key, status: x.status })),
        createdAt: sr.createdAt, openedAt: sr.openedAt, completedAt: sr.completedAt, expiresAt: sr.expiresAt, bitrixEntityId: sr.bitrixEntityId,
      }));
      const counts: Record<string, number> = {};
      for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;
      return { items, counts, total: items.length };
    } catch (err) {
      req.log.error({ err }, "GET /admin/api/signing failed");
      return fail(req, reply, 500, "SIGNING_FAILED", String(err));
    }
  });

  app.post("/admin/api/signing/:token/send-bitrix", ADMIN, async (req, reply) => {
    try {
      const sr = await SigningRequest.findOne({ token: (req.params as any).token });
      if (!sr) return fail(req, reply, 404, "NOT_FOUND", "Nicht gefunden");
      return { ok: true, ...(await svc.sendSignedDocsToBitrix(sr)) };
    } catch (err) { return err500(req, reply, "POST /admin/api/signing/:token/send-bitrix", err); }
  });

  // admin view bypasses the expiry gate: signed → with signature, pending → blank
  app.get("/admin/api/signing/:token/documents/:key/pdf", ADMIN, async (req, reply) => {
    try {
      const sr: any = await SigningRequest.findOne({ token: (req.params as any).token });
      if (!sr) return fail(req, reply, 404, "NOT_FOUND", "Nicht gefunden");
      const key = String((req.params as any).key || "");
      const doc = (sr.documents || []).find((x: any) => x.key === key);
      if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Dokument nicht gefunden");
      const pdf = doc.status === "signed" ? await svc.storedOrRendered(sr, doc) : await documentPdf(d.renderer, sr, key);
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="${key}.pdf"`).send(pdf);
    } catch (err) { return err500(req, reply, "GET /admin/api/signing/:token/documents/:key/pdf", err); }
  });

  return svc;
}
