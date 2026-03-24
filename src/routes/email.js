/* eslint-disable no-useless-escape */
import express from "express";
import nodemailer from "nodemailer";
import multer from "multer";
import os from "os";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import net from "net";
import dns from "dns";

import EmailLog from "../models/EmailLog.js";

// Offer PDF generation (your existing utilities)
import {
  renderDocx,
  convertDocxToPdf,
  mapData,
  getAngebotTemplatePath,
} from "./docx-template.js";

import ProductModel from "../models/Product.js";
import pricingFactory from "../logic/pricing.js";

const router = express.Router();

router.get("/smtp-test", async (req, res) => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);

  dns.lookup(host, { all: true }, (err, addrs) => {
    if (err) return res.status(500).json({ ok: false, host, port, msg: err.message });

    const socket = new net.Socket();
    socket.setTimeout(8000);

    socket.on("connect", () => {
      socket.destroy();
      res.json({ ok: true, host, port, resolved: addrs, msg: "TCP connect OK" });
    });

    socket.on("timeout", () => {
      socket.destroy();
      res.status(504).json({ ok: false, host, port, resolved: addrs, msg: "TCP timeout" });
    });

    socket.on("error", (e) => {
      res.status(500).json({ ok: false, host, port, resolved: addrs, msg: e.message, code: e.code });
    });

    // ✅ force IPv4 connect attempt
    socket.connect({ host, port, family: 4 });
  });
});

const upload = multer({ dest: os.tmpdir() });

const pricing = pricingFactory(ProductModel);

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function buildTransport() {
  const host = requireEnv("SMTP_HOST");
  const port = Number(requireEnv("SMTP_PORT"));
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  return nodemailer.createTransport({
  host,
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  auth: { user: requireEnv("SMTP_EMAIL"), pass: requireEnv("SMTP_PASS") },
    //logger: true,
  //debug: true,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 12000,
});
}

