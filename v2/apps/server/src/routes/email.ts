// Offer email — port of legacy src/routes/email.js (POST /api/email/send-offer, GET /smtp-test).
// Same mail (from/reply-to/to/cc/subject/text/html/attachments incl. inline signature), same
// 24 h duplicate lock per deal, same EmailLog/UserActionLog/Bitrix timeline side effects —
// proven by the contract test against a local SMTP server and the recording Bitrix stub.
// Product-image routes (/product-image-list, /preview-product-image-pdf) move with Phase 5.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import dns from "node:dns";
import net from "node:net";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import type { BusinessConfig } from "../platform/business-config.js";
import { buildInternalNoteComment, type DealWrites } from "../integrations/bitrix-deal.js";
import type { Mailer } from "../integrations/mail.js";
import { EmailLog, EmailSend, UserActionLog } from "../platform/models.js";
import { resolveAnsprechpartner } from "./offers-write.js";
import { buildEmailHtml } from "../email/template.js";
import {
  DEFAULT_CONTACT_NAME, buildBitrixEmailComment, buildEmailTextBody, describeOfferChanges, getBitrixTargetFromPayload,
  getPresetAttachments, safeOfferFilename, sha256,
} from "../email/builders.js";
import { EMAIL_IN_FLIGHT_MS, EMAIL_RESEND_BLOCK_MS, claimSendLock } from "../email/send-lock.js";
import type { OfferDocuments, SigningPort } from "../email/ports.js";
import type { EnsureSentOffer } from "../modules/sends/index.js";
import {
  OfferChangedError, SEND_ID, assertUnchangedSinceSent, beginSend, finishSend, offerChangedBody, patchSend, recordStep, storeSendFile,
  type SendFile, type StepName, type StepStatus,
} from "../modules/sends/index.js";
import { offerIdentity } from "../modules/sends/index.js";

export interface EmailDeps {
  mailer: Mailer; deals: DealWrites; documents: OfferDocuments; signing: SigningPort; businessConfig: BusinessConfig;
  assetsDir: string; publicBaseUrl?: string | undefined; apDefaultEmail: string; smtpTestPort: number; smtpHost?: string | undefined;
  /** makes the locked offer exist once a send went out (price pinned for signing) — only for sends with a sendId */
  ensureSentOffer?: EnsureSentOffer | undefined;
}

const TRUE = ["1", "true", "on", "yes"];
const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });
const FILE_FIELDS = { attachments: 10, bitrixDocs: 15, editedDocx: 1 } as const;
interface Upload { filename: string; content: Buffer }

