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

    // ---- Attachments ----
    const presetAttachments = getPresetAttachments(excludePreset);

    const uploadAttachments = uploaded.map((f) => ({
      filename: f.originalname || f.filename,
      path: f.path, // nodemailer reads from disk
    }));

    const mailAttachments = [
      { filename: angebotFilename, content: pdfBuf, contentType: "application/pdf" },
      ...presetAttachments,
      ...uploadAttachments,
    ];

    const attachmentNames = mailAttachments.map((a) => a.filename);

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
      text: body,
      attachments: mailAttachments,
    });

    // ---- DB log (only names + content) ----
    await EmailLog.create({
      to,
      subject,
      body,
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