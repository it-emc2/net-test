// Document generation (Angebot). HTML → PDF via Puppeteer with a repeating
// logo header + impressum/page-number footer and per-page margins.
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/authGate.js";
import { htmlToPdf } from "../services/pdf.js";
import {
  renderAngebotHtml,
  headerTemplate,
  footerTemplate,
  sampleAngebotData,
} from "../logic/angebotTemplate.js";
import { buildAngebotData, signatureInitials } from "../logic/angebotData.js";
import { createPricing } from "../logic/pricing.js";
import { resolvePrices } from "../services/catalog.js";
import User from "../models/User.js";
import EmailLog from "../models/EmailLog.js";
import { addTimelineComment, bitrixConfigured } from "../services/bitrix.js";
import { buildEmailHtml } from "../lib/emailTemplate.js";
import {
  buildTransport,
  saveToSentFolder,
  getPresetAttachments,
  buildEmailTextBody,
  safeOfferFilename,
  smtpFrom,
  SIGNATURE_IMAGE_PATH,
  SIGNATURE_CID,
} from "../services/mailer.js";
import multer from "multer";
import os from "node:os";
import fs from "node:fs";
import fsp from "node:fs/promises";

const router = Router();
router.use(requireAuth);

const pricing = createPricing(resolvePrices);
const upload = multer({ dest: os.tmpdir() });

// Signature initials of the currently logged-in user (Ansprechpartner + email
// sign-off). Org data-protection rule: initials only, never a full name.
async function currentUserInitials(req: Request): Promise<string> {
  const email = req.user?.email;
  if (!email) return "";
  const user = await User.findOne({ email, active: true }).lean();
  return signatureInitials(user);
}

// Render the offer PDF for a payload (shared by download + send).
async function angebotPdf(payload: unknown, ansprechpartner: string): Promise<Buffer> {
  return renderPdf(await angebotHtmlFromPayload(payload, ansprechpartner));
}

// Render the Angebot HTML for a live payload (payload = the configurator body).
async function angebotHtmlFromPayload(payload: unknown, ansprechpartner: string): Promise<string> {
  const computed = await pricing.computePrices((payload || {}) as Record<string, unknown>);
  return renderAngebotHtml(buildAngebotData(payload as Record<string, unknown>, computed, { ansprechpartner }));
}

function safeName(offerNumber: unknown): string {
  const s = String(offerNumber || "Angebot").replace(/[^a-zA-Z0-9_-]/g, "_");
  return s || "Angebot";
}

// Resolve the Bitrix timeline target from the payload (deal wins over contact).
function bitrixTargetFromPayload(payload: any): { entityType: "deal" | "contact"; entityId: string } | null {
  const k = payload?.Kundendaten || {};
  const dealId = String(payload?.bitrixDealId || k?.dealId || "").trim();
  const contactId = String(payload?.bitrixContactId || k?.bitrixContactId || k?.customerNumber || "").trim();
  if (dealId) return { entityType: "deal", entityId: dealId };
  if (contactId) return { entityType: "contact", entityId: contactId };
  return null;
}

function buildBitrixComment(o: { offerNumber?: string; to: string; subject: string; body: string; attachmentNames: string[] }): string {
  const safe = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n");
  const body = safe(o.body).trim();
  const capped = body.length > 20000 ? `${body.slice(0, 20000)}\n…(gekürzt)…` : body;
  return [
    "📧 Email automatisch vom Konfigurator gesendet",
    o.offerNumber ? `Angebot: ${safe(o.offerNumber).trim()}` : null,
    `Empfänger: ${safe(o.to).trim() || "-"}`,
    `Betreff: ${safe(o.subject).trim() || "-"}`,
    `Anhänge: ${o.attachmentNames.length ? o.attachmentNames.join(", ") : "-"}`,
    "",
    "Inhalt:",
    capped || "-",
  ]
    .filter(Boolean)
    .join("\n");
}

const MARGIN = { top: "31mm", bottom: "30mm", left: "20mm", right: "20mm" };

