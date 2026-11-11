// Letters by post — port of legacy src/routes/post.js (/api/post/send, /config, /balance).
// The offer PDF IS the letter (address in the DIN-5008 window); attachments ride along as
// base64. Same request to onlinebrief24, same 24 h lock per deal, same Bitrix link + timeline —
// proven by the contract test against an OB24 stub and the recording Bitrix stub.
// Intended difference (security): error responses no longer echo `debug` (legacy returned the
// raw request incl. recipient and file contents); message, stage, details and status unchanged.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, type PDFPage } from "pdf-lib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildInternalNoteComment, type DealWrites } from "../integrations/bitrix-deal.js";
import type { Onlinebrief24 } from "../integrations/onlinebrief24.js";
import { PostalSend } from "../models.js";
import { claimSendLock } from "../email/send-lock.js";
import { randomUUID } from "node:crypto";
import {
  OfferChangedError, SEND_ID, assertUnchangedSinceSent, beginSend, finishSend, lastSentOffer, offerChangedBody, patchSend, readSendFile, recordStep,
  storeSendFile, type SendFile, type StepName, type StepStatus,
} from "../sends/store.js";
import { offerIdentity } from "../sends/identity.js";

const RESEND_BLOCK_MS = 24 * 60 * 60 * 1000;
const IN_FLIGHT_MS = 2 * 60 * 1000;
const DEFAULT_SPECIFICATION = { color: "4", mode: "duplex", shipping: "national" };
const MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Postal only; the flyer goes by e-mail only (and is landscape, which OB24 rejects). */
const STATIC_POSTAL_ATTACHMENTS: Record<string, string> = { abtretung: "Abtretungserklärung.pdf", vollmacht: "Vollmacht.pdf" };
const A4 = { width: 595.28, height: 841.89 };
const A4_TOLERANCE = 3;

class StagedError extends Error { status?: number; payload?: unknown; stage?: string }
const staged = (err: unknown, stage: string): StagedError => {
  const e = (err instanceof Error ? err : new Error("Unknown postal error")) as StagedError;
  e.stage = stage;
  return e;
};
const md5 = (v: string) => createHash("md5").update(v).digest("hex");

const isA4Portrait = (p: PDFPage) => {
  const { width, height } = p.getSize();
  return Math.abs(width - A4.width) <= A4_TOLERANCE && Math.abs(height - A4.height) <= A4_TOLERANCE && p.getRotation().angle % 360 === 0;
};

/** OB24 accepts only A4 portrait: scale to fit, centre horizontally, anchor at the top (address window). */
export async function normalizeToA4(base64: string, label: string): Promise<string> {
  let source: PDFDocument;
  try { source = await PDFDocument.load(Buffer.from(base64, "base64")); }
  catch { throw new Error(`${label} konnte nicht gelesen werden (beschädigt oder passwortgeschützt).`); }
  const pages = source.getPages();
  if (pages.every(isA4Portrait)) return base64;
  const target = await PDFDocument.create();
  const embedded = await target.embedPages(pages);
  embedded.forEach((ep, i) => {
    const { width, height } = pages[i]!.getSize();
    const scale = Math.min(A4.width / width, A4.height / height);
    target.addPage([A4.width, A4.height]).drawPage(ep, { xScale: scale, yScale: scale, x: (A4.width - width * scale) / 2, y: A4.height - height * scale });
  });
  return Buffer.from(await target.save()).toString("base64");
}

