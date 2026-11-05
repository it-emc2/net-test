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
import { SigningRequest } from "../models.js";
import type { DealWrites } from "../integrations/bitrix-deal.js";
import { STAGES } from "../integrations/bitrix-deal.js";
import type { Mailer } from "../integrations/mail.js";
import { buildEmailHtml } from "../email/template.js";
import { resolveAnsprechpartner } from "./offers-write.js";
import { tokenFromHeaders, verifyToken } from "../auth.js";
import {
  DEFAULT_EXPIRY_DAYS, REQUIRED_FIELDS_BY_KEY, baseDocKey, buildGreetingLine, deriveBitrixTarget, deriveCustomerType,
  docKeysFor, docLabel, extractPrefill, hasPaymentChoice, isAhOffer, isExpired, isPartnerKey, recomputeStatus, resolveFields,
} from "../signing/fields.js";
import { documentHtml, documentPdf, signedPdf, type SigningRenderer } from "../signing/documents.js";

export interface SigningDeps {
  deals: Pick<DealWrites, "addTimelineComment" | "updateDealAfterSigning" | "ensurePartnerContact" | "getDealContactId">;
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
}

const SIGN_LINK_INTRO =
  "Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem – nutzen Sie " +
  "einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu " +
  "unterschreiben und direkt an uns zurückzuschicken:";
const PNG = /^data:image\/png;base64,/;
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

  async function signedPdfs(sr: any, docs: any[]) {
    const out: { filename: string; buffer: Buffer }[] = [];
    for (const doc of docs) out.push({ filename: pdfName(sr, doc.key), buffer: await signedPdf(d.renderer, sr, doc) });
    return out;
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
    const pdfs = await signedPdfs(sr, sr.documents);
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
      } catch (err) {
        d.log.warn({ err: msg(err) }, "signing: completion email failed");
      }
    }
    await postTimeline(sr, `✅ Alle Dokumente unterschrieben` + (sr.offerNumber ? ` (${sr.offerNumber})` : "") + `\nSignierte PDFs sind angehängt.`, toAttachments(pdfs));
    if (sr.documents.some((x: any) => isPartnerKey(x.key))) {
      try { await filePerPersonDocs(sr, pdfs); } catch (err) { d.log.warn({ err: msg(err) }, "signing: per-contact filing failed"); }
    }
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
      } catch (err) {
        d.log.warn({ err: msg(err) }, "signing: Bitrix deal stage update failed");
      }
    }
  }

  return { createRequest, sendSignedDocsToBitrix, postTimeline, complete };
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
      payload.Kundendaten = await resolveAnsprechpartner(payload.Kundendaten, req.user, d.apDefaultEmail);
      const result: any = await svc.createRequest({
        payload, offerNumber: b.offerNumber, offerType: b.offerType, dealId: b.dealId, contactId: b.contactId, baseUrl: baseUrl(req), force: !!b.force,
      });
      if (result.needsConfirm) return reply.status(409).send({ needsConfirm: true, warning: result.warning });
      const { sr, link, token, customerType, reused } = result;
      const prefill = sr.prefill || {};
      if (b.via === "post" && sr.via !== "post") { sr.via = "post"; await sr.save(); }

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
      for (const x of sr.documents) documents.push({ key: x.key, filename: pdfName(sr, x.key), base64: (await signedPdf(d.renderer, sr, x)).toString("base64") });
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
      fail(req, reply, 410, "EXPIRED", "Dieser Link ist abgelaufen");
      return null;
    }
    return sr;
  }

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

  app.post("/api/signing/:token/documents/:key", PUBLIC, async (req, reply) => {
    try {
      const sr = await loadByToken(req, reply);
      if (!sr) return reply;
      const b = (req.body ?? {}) as any;
      const key = String((req.params as any).key || "");
      const doc = (sr.documents || []).find((x: any) => x.key === key);
      if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Dokument nicht gefunden");
      if (doc.status === "signed") return fail(req, reply, 409, "ALREADY_SIGNED", "Dokument wurde bereits unterschrieben");
      const sig = String(b.signatureImage || "");
      if (!PNG.test(sig)) return fail(req, reply, 400, "BAD_REQUEST", "Unterschrift fehlt");

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
        if (bevName && !PNG.test(String(extraFields.bevollmaechtigterSignature || ""))) {
          return fail(req, reply, 400, "BAD_REQUEST", "Bitte lassen Sie den/die Bevollmächtigte/n unterschreiben");
        }
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
      if (["vollmacht", "abtretung", "abtretung_ah"].includes(baseDocKey(key))) {
        sr.prefill = sr.prefill || {};
        let touchedPrefill = false;
        for (const k of partnerDoc ? ["street", "postalCode", "city", "phone"] : PREFILL_CARRY_KEYS) {
          const v = String(editedFields[k] || "").trim();
          if (v) { sr.prefill[k] = v; touchedPrefill = true; }
        }
        if (touchedPrefill) sr.markModified("prefill");
        sr.payloadSnapshot = sr.payloadSnapshot || {};
        sr.payloadSnapshot.Kundendaten = sr.payloadSnapshot.Kundendaten || {};
        let touchedSnapshot = false;
        const carryMap = partnerDoc ? PARTNER_CARRY : Object.fromEntries(KUNDENDATEN_CARRY_KEYS.map((k) => [k, k]));
        for (const [from, to] of Object.entries(carryMap)) {
          const v = String(editedFields[from] || "").trim();
          if (v) { sr.payloadSnapshot.Kundendaten[to] = v; touchedSnapshot = true; }
        }
        if (touchedSnapshot) sr.markModified("payloadSnapshot");
      }

      doc.signatureImage = sig;
      doc.editedFields = editedFields;
      doc.extraFields = extraFields;
      doc.place = String(b.place || sr.prefill?.city || "").trim();
      doc.signedAt = new Date();
      doc.signedIp = String(req.headers["x-forwarded-for"] || "").split(",")[0]!.trim() || req.ip || "";
      doc.userAgent = String(req.headers["user-agent"] || "").slice(0, 300);
      doc.status = "signed";

      await svc.postTimeline(sr, `✍️ Dokument „${docLabel(sr, key)}" unterschrieben am ${doc.signedAt.toLocaleString("de-DE")}` + (sr.offerNumber ? ` (${sr.offerNumber})` : ""));

      const prevStatus = sr.status;
      recomputeStatus(sr);
      let completion: { completed: boolean } = { completed: false };
      if (sr.status === "completed" && prevStatus !== "completed") {
        await svc.complete(sr);
        completion = { completed: true };
      }
      await sr.save();
      return { ok: true, status: sr.status, documents: sr.documents.map((x: any) => ({ key: x.key, status: x.status })), ...completion };
    } catch (err) { return err500(req, reply, "POST signing document", err); }
  });

  // ---------- the customer page ----------
  // A logged-in rep (session cookie) gets a "back to OC" link; a customer never has the cookie.
  app.get("/sign/:token", PUBLIC, async (req, reply) => {
    const internal = !!verifyToken(tokenFromHeaders(req.headers), d.authSecret);
    const html = fs.readFileSync(d.signPageFile, "utf8").replace('data-internal-user="false"', `data-internal-user="${internal}"`);
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
      const pdf = doc.status === "signed" ? await signedPdf(d.renderer, sr, doc) : await documentPdf(d.renderer, sr, key);
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", `inline; filename="${key}.pdf"`).send(pdf);
    } catch (err) { return err500(req, reply, "GET /admin/api/signing/:token/documents/:key/pdf", err); }
  });

  return svc;
}