async function renderPdf(html: string): Promise<Buffer> {
  return htmlToPdf(html, { margin: MARGIN, headerTemplate: headerTemplate(), footerTemplate: footerTemplate() });
}

// --- sample endpoints (verify layout/pagination before live data is wired) ---

// GET /api/documents/angebot.sample.html — the body HTML (browser preview).
router.get("/angebot.sample.html", (_req: Request, res: Response) => {
  res.type("html").send(renderAngebotHtml(sampleAngebotData()));
});

// GET /api/documents/angebot.sample.pdf — full paged PDF with header/footer.
router.get("/angebot.sample.pdf", async (_req: Request, res: Response) => {
  try {
    const pdf = await renderPdf(renderAngebotHtml(sampleAngebotData()));
    res.type("application/pdf").set("Content-Disposition", 'inline; filename="angebot-sample.pdf"').send(pdf);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[documents] sample pdf error:", err);
    res.status(500).json({ error: "PDF-Erstellung fehlgeschlagen" });
  }
});

// --- live endpoints (body = configurator payload) ---

// POST /api/documents/angebot.html — body HTML for a real payload (preview).
router.post("/angebot.html", async (req: Request, res: Response) => {
  try {
    res.type("html").send(await angebotHtmlFromPayload(req.body, await currentUserInitials(req)));
  } catch (err) {
    console.error("[documents] angebot.html error:", err);
    res.status(500).json({ error: "Vorschau fehlgeschlagen" });
  }
});

// POST /api/documents/email.preview.html — the branded email body as it will
// render, for the live compose preview. Signature image (cid) is omitted here
// since the preview can't resolve the attachment.
router.post("/email.preview.html", async (req: Request, res: Response) => {
  try {
    const initials = await currentUserInitials(req);
    res.type("html").send(buildEmailHtml(String(req.body?.body || ""), { contactName: initials }));
  } catch (err) {
    console.error("[documents] email.preview error:", err);
    res.status(500).json({ error: "Vorschau fehlgeschlagen" });
  }
});

// POST /api/documents/angebot.pdf — paged PDF for a real payload.
router.post("/angebot.pdf", async (req: Request, res: Response) => {
  try {
    const pdf = await angebotPdf(req.body, await currentUserInitials(req));
    const fname = `${safeName((req.body || {}).offerNumber)}.pdf`;
    res
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${fname}"`)
      .send(pdf);
  } catch (err) {
    console.error("[documents] angebot.pdf error:", err);
    res.status(500).json({ error: "PDF-Erstellung fehlgeschlagen" });
  }
});