export async function registerEmail(app: FastifyInstance, d: EmailDeps) {
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 26, fieldSize: 25 * 1024 * 1024 } });

  app.get("/api/email/smtp-test", async (req, reply) => {
    const host = d.smtpHost, port = d.smtpTestPort;
    if (!host) return reply.status(500).send({ ok: false, host, port, msg: "SMTP_HOST not configured" });
    return new Promise((resolve) => {
      dns.lookup(host, { all: true }, (err, addrs) => {
        if (err) return resolve(reply.status(500).send({ ok: false, host, port, msg: err.message }));
        const socket = new net.Socket();
        socket.setTimeout(8000);
        socket.on("connect", () => { socket.destroy(); resolve({ ok: true, host, port, resolved: addrs, msg: "TCP connect OK" }); });
        socket.on("timeout", () => { socket.destroy(); resolve(reply.status(504).send({ ok: false, host, port, resolved: addrs, msg: "TCP timeout" })); });
        socket.on("error", (e: NodeJS.ErrnoException) => resolve(reply.status(500).send({ ok: false, host, port, resolved: addrs, msg: e.message, code: e.code })));
        socket.connect({ host, port, family: 4 });
      });
    });
  });

  app.post("/api/email/send-offer", async (req, reply) => {
    // ---- read multipart (fields as strings, files into memory; legacy multer → temp files) ----
    const fields: Record<string, string> = {};
    const files: Record<keyof typeof FILE_FIELDS, Upload[]> = { attachments: [], bitrixDocs: [], editedDocx: [] };
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          const key = part.fieldname as keyof typeof FILE_FIELDS;
          const content = await part.toBuffer();
          if (Object.hasOwn(FILE_FIELDS, key) && files[key].length < FILE_FIELDS[key]) files[key].push({ filename: part.filename, content });
        } else fields[part.fieldname] = String(part.value ?? "");
      }
    } else Object.assign(fields, (req.body ?? {}) as Record<string, string>);

    let lockedDealId = "";
    // ---- send record (ADR 023): one record per send; the same sendId never sends twice ----
    const clientSendId = SEND_ID.test(String(fields.sendId || "")) ? String(fields.sendId) : "";
    const sendId = clientSendId || randomUUID();
    let recordOpen = false, sendError = "";
    // the record must never break a send: its own failures are logged only
    const rec = async (what: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { req.log.warn({ err: e, sendId }, `send record: ${what} failed`); } };
    const step = (name: StepName, status: StepStatus, error = "") => rec(`step ${name}`, () => recordStep(sendId, name, status, error));
    const keep = (role: SendFile["role"], filename: string, content: Buffer) => rec(`file ${role}`, () => storeSendFile(sendId, role, filename, content));
    try {
      const to = String(fields.to || "").trim();
      const cc = String(fields.cc || "").trim();
      const subject = String(fields.subject || "").trim() || "Angebot";
      let body = String(fields.body || "");
      const offerNumber = String(fields.offerNumber || "");
      const offerType = String(fields.offerType || "");
      const bitrixOnly = TRUE.includes(String(fields.bitrixOnly || "").toLowerCase());
      if (!to && !bitrixOnly) return fail(req, reply, 400, "BAD_REQUEST", "Missing 'to'");

      let payload: any = {};
      try { payload = JSON.parse(fields.payload || "{}"); } catch { return fail(req, reply, 400, "BAD_REQUEST", "Invalid payload JSON"); }
      const dealId = String(fields.dealId || "").trim();
      const contactId = String(fields.contactId || "").trim();
      if (dealId) payload.bitrixDealId = dealId;
      if (contactId) payload.bitrixContactId = contactId;

      try {
        const begun = await beginSend(sendId, {
          channel: bitrixOnly ? "bitrix" : "email", by: String(req.user?.email || ""), dealId, contactId,
          offerNumber: String(payload?.offerNumber || offerNumber), offerType: String(payload?.activeOffer || offerType), to, cc, subject,
        });
        if (begun.state === "running") return fail(req, reply, 409, "SEND_IN_PROGRESS", "Dieser Versand läuft bereits. Bitte warten Sie einen Moment.", { sendId });
        if (begun.state === "done") {
          req.log.info({ sendId }, "repeated sendId — stored answer returned, nothing sent again");
          return { ...(begun.result as object), duplicate: true };
        }
        recordOpen = true;
      } catch (e) { req.log.warn({ err: e, sendId }, "send record: begin failed — sending without record"); }

      // Decision C: an offer that was already sent cannot go out again with different content
      // under the same number — "Neue Version" gives it a new one.
      // identity of the offer as the client sent it — taken BEFORE the server resolves the
      // Ansprechpartner and the pricing/rendering code touches the payload, so that the same
      // offer sent or saved again compares equal
      const identity = offerIdentity(payload, offerNumber);
      const sentPayload = clientSendId ? structuredClone(payload) : null; // as the client sent it
      let resendOf = "";
      try {
        const prior = await assertUnchangedSinceSent(String(payload?.offerNumber || offerNumber), payload);
        if (prior) resendOf = prior.sendId;
      } catch (e) {
        if (e instanceof OfferChangedError) { sendError = e.message; return reply.status(409).send(offerChangedBody(e, req.id)); }
        req.log.warn({ err: e, sendId }, "sent-offer check failed — continuing");
      }

      if (dealId && !bitrixOnly) {
        const existing = await claimSendLock(EmailSend, dealId, ["1", "true"].includes(String(fields.forceResend || "")), { inFlightMs: EMAIL_IN_FLIGHT_MS, resendBlockMs: EMAIL_RESEND_BLOCK_MS });
        if (existing) {
          const inFlight = existing.inFlightUntil && new Date(existing.inFlightUntil) > new Date();
          req.log.warn({ dealId, offerNumber, inFlight }, "duplicate offer email blocked");
          return fail(req, reply, 409, inFlight ? "SEND_IN_PROGRESS" : "ALREADY_SENT",
            inFlight ? "Für diesen Deal wird gerade bereits eine Angebots-E-Mail versendet."
              : `Für diesen Deal wurde bereits eine Angebots-E-Mail versendet (${existing.offerNumber || "-"}).`,
            { lastSentAt: existing.sentAt || null, lastOfferNumber: existing.offerNumber || "" });
        }
        lockedDealId = dealId;
      }

      // Ansprechpartner re-derived server-side from the selected email (never a spoofed name)
      payload.Kundendaten = await resolveAnsprechpartner(payload.Kundendaten, req.user, d.apDefaultEmail);

      const excludePreset = new Set<string>();
      try { for (const id of (fields.excludePreset ? JSON.parse(fields.excludePreset) : []) || []) excludePreset.add(String(id)); } catch { /* ignore */ }
      const excludeBitrixPresets = TRUE.includes(String(fields.excludeBitrixPresets || "").toLowerCase());
      const isSelbstzahler = String(payload?.Kundendaten?.payer || "").toLowerCase().includes("selbstzahler");

      // ---- online-signing link ({{SIGN_LINK}} placeholder) ----
      // Decision B (owner 2026-11-11): a hand-edited offer gets NO online-signing link — the
      // signing page shows the standard rendering, so the customer would sign a document
      // without the edits (audit signing S-02). The whole sentence with the link is dropped.
      const handEdited = !!files.editedDocx[0];
      if (handEdited && !bitrixOnly) body = body.split(/\r?\n/).filter((line) => !line.includes("{{SIGN_LINK}}")).join("\n").replace(/\n{3,}/g, "\n\n");
      else if (bitrixOnly) body = body.split("{{SIGN_LINK}}").join("");
      else try {
        const baseUrl = String(d.publicBaseUrl || "").trim() || `${req.protocol}://${req.headers.host}`;
        const { link, token: signingToken } = await d.signing.createRequest({ payload, offerNumber, offerType, dealId, contactId, baseUrl, force: true });
        if (recordOpen && signingToken) await rec("signingToken", () => patchSend(sendId, { signingToken }));
        body = body.includes("{{SIGN_LINK}}") ? body.split("{{SIGN_LINK}}").join(link) : body;
      } catch (signErr) {
        req.log.warn({ err: signErr }, "signing link creation failed");
        body = body.split("{{SIGN_LINK}}").join("");
      }

      // ---- offer PDF (hand-edited DOCX wins) ----
      const editedDocx = files.editedDocx[0] ?? null;
      let pdfBuf: Buffer, offerComputed: any, offerData: any;
      if (editedDocx) {
        if (!/\.docx$/i.test(editedDocx.filename || "")) return fail(req, reply, 400, "BAD_REQUEST", "editedDocx must be a .docx file");
        pdfBuf = await d.documents.convertDocxToPdf(editedDocx.content);
        ({ computed: offerComputed, data: offerData } = await d.documents.getOfferRenderData(payload || {}));
      } else {
        ({ pdfBuffer: pdfBuf, computed: offerComputed, data: offerData } = await d.documents.renderOfferPdf(payload || {}));
      }
      const angebotFilename = safeOfferFilename(payload?.offerNumber || offerNumber);
      if (recordOpen) {
        await step("pdf", "ok");
        // the exact documents that leave the house, and the offer and price as sent
        await keep("offer", angebotFilename, pdfBuf);
        if (editedDocx) await keep("editedDocx", angebotFilename.replace(/\.pdf$/i, ".docx"), editedDocx.content);
        const isAhOffer = offerType.toLowerCase() === "ah";
        const payloadJson = JSON.stringify(payload ?? null);
        await rec("snapshot", () => patchSend(sendId, {
          // very large payloads (many sketches) would exceed the document limit — the stored PDF is the record then
          payload: payloadJson.length <= 8 * 1024 * 1024 ? payload : null, payloadOmitted: payloadJson.length > 8 * 1024 * 1024,
          pricing: offerComputed ?? null, identity, resendOf,
          total: isAhOffer ? Number(offerData?.AhGesamtNum) || 0 : Number(offerComputed?.total) || 0,
          selfPayAmount: isAhOffer ? Number(offerData?.AhEigenanteilNum) || 0 : Number(offerComputed?.selfPayAmount) || 0,
        }));
      }
      const sentBy = String(req.user?.email || "");
      const editedDocxInfo = editedDocx ? { name: editedDocx.filename || "", sha256: sha256(editedDocx.content), size: editedDocx.content.length } : null;
      const offerChanges = describeOfferChanges({ overrides: payload?.offerOverrides, editedDocx: editedDocxInfo, user: sentBy });

      // ---- optional product image PDF (best-effort) ----
      let productImageBuf: Buffer | null = null, productImageFilename: string | null = null;
      if (TRUE.includes(String(fields.includeProductImages || "").toLowerCase())) {
        try {
          const adminSkip = ((d.businessConfig.get("PRODUCT_IMAGE_SKIP_IDS") as unknown[]) ?? []).map(String);
          const excludeIds = new Set([...JSON.parse(fields.excludeProductImageIds || "[]").map(String), ...adminSkip]);
          productImageBuf = await d.documents.productImagePdf(payload, offerComputed || {}, { excludeIds, customImages: JSON.parse(fields.productCustomImageData || "{}") });
          if (productImageBuf) productImageFilename = `Produktbilder_${String(payload?.offerNumber || offerNumber || "Angebot").replace(/[^\w\-]+/g, "_")}.pdf`;
        } catch (imgErr) { req.log.warn({ err: imgErr }, "product image PDF failed"); }
      }

      // ---- attachments ----
      const signatureCid = "emc2-signature-picture";
      const signaturePath = join(d.assetsDir, "signaturepicture.png");
      const presets = getPresetAttachments(d.assetsDir, excludePreset, isSelbstzahler, offerType);
      const uploads = files.attachments.map((f) => ({ filename: f.filename, content: f.content }));
      if (recordOpen) {
        if (productImageBuf && productImageFilename) await keep("productImages", productImageFilename, productImageBuf);
        for (const u of uploads) await keep("upload", u.filename, u.content);
        for (const f of files.bitrixDocs) await keep("bitrixDoc", f.filename, f.content);
        if (!excludeBitrixPresets) for (const p of presets) await rec("file preset", async () => { await storeSendFile(sendId, "preset", p.filename, await readFile(p.path)); });
      }
      const inline = existsSync(signaturePath) ? [{ filename: "signaturepicture.png", path: signaturePath, cid: signatureCid }] : [];
      const mailAttachments = [
        { filename: angebotFilename, content: pdfBuf, contentType: "application/pdf" },
        ...(productImageBuf && productImageFilename ? [{ filename: productImageFilename, content: productImageBuf, contentType: "application/pdf" }] : []),
        ...presets, ...uploads, ...inline,
      ];
      const attachmentNames = [angebotFilename, ...(productImageFilename ? [productImageFilename] : []), ...presets.map((a) => a.filename), ...uploads.map((a) => a.filename)];
      const bitrixAttachments = [
        { filename: angebotFilename, base64: pdfBuf.toString("base64") },
        ...(productImageBuf && productImageFilename ? [{ filename: productImageFilename, base64: productImageBuf.toString("base64") }] : []),
        ...(editedDocx ? [{ filename: angebotFilename.replace(/\.pdf$/i, ".docx"), base64: editedDocx.content.toString("base64") }] : []),
        ...files.bitrixDocs.map((f) => ({ filename: f.filename, base64: f.content.toString("base64") })),
        ...(excludeBitrixPresets ? [] : await Promise.all(presets.map(async (p) => ({ filename: p.filename, base64: (await readFile(p.path)).toString("base64") })))),
        ...uploads.map((u) => ({ filename: u.filename, base64: u.content.toString("base64") })),
      ];
      const contactName = String(payload?.Kundendaten?.emc2_contact || "").trim() || DEFAULT_CONTACT_NAME;
      const isAh = offerType.toLowerCase() === "ah";
      const textBody = buildEmailTextBody(body, contactName, isAh);
      const htmlBody = buildEmailHtml(body, { signatureCid: inline.length ? signatureCid : null, contactName, isAh });

      // ---- SMTP (skipped in Bitrix-only mode) ----
      let info: { messageId?: string } = { messageId: "" };
      if (!bitrixOnly) {
        const mail = { from: d.mailer.from, replyTo: d.mailer.replyTo, to, ...(cc ? { cc } : {}), subject, text: textBody, html: htmlBody, attachments: mailAttachments };
        try { info = await d.mailer.send(mail); }
        catch (mailErr) { if (recordOpen) await step("mail", "failed", (mailErr as Error)?.message || String(mailErr)); throw mailErr; }
        if (recordOpen) await step("mail", "ok");
        // record right after SMTP accepted it — later failures must not free the deal for a resend
        if (lockedDealId) {
          await EmailSend.updateOne({ dealId: lockedDealId }, { $set: { inFlightUntil: null, sentAt: new Date(), offerNumber: payload?.offerNumber || offerNumber } })
            .catch((e) => req.log.warn({ err: e }, "EmailSend record failed"));
          lockedDealId = "";
        }
        try {
          const sent = await d.mailer.saveToSentFolder(mail);
          if (!sent.ok) req.log.warn({ reason: sent.reason }, "Sent copy skipped");
          if (recordOpen) await step("sentCopy", sent.ok ? "ok" : "skipped", sent.ok ? "" : String(sent.reason || ""));
        } catch (imapErr) {
          req.log.warn({ err: imapErr }, "saving to Sent folder failed");
          if (recordOpen) await step("sentCopy", "failed", (imapErr as Error)?.message || String(imapErr));
        }
        // The mail is out: a failing log entry must not turn the answer into "Send failed" nor
        // skip the Bitrix filing (audit send S-12) — it is recorded on the send instead.
        try { await EmailLog.create({
          to, ...(cc ? { cc } : {}), subject, body: textBody, attachmentNames,
          offerNumber: payload?.offerNumber || offerNumber, offerType: payload?.activeOffer || offerType,
          ...(payload?.offerOverrides ? { offerOverrides: payload.offerOverrides } : {}),
          ...(editedDocxInfo ? { editedDocx: editedDocxInfo } : {}),
          sentBy,
        }); if (recordOpen) await step("emailLog", "ok"); }
        catch (logErr) {
          req.log.error({ err: logErr, sendId }, "EmailLog entry failed after the mail was sent");
          if (recordOpen) await step("emailLog", "failed", (logErr as Error)?.message || String(logErr));
        }
      } else if (recordOpen) await step("mail", "skipped", "nur Bitrix");

      // the offer is out: the locked offer (pinned price) must exist — no longer left to the browser.
      // Only for clients that send a sendId, so the answer and side effects without one stay as before.
      if (clientSendId && d.ensureSentOffer) await d.ensureSentOffer({ offerNumber: String(payload?.offerNumber || offerNumber), offerType: String(payload?.activeOffer || offerType), payload: sentPayload });

      const event = bitrixOnly ? "offer_bitrix_only" : "offer_sent";
      void UserActionLog.create({ event, dealId: String(dealId || ""), offerNumber: payload?.offerNumber || offerNumber, offerType: payload?.activeOffer || offerType })
        .catch((e) => req.log.warn({ err: e, event }, "user action log failed"));

      let bitrixComment: unknown = { skipped: true, reason: "no target" };
      try {
        const target = getBitrixTargetFromPayload(payload);
        if (target) {
          const comment = buildBitrixEmailComment({ offerNumber: payload?.offerNumber || offerNumber, to, subject, body, attachmentNames, bitrixOnly, changes: offerChanges });
          // kept on the record so a failed filing can be repeated from the stored files
          if (recordOpen) await rec("bitrixCall", () => patchSend(sendId, { bitrixCall: { target, comment, internalNote: String(fields.internalNote || "") } }));
          if (target.entityType === "deal") await d.deals.setDealOfferLink(target.entityId, payload?.offerNumber || offerNumber);
          bitrixComment = await d.deals.addTimelineComment({ ...target, comment, attachments: bitrixAttachments });
          const note = buildInternalNoteComment(fields.internalNote);
          if (note) await d.deals.addTimelineComment({ ...target, comment: note });
        }
      } catch (bitrixErr) {
        req.log.warn({ err: bitrixErr }, "Bitrix timeline comment failed");
        bitrixComment = { ok: false, error: (bitrixErr as Error)?.message || String(bitrixErr) };
      }

      // final gross total + Eigenanteil for the "ANG verschickt" dialog (AH prices client-side)
      const offerTotal = isAh ? Number(offerData?.AhGesamtNum) || 0 : Number(offerComputed?.total) || 0;
      const selfPayAmount = isAh ? Number(offerData?.AhEigenanteilNum) || 0 : Number(offerComputed?.selfPayAmount) || 0;
      req.log.info({ dealId, offerNumber, bitrixOnly, attachments: attachmentNames.length, sendId }, "offer email done");
      const result = { ok: true, bitrixOnly, messageId: info.messageId, attachmentNames, bitrixComment, offerTotal, selfPayAmount, ...(clientSendId ? { sendId } : {}), ...(handEdited && !bitrixOnly ? { signingLink: "off-hand-edited" } : {}) };
      if (recordOpen) {
        const bc = bitrixComment as { ok?: boolean; skipped?: boolean; error?: string; reason?: string } | null;
        await step("bitrix", bc?.skipped ? "skipped" : bc?.ok === false ? "failed" : "ok", bc?.ok === false ? String(bc.error || "") : bc?.skipped ? String(bc.reason || "") : "");
        await rec("finish", () => finishSend(sendId, "done", { result }));
        recordOpen = false;
      }
      return result;
    } catch (e) {
      sendError = (e as Error)?.message || String(e);
      req.log.error({ err: e, sendId }, "send-offer failed");
      return fail(req, reply, 500, "SEND_FAILED", "Send failed", { detail: (e as Error)?.message || String(e) });
    } finally {
      // nothing went out (validation, PDF or SMTP failure) → free the deal
      if (lockedDealId) await EmailSend.updateOne({ dealId: lockedDealId }, { $set: { inFlightUntil: null } }).catch(() => {});
      // a record still open here means the send did not complete (validation, PDF or SMTP failure)
      if (recordOpen) await rec("finish", () => finishSend(sendId, "failed", { error: (sendError || "abgebrochen").slice(0, 500) }));
    }
  });
}
