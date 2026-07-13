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
import { addTimelineComment } from "./bitrix.js";
import { createSigningRequest } from "./signing.js";

import { buildEmailHtml } from "../lib/emailTemplate.js";

// Offer PDF generation (your existing utilities)
import {
  generateOfferPdfBuffer,
} from "./docx-template.js";

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

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

// Authenticated sender address — supports SMTP_EMAIL or SMTP_USER.
function smtpFrom() {
  return process.env.SMTP_EMAIL || process.env.SMTP_USER || "";
}

function buildTransport() {
  const host = requireEnv("SMTP_HOST");
  const user = smtpFrom();
  if (!user) throw new Error("Missing env var SMTP_EMAIL or SMTP_USER");

  return nodemailer.createTransport({
  host,
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  auth: { user, pass: requireEnv("SMTP_PASS") },
    //logger: true,
  //debug: true,
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 12000,
});
}

function getBitrixTargetFromPayload(payload = {}) {
  const kundendaten = payload?.Kundendaten || {};
  const dealId = String(
    payload?.bitrixDealId ||
      payload?.Zusammenfassung?.dealId ||
      payload?.dealId ||
      kundendaten?.dealId ||
      "",
  ).trim();
  const contactId = String(
    payload?.bitrixContactId ||
      kundendaten?.bitrixContactId ||
      kundendaten?.customerNumber ||
      "",
  ).trim();

  if (dealId) return { entityType: "deal", entityId: dealId };
  if (contactId) return { entityType: "contact", entityId: contactId };
  return null;
}