// POST /api/documents/angebot.send — multipart/form-data:
//   fields: to, subject, body, payload (JSON string), excludePreset (JSON array)
//   files:  attachments[]
// Generates the offer PDF, attaches presets + uploads + inline signature,
// sends via SMTP, files a copy in the IMAP Sent folder, and logs it.
router.post("/angebot.send", upload.fields([{ name: "attachments", maxCount: 10 }]), async (req: Request, res: Response) => {
  const files = (req.files as { attachments?: Express.Multer.File[] } | undefined) || {};
  const uploaded = files.attachments || [];
  try {
    const to = String(req.body.to || "").trim();
    const subject = String(req.body.subject || "").trim() || "Angebot";
    let body = String(req.body.body || "");
    const offerNumber = String(req.body.offerNumber || "");
    if (!to) return res.status(400).json({ error: "Empfänger (to) fehlt" });

    let payload: Record<string, any> = {};
    try {
      payload = JSON.parse(req.body.payload || "{}");
    } catch {
      return res.status(400).json({ error: "Ungültiges payload-JSON" });
    }

    const excludePreset = new Set<string>();
    try {
      for (const id of JSON.parse(req.body.excludePreset || "[]") || []) excludePreset.add(String(id));
    } catch {
      /* ignore */
    }

    // Signing link is not built in the new app yet — strip the placeholder so
    // it never appears raw. (Legacy injects a real link here.)
    // ponytail: TODO wire once the signing flow exists in the new app.
    body = body.split("{{SIGN_LINK}}").join("");

    const initials = await currentUserInitials(req);
    const pdfBuf = await angebotPdf(payload, initials);
    const angebotFilename = safeOfferFilename(payload?.offerNumber || offerNumber);

    const isSelbstzahler = String(payload?.Kundendaten?.payer || "").toLowerCase().includes("selbstzahler");
    const presetAttachments = getPresetAttachments(excludePreset, isSelbstzahler);
    const uploadAttachments = uploaded.map((f) => ({ filename: f.originalname || f.filename, path: f.path }));
    const inlineAttachments = fs.existsSync(SIGNATURE_IMAGE_PATH)
      ? [{ filename: "signaturepicture.png", path: SIGNATURE_IMAGE_PATH, cid: SIGNATURE_CID }]
      : [];

    const mailAttachments = [
      { filename: angebotFilename, content: pdfBuf, contentType: "application/pdf" },
      ...presetAttachments,
      ...uploadAttachments,
      ...inlineAttachments,
    ];
    const attachmentNames = [
      angebotFilename,
      ...presetAttachments.map((a) => a.filename),
      ...uploadAttachments.map((a) => a.filename),
    ];

    const textBody = buildEmailTextBody(body, initials);
    const htmlBody = buildEmailHtml(body, { signatureCid: inlineAttachments.length ? SIGNATURE_CID : null, contactName: initials });

    const from = smtpFrom();
    const mailOptions = {
      from,
      replyTo: process.env.SMTP_REPLY_TO || from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: mailAttachments,
    };

    const transporter = buildTransport();
    const info = await transporter.sendMail(mailOptions);

    // File a copy in the IMAP Sent folder (best-effort).
    try {
      const sent = await saveToSentFolder(mailOptions);
      if (!sent.ok) console.warn("[documents] Sent copy skipped:", sent.reason);
    } catch (imapErr) {
      console.warn("[documents] Save-to-Sent failed:", (imapErr as Error)?.message || imapErr);
    }

    await EmailLog.create({
      to,
      subject,
      body: textBody,
      attachmentNames,
      offerNumber: payload?.offerNumber || offerNumber,
      offerType: payload?.activeOffer || "",
    });

    // Recompute totals for the caller (deal-move dialog prefill).
    const computed = await pricing.computePrices(payload);

    // Bitrix timeline comment with the offer PDF attached (best-effort).
    let bitrixComment: any = { skipped: true, reason: "no target" };
    const target = bitrixTargetFromPayload(payload);
    if (target && bitrixConfigured()) {
      try {
        bitrixComment = await addTimelineComment({
          ...target,
          comment: buildBitrixComment({ offerNumber: payload?.offerNumber || offerNumber, to, subject, body, attachmentNames }),
          attachments: [{ filename: angebotFilename, base64: pdfBuf.toString("base64") }],
        });
      } catch (bx) {
        console.warn("[documents] Bitrix timeline comment failed:", (bx as Error)?.message || bx);
        bitrixComment = { ok: false, error: (bx as Error)?.message || String(bx) };
      }
    } else if (target && !bitrixConfigured()) {
      bitrixComment = { skipped: true, reason: "bitrix not configured" };
    }

    // TODO: online-signing link ({{SIGN_LINK}}) — needs the signing flow built
    // in the new app first (public sign page + request model + PDF embedding).
    res.json({
      ok: true,
      messageId: info.messageId,
      attachmentNames,
      offerTotal: Number(computed?.total) || 0,
      selfPayAmount: Number(computed?.selfPayAmount) || 0,
      bitrixComment,
    });
  } catch (err) {
    console.error("[documents] angebot.send error:", err);
    res.status(500).json({ error: "Senden fehlgeschlagen", detail: (err as Error)?.message || String(err) });
  } finally {
    await Promise.all(uploaded.map((f) => fsp.unlink(f.path).catch(() => {})));
  }
});

export default router;