function assertPdfSize(base64: string, label: string) {
  const bytes = Math.floor((String(base64 || "").length * 3) / 4);
  if (bytes > MAX_PDF_BYTES) throw new Error(`${label} ist größer als 50 MB (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
}

function normalizeRecipientAddress(r: any = {}) {
  const name = String(r.name || "").trim(), street = String(r.street || "").trim();
  const zipCode = String(r.zipCode || r.zip || r.postalCode || "").trim(), city = String(r.city || "").trim();
  if (!name || !street || !zipCode || !city) throw new Error("Recipient address is incomplete. Name, street, zip code and city are required.");
}

export function buildBitrixPostalComment(a: { recipient: any; offerNumber: string; printjobId: unknown; printjob: any; mode: string; attachmentNames: string[]; docWarnings: unknown; letterKind: unknown }, now = new Date()) {
  const item = Array.isArray(a.printjob?.items) ? a.printjob.items[0] : null;
  const statusText = a.printjob?.status || item?.status || "-";
  const pages = item?.pages ? `${item.pages} Seiten` : "-";
  const lines = [
    a.letterKind === "signed" ? "✅📬 Unterschriebene Unterlagen per Post versendet" : "📬 Angebot per Post versendet",
    "",
    `👤 Kunde: ${String(a.recipient?.name || "-").trim() || "-"}`,
    `📄 Angebot: ${String(a.offerNumber || "-").trim() || "-"}`,
    `🆔 onlinebrief24: ${String(a.printjobId || "-").trim() || "-"}${a.mode === "test" ? " (Testmodus – liegt im Warenkorb)" : ""}`,
    `📦 Status: ${statusText} · ${pages}`,
    `📎 Anhänge: ${(a.attachmentNames || []).join(", ") || "-"}`,
    `🕒 ${now.toLocaleString("de-DE")}`,
  ];
  if (Array.isArray(a.docWarnings) && a.docWarnings.length) lines.push("", "⚠️ Nicht erzeugt:", ...a.docWarnings.map((w) => `• ${w}`));
  return lines.join("\n");
}

export interface PostDeps { ob24: Onlinebrief24; deals: DealWrites; assetsDir: string }

export async function registerPost(app: FastifyInstance, d: PostDeps) {
  const failSend = (req: FastifyRequest, reply: FastifyReply, status: number, message: string, extra: Record<string, unknown>) =>
    reply.status(status).send({ ok: false, error: { code: status === 409 ? String(extra.code) : status === 400 ? "BAD_REQUEST" : "POST_FAILED", message, requestId: req.id }, ...extra });

  async function normalizeRequestedAttachments(raw: unknown) {
    const out: Array<{ type: string; id?: string; filename: string; base64: string }> = [];
    for (const item of (Array.isArray(raw) ? raw : []) as any[]) {
      const type = String(item?.type || "").trim();
      if (type === "static") {
        const id = String(item?.id || "").trim();
        const filename = Object.hasOwn(STATIC_POSTAL_ATTACHMENTS, id) ? STATIC_POSTAL_ATTACHMENTS[id] : undefined;
        if (!filename) throw new Error(`Unknown static postal attachment id: ${item?.id}`);
        const abs = join(d.assetsDir, "Email", filename);
        if (!existsSync(abs)) throw new Error(`Static postal attachment not found: ${filename}`);
        out.push({ type, id, filename, base64: (await readFile(abs)).toString("base64") });
      } else if (type === "upload") {
        const filename = String(item?.filename || "").trim(), base64 = String(item?.base64 || item?.content || "").trim();
        if (!filename || !base64) continue;
        if (!/\.pdf$/i.test(filename)) throw new Error(`Only PDF upload attachments are allowed: ${filename}`);
        out.push({ type, filename, base64 });
      }
    }
    return out;
  }

  app.post("/api/post/send", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    // ---- send record (ADR 023), same rules as the e-mail send ----
    const clientSendId = SEND_ID.test(String(b.sendId || "")) ? String(b.sendId) : "";
    const sendId = clientSendId || randomUUID();
    let recordOpen = false, sendError = "";
    const rec = async (what: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { req.log.warn({ err: e, sendId }, `send record: ${what} failed`); } };
    const step = (name: StepName, status: StepStatus, error = "") => rec(`step ${name}`, () => recordStep(sendId, name, status, error));
    const keep = (role: SendFile["role"], filename: string, base64: string) => rec(`file ${role}`, () => storeSendFile(sendId, role, filename, Buffer.from(base64, "base64")));
    try {
      const { recipient, auftragId, document, specification, dispatchDate, registered, attachments, bitrixDocs, docWarnings, dealIdOverride, meta, dealId, bitrixEntityType, internalNote } = b;
      const mainFilename = String(document?.filename || "").trim() || "Angebot.pdf";
      let mainBase64 = String(document?.base64 || document?.content || "").trim();
      if (!mainBase64) return failSend(req, reply, 400, "Main document base64 is required.", {});
      try { normalizeRecipientAddress(recipient || {}); } catch (err) { throw staged(err, "normalize_recipient"); }
      const offerNumber = String(meta?.offerNumber || b.offerNumber || "").trim() || mainFilename.replace(/\.pdf$/i, "");

      const offerLetter = b.letterKind !== "signed"; // "signed" = the signed documents, a second letter by design
      try {
        const begun = await beginSend(sendId, {
          channel: "post", by: String(req.user?.email || ""), dealId: String(meta?.dealId ?? dealId ?? auftragId ?? ""), offerNumber,
          offerType: String(meta?.offerType || b.payload?.activeOffer || ""), to: [recipient?.name, recipient?.street, recipient?.zipCode || recipient?.zip || recipient?.postalCode, recipient?.city].filter(Boolean).join(", "),
          subject: offerLetter ? "Angebot per Post" : "Unterschriebene Unterlagen per Post", recipient: recipient ?? null,
        });
        if (begun.state === "running") return failSend(req, reply, 409, "Dieser Postversand läuft bereits. Bitte warten Sie einen Moment.", { code: "SEND_IN_PROGRESS", sendId });
        if (begun.state === "done") return { ...(begun.result as object), duplicate: true };
        recordOpen = true;
      } catch (e) { req.log.warn({ err: e, sendId }, "send record: begin failed — sending without record"); }

      // Decision C: the offer was sent before (e.g. by e-mail, and the customer now wants it by
      // post). Unchanged → the letter is the EXACT PDF the customer already has. Changed →
      // refused ("Neue Version"), unless the user chose to post the original as it was sent.
      let resendOf: any = null;
      if (offerLetter && (b.payload || b.useSentOriginal === true)) {
        try {
          const prior = b.useSentOriginal === true ? await lastSentOffer(offerNumber) : await assertUnchangedSinceSent(offerNumber, b.payload);
          const original = (prior?.files as SendFile[] | undefined)?.find((f) => f.role === "offer" || f.role === "letter");
          const stored = original ? await readSendFile(original.fileId) : null;
          if (prior && stored) { mainBase64 = stored.toString("base64"); resendOf = prior; }
        } catch (e) {
          if (e instanceof OfferChangedError) { sendError = e.message; return reply.status(409).send({ ok: false, ...offerChangedBody(e, req.id) }); }
          req.log.warn({ err: e, sendId }, "sent-offer check failed — continuing");
        }
      }
      if (recordOpen) await rec("snapshot", () => patchSend(sendId, {
        identity: !offerLetter ? null : resendOf ? resendOf.identity : b.payload ? offerIdentity(b.payload, offerNumber) : null,
        resendOf: resendOf?.sendId || "", total: resendOf?.total ?? null, selfPayAmount: resendOf?.selfPayAmount ?? null,
      }));

      let requested;
      try { requested = await normalizeRequestedAttachments(attachments); } catch (err) { throw staged(err, "normalize_attachments"); }
      let letterBase64: string;
      try {
        assertPdfSize(mainBase64, mainFilename);
        for (const att of requested) assertPdfSize(att.base64, att.filename);
        letterBase64 = await normalizeToA4(mainBase64, mainFilename);
        for (const att of requested) att.base64 = await normalizeToA4(att.base64, att.filename);
      } catch (err) { throw staged(err, "normalize_pdf"); }

      const letter: Record<string, unknown> = {
        base64_file: letterBase64, base64_file_checksum: md5(letterBase64), filename_original: mainFilename,
        specification: { ...DEFAULT_SPECIFICATION, ...(specification && typeof specification === "object" ? specification : {}) },
        notice: [offerNumber, auftragId ? `Auftrag ${auftragId}` : ""].filter(Boolean).join(" / ").slice(0, 255),
      };
      if (requested.length) letter.base64_attachments = requested.map((i) => i.base64);
      if (dispatchDate) letter.dispatch_date = String(dispatchDate).trim();
      if (registered === "r1" || registered === "r2") letter.registered = registered;
      const { mode } = d.ob24.config();

      const guardDealId = String(meta?.dealId ?? dealId ?? auftragId ?? "").trim();
      if (guardDealId) {
        const existing = await claimSendLock(PostalSend, guardDealId, b.forceResend === true, { inFlightMs: IN_FLIGHT_MS, resendBlockMs: RESEND_BLOCK_MS });
        if (existing) {
          const inFlight = existing.inFlightUntil && new Date(existing.inFlightUntil) > new Date();
          req.log.warn({ dealId: guardDealId, offerNumber, inFlight }, "duplicate letter blocked");
          return failSend(req, reply, 409, inFlight ? "Für diesen Deal läuft gerade bereits ein Postversand." : `Für diesen Deal wurde bereits ein Brief versendet (${existing.offerNumber || "-"}).`, {
            code: inFlight ? "SEND_IN_PROGRESS" : "ALREADY_SENT", lastSentAt: existing.sentAt || null, lastOfferNumber: existing.offerNumber || "", lastPrintjobId: existing.printjobId || "",
          });
        }
      }

      let printjob: any;
      try { printjob = (await d.ob24.call("/printjobs", { method: "POST", body: { letter } }))?.data || null; }
      catch (err) {
        if (guardDealId) await PostalSend.updateOne({ dealId: guardDealId }, { $set: { inFlightUntil: null } }).catch(() => {});
        if (recordOpen) await step("provider", "failed", (err as Error)?.message || String(err));
        throw staged(err, "submit_printjob");
      }
      if (recordOpen) {
        await step("provider", "ok");
        await keep("letter", mainFilename, letterBase64); // exactly what was handed to the printer
        for (const att of requested) await keep("upload", att.filename, att.base64);
      }
      if (guardDealId) {
        await PostalSend.updateOne({ dealId: guardDealId }, { $set: { inFlightUntil: null, sentAt: new Date(), offerNumber, printjobId: String(printjob?.id || "") } })
          .catch((e) => req.log.warn({ err: e }, "PostalSend record failed"));
      }
      if (dealIdOverride?.confirmedBy) req.log.warn({ confirmedBy: dealIdOverride.confirmedBy, offerNumber }, "letter sent without dealId (password-released)");
      const printjobId = printjob?.id;
      if (!printjobId) throw staged(new Error("onlinebrief24 did not return a printjob id."), "submit_printjob_result");

      const attachmentNames = [mainFilename, ...requested.map((i) => i.filename)];
      const timelineEntityId = meta?.dealId ?? dealId ?? auftragId ?? null;
      let bitrixResult: unknown = null;
      try {
        const extraDocs = (Array.isArray(bitrixDocs) ? bitrixDocs : []).filter((x: any) => x?.filename && x?.base64);
        const comment = buildBitrixPostalComment({
          recipient, offerNumber, printjobId, printjob, mode, attachmentNames: [...attachmentNames, ...extraDocs.map((x: any) => x.filename)], docWarnings, letterKind: b.letterKind,
        });
        const bitrixAttachments = [
          { filename: mainFilename, base64: mainBase64 },
          ...requested.filter((a) => a?.filename && a?.base64).map((a) => ({ filename: a.filename, base64: a.base64 })),
          ...extraDocs.map((x: any) => ({ filename: x.filename, base64: x.base64 })),
        ];
        const entityType = String(bitrixEntityType || meta?.bitrixEntityType || "deal").trim() || "deal";
        if (recordOpen) {
          for (const x of extraDocs) await keep("bitrixDoc", x.filename, x.base64);
          if (timelineEntityId) await rec("bitrixCall", () => patchSend(sendId, { bitrixCall: { target: { entityType, entityId: String(timelineEntityId) }, comment, internalNote: String(internalNote || "") } }));
        }
        if (timelineEntityId) {
          if (entityType === "deal") await d.deals.setDealOfferLink(timelineEntityId, offerNumber);
          bitrixResult = await d.deals.addTimelineComment({ entityType, entityId: timelineEntityId, comment, attachments: bitrixAttachments });
          const note = buildInternalNoteComment(internalNote);
          if (note) await d.deals.addTimelineComment({ entityType, entityId: timelineEntityId, comment: note });
        } else bitrixResult = { skipped: true, reason: "missing entityId" };
      } catch (bitrixError) {
        req.log.warn({ err: bitrixError }, "Bitrix timeline comment failed");
        bitrixResult = { ok: false, error: (bitrixError as Error)?.message || "Bitrix timeline comment failed" };
      }
      req.log.info({ offerNumber, printjobId, mode, attachments: requested.length, sendId }, "letter submitted");
      const result = {
        ok: true, provider: "onlinebrief24", mode, printjobId, status: printjob?.status || null, attachmentCount: requested.length, attachmentNames, bitrix: bitrixResult, document: printjob,
        ...(clientSendId ? { sendId } : {}),
        ...(resendOf ? { resendOf: { sendId: resendOf.sendId, channel: resendOf.channel, at: resendOf.finishedAt ?? resendOf.startedAt, to: resendOf.to || "" } } : {}),
      };
      if (recordOpen) {
        const br = bitrixResult as { ok?: boolean; skipped?: boolean; error?: string; reason?: string } | null;
        await step("bitrix", br?.skipped ? "skipped" : br?.ok === false ? "failed" : "ok", br?.ok === false ? String(br.error || "") : br?.skipped ? String(br.reason || "") : "");
        await rec("finish", () => finishSend(sendId, "done", { result }));
        recordOpen = false;
      }
      return result;
    } catch (error) {
      const e = error as StagedError;
      sendError = e?.message || String(error);
      req.log.error({ err: e, stage: e?.stage }, "letter send failed");
      return failSend(req, reply, e?.status || 500, e?.message || "Postversand fehlgeschlagen.", { details: e?.payload ?? null, stage: e?.stage || null });
    } finally {
      if (recordOpen) await rec("finish", () => finishSend(sendId, "failed", { error: (sendError || "abgebrochen").slice(0, 500) }));
    }
  });

  app.get("/api/post/config", async (req, reply) => {
    try { return { ok: true, mode: d.ob24.config().mode }; }
    catch (error) { return reply.status(500).send({ ok: false, error: { code: "CONFIG", message: (error as Error)?.message || "Konfiguration unvollständig.", requestId: req.id } }); }
  });

  app.get("/api/post/balance", async (req, reply) => {
    try { return { ok: true, ...((await d.ob24.call("/balance", { method: "GET" }))?.data || {}) }; }
    catch (error) { return reply.status((error as StagedError)?.status || 500).send({ ok: false, error: { code: "POST_FAILED", message: (error as Error)?.message || "Balance-Abfrage fehlgeschlagen.", requestId: req.id } }); }
  });
}