function buildBitrixEmailComment({ offerNumber, to, subject, body, attachmentNames }) {
  const when = new Date();
  const dt = when.toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const safe = (v) => String(v ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawBody = safe(body || "").trim();
  const maxLen = 1400;
  const bodyOut =
    rawBody.length > maxLen ? `${rawBody.slice(0, maxLen)}\n…(gekürzt)…` : rawBody;

  return [
    "📧 Email automatisch von OC gesendet",
    offerNumber ? `Angebot: ${safe(offerNumber).trim()}` : null,
    `Datum/Zeit: ${dt}`,
    `Empfänger: ${safe(to).trim() || "-"}`,
    `Betreff: ${safe(subject).trim() || "-"}`,
    `Anhänge: ${Array.isArray(attachmentNames) && attachmentNames.length ? attachmentNames.join(", ") : "-"}`,
    "",
    "Inhalt:",
    bodyOut || "-",
  ]
    .filter(Boolean)
    .join("\n");
}

function safeOfferFilename(raw) {
  return `${String(raw || "Angebot").replace(/[^\w\-]+/g, "_")}.pdf`;
}

function buildEmailTextBody(body, contactName = "Stefan Wolfrum") {
  const trimmed = String(body || "").trim();
  const signature = [
    "",
    "--",
    "Freundliche Grüße",
    "",
    contactName,
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

/**
 * Preset attachments that should always be attached (unless excluded by user).
 * Visible in UI, removable via "x" -> frontend sends excludePreset JSON array.
 */
function getPresetAttachments(excludePresetSet, isSelbstzahler) {
  // Selbstzahler get only the Angebot (added elsewhere) + the flyer — no
  // Abtretung/Vollmacht. Kassenkunde get all four.
  const payerExcluded = isSelbstzahler
    ? new Set(["abtretung", "vollmacht"])
    : new Set();
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
    .filter((p) => !payerExcluded.has(p.id))
    .filter((p) => fsSync.existsSync(p.absPath))
    .map((p) => ({
      filename: p.filename,
      path: p.absPath,
    }));
}

// multipart/form-data:
// fields: to, subject, body, offerNumber, offerType, payload (json string), excludePreset (json array string)
// files: attachments[]
router.post(
  "/send-offer",
  upload.fields([
    { name: "attachments", maxCount: 10 },
    { name: "bitrixDocs", maxCount: 5 },
  ]),
  async (req, res) => {
  // upload.fields() returns an object keyed by field name.
  const uploaded = req.files?.attachments || [];
  const bitrixDocFiles = req.files?.bitrixDocs || [];

  try {
    const to = String(req.body.to || "").trim();
    const subject = String(req.body.subject || "").trim() || "Angebot";
    let body = String(req.body.body || "");
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

    const dealId = String(req.body.dealId || "").trim();
    const contactId = String(req.body.contactId || "").trim();
    if (dealId) payload.bitrixDealId = dealId;
    if (contactId) payload.bitrixContactId = contactId;

    // Parse excludePreset
    const excludePreset = new Set();
    try {
      const raw = req.body.excludePreset ? JSON.parse(req.body.excludePreset) : [];
      for (const id of raw || []) excludePreset.add(String(id));
    } catch {
      // ignore invalid json
    }

    // Developer option: drop the presets (Abtretung/Vollmacht/Flyer) from the
    // Bitrix timeline comment only. The customer email keeps them regardless.
    const excludeBitrixPresets = ["1", "true", "on", "yes"].includes(
      String(req.body.excludeBitrixPresets || "").toLowerCase(),
    );

    const isSelbstzahler = String(payload?.Kundendaten?.payer || "")
      .toLowerCase()
      .includes("selbstzahler");

    // ---- Online-signing link: create a signing request and inject the link ----
    // The body may contain a {{SIGN_LINK}} placeholder (from the compose UI).
    try {
      const baseUrl =
        String(process.env.PUBLIC_BASE_URL || "").trim() ||
        `${req.protocol}://${req.get("host")}`;
      const { link } = await createSigningRequest({
        payload,
        offerNumber,
        offerType,
        dealId,
        contactId,
        baseUrl,
      });
      body = body.includes("{{SIGN_LINK}}")
        ? body.split("{{SIGN_LINK}}").join(link)
        : body;
    } catch (signErr) {
      console.warn("[email] signing link creation failed:", signErr?.message || signErr);
      // Remove the placeholder so it never shows raw in the email.
      body = body.split("{{SIGN_LINK}}").join("");
    }

    // ---- Generate offer PDF (same path as /docx-template/pdf) ----
    const { pdfBuffer: pdfBuf, computed: offerComputed } =
      await generateOfferPdfBuffer(payload || {});

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
    const presetAttachments = getPresetAttachments(excludePreset, isSelbstzahler);

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

    // Extra documents forwarded from the client for the Bitrix timeline only
    // (Angebot DOCX, Hassmann CSV, Kalkulation PDF) — not part of the email.
    const bitrixExtraDocs = await Promise.all(
      bitrixDocFiles.map(async (f) => ({
        filename: f.originalname || f.filename,
        base64: (await fs.readFile(f.path)).toString("base64"),
      })),
    );

    const bitrixAttachments = [
      {
        filename: angebotFilename,
        base64: pdfBuf.toString("base64"),
      },
      ...bitrixExtraDocs,
      // Presets can be suppressed on the Bitrix timeline via the developer option.
      ...(excludeBitrixPresets
        ? []
        : await Promise.all(
            presetAttachments.map(async (item) => ({
              filename: item.filename,
              base64: (await fs.readFile(item.path)).toString("base64"),
            })),
          )),
      ...(
        await Promise.all(
          uploadAttachments.map(async (item) => ({
            filename: item.filename,
            base64: (await fs.readFile(item.path)).toString("base64"),
          })),
        )
      ),
    ];
    const contactName =
      String(payload?.Kundendaten?.emc2_contact || "").trim() || "Stefan Wolfrum";
    const textBody = buildEmailTextBody(body, contactName);
    const htmlBody = buildEmailHtml(body, {
      signatureCid: inlineAttachments.length ? signatureCid : null,
      contactName,
    });

    // ---- Send via SMTP ----
    console.log("[email] runtime:", process.platform, "node", process.version, "cwd", process.cwd());
    const transporter = buildTransport();

    // verify() is optional; can slow things down / fail on some servers
    // await transporter.verify();

    // IMPORTANT: safest "from" is the authenticated account
    const from = smtpFrom();

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

    let bitrixComment = { skipped: true, reason: "no target" };
    try {
      const target = getBitrixTargetFromPayload(payload);
      if (target) {
        bitrixComment = await addTimelineComment({
          ...target,
          comment: buildBitrixEmailComment({
            offerNumber: payload?.offerNumber || offerNumber,
            to,
            subject,
            body,
            attachmentNames,
          }),
          attachments: bitrixAttachments,
        });
      }
    } catch (bitrixErr) {
      console.warn("[email] Bitrix timeline comment failed:", bitrixErr);
      bitrixComment = {
        ok: false,
        error: bitrixErr?.message || String(bitrixErr),
      };
    }

    // The offer's final gross total (Gesamtsumme/Brutto). Returned so the
    // "Deal auf 'ANG verschickt' verschieben" dialog can prefill "Betrag".
    const offerTotal = Number(offerComputed?.total) || 0;

    res.json({
      ok: true,
      messageId: info.messageId,
      attachmentNames,
      bitrixComment,
      offerTotal,
    });
  } catch (e) {
    console.error("[email] send-offer failed:", e);
    res.status(500).json({ error: "Send failed", detail: e?.message || String(e) });
  } finally {
    // Cleanup temp uploads (customer attachments + forwarded Bitrix docs)
    await Promise.all(
      [...uploaded, ...bitrixDocFiles].map((f) => fs.unlink(f.path).catch(() => {})),
    );
  }
});

export default router;