function safeOfferFilename(raw) {
  return `${String(raw || "Angebot").replace(/[^\w\-]+/g, "_")}.pdf`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatInlineHtml(text) {
  const escaped = escapeHtml(text);
  const withEmails = escaped.replace(
    /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
    '<a href="mailto:$1" style="color:#00a86b;text-decoration:none;">$1</a>'
  );

  return withEmails.replace(
    /\b((?:https?:\/\/|www\.)[^\s<]+)\b/gi,
    (match) => {
      const href = /^https?:\/\//i.test(match) ? match : `https://${match}`;
      return `<a href="${escapeHtml(href)}" style="color:#00a86b;text-decoration:none;">${match}</a>`;
    }
  );
}

function renderBodyHtmlFromText(body) {
  const lines = String(body || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parts = [];
  let paragraphBuffer = [];
  let bulletBuffer = [];
  let orderedBuffer = [];

  function flushParagraph() {
    if (!paragraphBuffer.length) return;
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
      parts.push(
        `<p style="margin:0 0 18px 0;line-height:1.55;color:#364047;font-size:16px;">${formatInlineHtml(text)}</p>`
      );
    }
    paragraphBuffer = [];
  }

  function flushBullets() {
    if (!bulletBuffer.length) return;
    parts.push(
      `<ul style="margin:0 0 24px 22px;padding:0;color:#364047;">${bulletBuffer
        .map(
          (item) =>
            `<li style="margin:0 0 10px 0;line-height:1.5;font-size:16px;"><strong>${formatInlineHtml(
              item
            )}</strong></li>`
        )
        .join("")}</ul>`
    );
    bulletBuffer = [];
  }

  function flushOrdered() {
    if (!orderedBuffer.length) return;
    parts.push(
      `<ol style="margin:0 0 24px 28px;padding:0;color:#364047;">${orderedBuffer
        .map(
          (item) =>
            `<li style="margin:0 0 10px 0;line-height:1.5;font-size:16px;"><strong>${formatInlineHtml(
              item
            )}</strong></li>`
        )
        .join("")}</ol>`
    );
    orderedBuffer = [];
  }

  function flushAll() {
    flushParagraph();
    flushBullets();
    flushOrdered();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const bulletMatch = line.match(/^[•*-]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      flushOrdered();
      bulletBuffer.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBullets();
      orderedBuffer.push(orderedMatch[1].trim());
      continue;
    }

    flushBullets();
    flushOrdered();
    paragraphBuffer.push(line);
  }

  flushAll();
  return parts.join("");
}

function buildEmailTextBody(body) {
  const trimmed = String(body || "").trim();
  const signature = [
    "",
    "--",
    "Freundliche Grüße",
    "",
    "Stefan Wolfrum",
    "",
    "Ihr Team von emc2",
    "",
    "EmC2 Attila Landgrafe",
    "Waldstr. 5 / 95032 Hof",
    "",
    "Tel.: +49 9281 5915900",
    "Fax: +49 9281 5915909",
    "Mail: service@e-m-c-2.de",
    "Web: www.emczwei.de",
  ].join("\n");

  return `${trimmed}${signature}`;
}

function buildEmailHtml(body, { signatureCid = null } = {}) {
  const signatureImageHtml = signatureCid
    ? `<div style="margin:22px 0 14px 0;"><img src="cid:${signatureCid}" alt="Signatur emc2" style="display:block;max-width:220px;width:220px;height:auto;border:0;" /></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#364047;">
    <div style="max-width:980px;margin:0;padding:0 0 12px 0;">
      ${renderBodyHtmlFromText(body)}
      <p style="margin:0 0 8px 0;line-height:1.55;color:#364047;font-size:16px;">--</p>
      <p style="margin:0 0 24px 0;line-height:1.55;color:#364047;font-size:16px;">Freundliche Grüße</p>
      ${signatureImageHtml}
      <p style="margin:0 0 6px 0;line-height:1.5;color:#364047;font-size:16px;">Stefan Wolfrum</p>
      <p style="margin:0 0 28px 0;line-height:1.5;color:#364047;font-size:16px;">Ihr Team von emc2</p>
      <p style="margin:0 0 18px 0;line-height:1.5;color:#364047;font-size:16px;">______________________________</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">EmC2 Attila Landgrafe</p>
      <p style="margin:0 0 22px 0;line-height:1.5;color:#364047;font-size:16px;">Waldstr. 5 / 95032 Hof</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Tel.: +49 9281 5915900</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Fax: +49 9281 5915909</p>
      <p style="margin:0;line-height:1.5;color:#364047;font-size:16px;">Mail: <a href="mailto:service@e-m-c-2.de" style="color:#00a86b;text-decoration:none;">service@e-m-c-2.de</a></p>
      <p style="margin:0 0 24px 0;line-height:1.5;color:#364047;font-size:16px;">Web: <a href="https://www.emczwei.de" style="color:#00a86b;text-decoration:none;">www.emczwei.de</a></p>
      <p style="margin:0;line-height:1.7;color:#364047;font-size:12px;">
        Diese E-Mail enthält vertrauliche und/oder rechtlich geschützte Informationen. Der Inhalt dieser E-Mail ist ausschließlich für den bezeichneten Adressaten bestimmt. Bitte beachten Sie in diesem Fall, dass jede Form der Kenntnisnahme, Veröffentlichung, Vervielfältigung oder Weitergabe des Inhalts dieser E-Mail unzulässig ist. Wenn Sie nicht der richtige Adressat bzw. sein Vertreter sind oder diese E-Mail irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie diese E-Mail. Vielen Dank.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Preset attachments that should always be attached (unless excluded by user).
 * Visible in UI, removable via "x" -> frontend sends excludePreset JSON array.
 */
function getPresetAttachments(excludePresetSet) {
  const preset = [
    {
      id: "abtretung",
      filename: "Abtretungserklärung.pdf",
      absPath: path.join(
        process.cwd(),
        "src",
        "public",
        "assets",
        "Email",
        "Abtretungserklärung.pdf"
      ),
    },
    {
      id: "barrierefrei",
      filename: "emc2_Barrierefreies_Wohnen.pdf",
      absPath: path.join(
        process.cwd(),
        "src",
        "public",
        "assets",
        "Email",
        "emc2_Barrierefreies_Wohnen.pdf"
      ),
    },
    {
      id: "vollmacht",
      filename: "Vollmacht.pdf",
      absPath: path.join(
        process.cwd(),
        "src",
        "public",
        "assets",
        "Email",
        "Vollmacht.pdf"
      ),
    },
  ];

  return preset
    .filter((p) => !excludePresetSet.has(p.id))
    .filter((p) => fsSync.existsSync(p.absPath))
    .map((p) => ({
      filename: p.filename,
      path: p.absPath,
    }));
}

// multipart/form-data:
// fields: to, subject, body, offerNumber, offerType, payload (json string), excludePreset (json array string)
// files: attachments[]
router.post("/send-offer", upload.array("attachments", 10), async (req, res) => {
  const uploaded = req.files || [];

  try {
    const to = String(req.body.to || "").trim();
    const subject = String(req.body.subject || "").trim() || "Angebot";
    const body = String(req.body.body || "");
    const offerNumber = String(req.body.offerNumber || "");
    const offerType = String(req.body.offerType || "");

    if (!to) return res.status(400).json({ error: "Missing 'to'" });

    // Parse payload (JSON string because multipart)
    let payload = {};
    try {
      payload = JSON.parse(req.body.payload || "{}");
    } catch {
      return res.status(400).json({ error: "Invalid payload JSON" });
    }

    // Parse excludePreset
    const excludePreset = new Set();
    try {
      const raw = req.body.excludePreset ? JSON.parse(req.body.excludePreset) : [];
      for (const id of raw || []) excludePreset.add(String(id));
    } catch {
      // ignore invalid json
    }

    // ---- Generate offer PDF (Buffer) ----
    const templatePath = getAngebotTemplatePath(payload);
    const computed = await pricing.computePrices(payload || {});
    const data = mapData(payload || {}, computed);

    const docxBuf = await renderDocx(templatePath, data);
    const pdfBuf = await convertDocxToPdf(docxBuf);

    const angebotFilename = safeOfferFilename(payload?.offerNumber || offerNumber);
    const signatureCid = "emc2-signature-picture";
    const signatureImagePath = path.join(
      process.cwd(),
      "src",
      "public",
      "assets",
      "signaturepicture.png"
    );

    // ---- Attachments ----
    const presetAttachments = getPresetAttachments(excludePreset);

    const uploadAttachments = uploaded.map((f) => ({
      filename: f.originalname || f.filename,
      path: f.path, // nodemailer reads from disk
    }));

    const inlineAttachments = fsSync.existsSync(signatureImagePath)
      ? [
          {
            filename: "signaturepicture.png",
            path: signatureImagePath,
            cid: signatureCid,
          },
        ]
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
    const textBody = buildEmailTextBody(body);
    const htmlBody = buildEmailHtml(body, {
      signatureCid: inlineAttachments.length ? signatureCid : null,
    });

    // ---- Send via SMTP ----
    console.log("[email] runtime:", process.platform, "node", process.version, "cwd", process.cwd());
    const transporter = buildTransport();

    // verify() is optional; can slow things down / fail on some servers
    // await transporter.verify();

    // IMPORTANT: safest "from" is the authenticated account
    const from = process.env.SMTP_EMAIL;

    // Optional reply-to: set SMTP_REPLY_TO if you want replies elsewhere
    const replyTo = process.env.SMTP_REPLY_TO || from;

    const info = await transporter.sendMail({
      from,
      replyTo,
      to,
      subject,
      text: textBody,
      html: htmlBody,
      attachments: mailAttachments,
    });

    // ---- DB log (only names + content) ----
    await EmailLog.create({
      to,
      subject,
      body: textBody,
      attachmentNames,
      offerNumber: payload?.offerNumber || offerNumber,
      offerType: payload?.activeOffer || offerType,
    });

    res.json({ ok: true, messageId: info.messageId, attachmentNames });
  } catch (e) {
    console.error("[email] send-offer failed:", e);
    res.status(500).json({ error: "Send failed", detail: e?.message || String(e) });
  } finally {
    // Cleanup temp uploads
    await Promise.all(uploaded.map((f) => fs.unlink(f.path).catch(() => {})));
  }
});

export default router;
