// src/routes/signing.js
//
// Online signing of offer documents via a per-customer link (/sign/<token>).
//
// Phase 1: Selbstzahler — a single "angebot" document.
//   - POST /api/signing                     (internal) create request + email link
//   - GET  /api/signing/:token              (public)   data for the signing page
//   - GET  /api/signing/:token/documents/:key/pdf  (public) stream doc PDF to view
//   - POST /api/signing/:token/documents/:key      (public) submit a signature
//   - GET  /api/signing/status/:offerNumber (internal) status for a dashboard
//   - GET  /sign/:token                     (public)   the signing page itself
//
// The customer email link uses the supervisor-mandated intro text (see plan §7a).

import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";

import SigningRequest from "../models/SigningRequest.js";
import { addTimelineComment } from "./bitrix.js";
import { generateOfferPdfBuffer, getOfferRenderData } from "./docx-template.js";
import { htmlToPdfBuffer } from "../utils/htmlToPdf.js";
import {
  buildAngebotHtml,
  buildAhAngebotHtml,
  buildVollmachtHtml,
  buildAbtretungHtml,
} from "../templates/signing-docs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const DEFAULT_EXPIRY_DAYS = 14;

// Documents required per customer type.
const DOCS_BY_TYPE = {
  SZ: ["angebot"],
  KASSE: ["angebot", "vollmacht", "abtretung"], // Phase 2 wires vollmacht/abtretung
};

// AH (Alltagshilfe) offers: only the Angebot for now (no payment terms, no
// Vollmacht/Abtretung yet). Detected by offer type.
function isAhOffer(sr) {
  const t = String(sr?.offerType || "").toLowerCase();
  return t === "ah" || t === "ah-alt";
}

// Build the Angebot HTML for the right offer type (BU vs AH).
function buildAngebotForOffer(data, opts) {
  return isAhOffer(opts.sr) ? buildAhAngebotHtml(data, opts) : buildAngebotHtml(data, opts);
}

const DOC_LABELS = {
  angebot: "Angebot",
  vollmacht: "Vollmacht für die Krankenkasse",
  abtretung: "Abtretungserklärung",
};

// ---------- helpers ----------

function publicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

function clientIp(req) {
  return (
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.ip ||
    ""
  );
}

// Pull the editable customer fields out of the offer payload snapshot.
function extractPrefill(payload = {}) {
  const k = payload?.Kundendaten || {};
  return {
    salutation: k.salutation || "",
    firstName: k.firstName || "",
    lastName: k.lastName || "",
    street: k.street || "",
    postalCode: k.postalCode || "",
    city: k.city || "",
    phone: k.phone || "",
    email: k.email || "",
    // present for Kassenkunde; harmless for SZ
    geburtsdatum: k.kk_geburtsdatum || k.ah_geburtsdatum || "",
  };
}

function deriveCustomerType(payload = {}) {
  const payer = String(payload?.Kundendaten?.payer || "").toLowerCase();
  return payer.includes("kasse") ? "KASSE" : "SZ";
}

// Reuse the same Bitrix target logic shape as the email route.
function deriveBitrixTarget({ dealId, contactId }) {
  const d = String(dealId || "").trim();
  const c = String(contactId || "").trim();
  if (d) return { bitrixEntityType: "deal", bitrixEntityId: d };
  if (c) return { bitrixEntityType: "contact", bitrixEntityId: c };
  return { bitrixEntityType: "", bitrixEntityId: "" };
}

async function postTimeline(sr, comment, attachments = []) {
  if (!sr.bitrixEntityType || !sr.bitrixEntityId) return { skipped: true };
  try {
    return await addTimelineComment({
      entityType: sr.bitrixEntityType,
      entityId: sr.bitrixEntityId,
      comment,
      attachments,
    });
  } catch (err) {
    console.warn("[signing] Bitrix timeline comment failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// The authenticated sender address. Supports both SMTP_EMAIL (used elsewhere)
// and SMTP_USER (used in some env files).
function smtpFrom() {
  return process.env.SMTP_EMAIL || process.env.SMTP_USER || "";
}

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const user = smtpFrom();
  if (!host || !user) return null; // email is optional; signing still works without it
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    requireTLS: true,
    family: 4,
    auth: { user, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

const SIGN_LINK_INTRO =
  "Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem – nutzen Sie " +
  "einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu " +
  "unterschreiben und direkt an uns zurückzuschicken:";

// A payload copy with the customer's chosen payment term applied, so the
// existing Angebot template ticks the correct box.
function payloadWithPaymentChoice(sr, doc) {
  const payload = JSON.parse(JSON.stringify(sr.payloadSnapshot || {}));
  const idx = Number(doc?.extraFields?.paymentTermIdx);
  if (Number.isFinite(idx) && idx >= 0) {
    payload.Kundendaten = payload.Kundendaten || {};
    payload.Kundendaten.selectedPaymentTermIdx = idx;
  }
  return payload;
}

// Build the UNSIGNED PDF of a document for on-screen viewing.
async function buildDocumentPdf(sr, key) {
  const doc = (sr.documents || []).find((d) => d.key === key);
  if (key === "angebot") {
    const { pdfBuffer } = await generateOfferPdfBuffer(payloadWithPaymentChoice(sr, doc));
    return pdfBuffer;
  }
  if (key === "vollmacht") return htmlToPdfBuffer(buildVollmachtHtml(sr, doc || {}));
  if (key === "abtretung") return htmlToPdfBuffer(buildAbtretungHtml(sr, doc || {}));
  throw new Error(`Dokumenttyp "${key}" wird noch nicht unterstützt`);
}

// Build the FINAL SIGNED PDF for a document (used on completion).
async function buildSignedPdf(sr, doc) {
  if (doc.key === "angebot") {
    const { data } = await getOfferRenderData(payloadWithPaymentChoice(sr, doc));
    return htmlToPdfBuffer(buildAngebotForOffer(data, { mode: "pdf", sr, doc }));
  }
  if (doc.key === "vollmacht") return htmlToPdfBuffer(buildVollmachtHtml(sr, doc));
  if (doc.key === "abtretung") return htmlToPdfBuffer(buildAbtretungHtml(sr, doc));
  throw new Error(`Dokumenttyp "${doc.key}" wird noch nicht unterstützt`);
}

// ---------- core: create a signing request (reused by the route and email.js) ----------

// Returns { sr, link }. Also posts the "🔗 versendet" Bitrix timeline comment.
export async function createSigningRequest({
  payload,
  offerNumber,
  offerType,
  dealId,
  contactId,
  baseUrl,
}) {
  const customerType = deriveCustomerType(payload);
  const prefill = extractPrefill(payload);
  const { bitrixEntityType, bitrixEntityId } = deriveBitrixTarget({ dealId, contactId });

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // AH: only the Angebot for now. Otherwise the payer-based BU document set.
  const offerTypeNorm = String(offerType || payload?.activeOffer || "").toLowerCase();
  const isAh = offerTypeNorm === "ah" || offerTypeNorm === "ah-alt";
  const docKeys = isAh ? ["angebot"] : DOCS_BY_TYPE[customerType] || DOCS_BY_TYPE.SZ;
  const documents = docKeys.map((key) => ({
    key,
    status: "pending",
  }));

  const sr = await SigningRequest.create({
    token,
    offerNumber: String(offerNumber || payload?.offerNumber || ""),
    offerType: String(offerType || payload?.activeOffer || ""),
    customerType,
    bitrixEntityType,
    bitrixEntityId,
    customerEmail: prefill.email || "",
    customerName: `${prefill.firstName} ${prefill.lastName}`.trim(),
    payloadSnapshot: payload,
    prefill,
    documents,
    status: "sent",
    expiresAt,
  });

  const base = String(baseUrl || "").replace(/\/+$/, "");
  const link = `${base}/sign/${token}`;

  await postTimeline(
    sr,
    `🔗 Signatur-Link an Kunde versendet` +
      (sr.offerNumber ? ` (${sr.offerNumber})` : "") +
      `\nGültig bis: ${expiresAt.toLocaleDateString("de-DE")}\nLink: ${link}`,
  );

  return { sr, link, token, customerType };
}

// ---------- internal routes ----------

// POST /api/signing
// Body: { payload, offerNumber?, offerType?, dealId?, contactId?, sendEmail? }
router.post("/", express.json({ limit: "25mb" }), async (req, res) => {
  try {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "payload ist erforderlich" });
    }

    const { sr, link, token, customerType } = await createSigningRequest({
      payload,
      offerNumber: req.body?.offerNumber,
      offerType: req.body?.offerType,
      dealId: req.body?.dealId,
      contactId: req.body?.contactId,
      baseUrl: publicBaseUrl(req),
    });
    const prefill = sr.prefill || {};

    // Optional: email the link to the customer right away.
    let emailResult = { skipped: true };
    if (req.body?.sendEmail && prefill.email) {
      const transporter = buildTransport();
      if (transporter) {
        const html =
          `<p style="font-weight:bold;">${SIGN_LINK_INTRO}</p>` +
          `<p><a href="${link}">${link}</a></p>`;
        const text = `${SIGN_LINK_INTRO}\n\n${link}`;
        try {
          const info = await transporter.sendMail({
            from: smtpFrom(),
            replyTo: process.env.SMTP_REPLY_TO || smtpFrom(),
            to: prefill.email,
            subject: `Ihre Unterlagen zur Unterschrift – ${sr.offerNumber || "Angebot"}`,
            text,
            html,
          });
          emailResult = { ok: true, messageId: info.messageId };
        } catch (err) {
          emailResult = { ok: false, error: err?.message || String(err) };
        }
      }
    }

    return res.status(201).json({
      id: sr._id,
      token,
      link,
      customerType,
      documents: sr.documents.map((d) => d.key),
      emailResult,
    });
  } catch (err) {
    console.error("POST /api/signing failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /api/signing/status/:offerNumber  — for an internal dashboard
router.get("/status/:offerNumber", async (req, res) => {
  try {
    const list = await SigningRequest.find({
      offerNumber: String(req.params.offerNumber || "").trim(),
    })
      .sort({ createdAt: -1 })
      .lean();
    return res.json(
      list.map((sr) => ({
        token: sr.token,
        status: sr.status,
        customerType: sr.customerType,
        openedAt: sr.openedAt,
        completedAt: sr.completedAt,
        expiresAt: sr.expiresAt,
        documents: (sr.documents || []).map((d) => ({
          key: d.key,
          status: d.status,
          signedAt: d.signedAt,
        })),
      })),
    );
  } catch (err) {
    console.error("GET /api/signing/status failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// ---------- public routes (token-based, no login) ----------

async function loadByToken(req, res) {
  const token = String(req.params.token || "").trim();
  const sr = await SigningRequest.findOne({ token });
  if (!sr) {
    res.status(404).json({ error: "Ungültiger oder abgelaufener Link" });
    return null;
  }
  if (sr.isExpired()) {
    if (sr.status !== "completed") {
      sr.status = "expired";
      await sr.save();
    }
    res.status(410).json({ error: "Dieser Link ist abgelaufen" });
    return null;
  }
  return sr;
}

// GET /api/signing/:token — data the signing page renders from
router.get("/:token", async (req, res) => {
  try {
    const sr = await loadByToken(req, res);
    if (!sr) return;

    if (!sr.openedAt) {
      sr.openedAt = new Date();
      sr.recomputeStatus();
      await sr.save();
      await postTimeline(
        sr,
        `👁 Signatur-Link geöffnet am ${sr.openedAt.toLocaleString("de-DE")}` +
          (sr.offerNumber ? ` (${sr.offerNumber})` : ""),
      );
    }

    return res.json({
      offerNumber: sr.offerNumber,
      customerType: sr.customerType,
      status: sr.status,
      completed: sr.status === "completed",
      prefill: sr.prefill,
      documents: (sr.documents || []).map((d) => ({
        key: d.key,
        label: DOC_LABELS[d.key] || d.key,
        status: d.status,
      })),
    });
  } catch (err) {
    console.error("GET /api/signing/:token failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /api/signing/:token/documents/:key/html — read-only HTML fragment for
// on-screen display (currently the Angebot). Returns HTML, not a full page.
router.get("/:token/documents/:key/html", async (req, res) => {
  try {
    const sr = await loadByToken(req, res);
    if (!sr) return;
    const key = String(req.params.key || "");
    if (!(sr.documents || []).some((d) => d.key === key)) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    const doc = (sr.documents || []).find((x) => x.key === key) || { key };
    let html;
    if (key === "angebot") {
      const { data } = await getOfferRenderData(sr.payloadSnapshot || {});
      html = buildAngebotForOffer(data, { mode: "display", sr, doc });
    } else if (key === "vollmacht") {
      html = buildVollmachtHtml(sr, doc, "display");
    } else if (key === "abtretung") {
      html = buildAbtretungHtml(sr, doc, "display");
    } else {
      return res.status(404).json({ error: "Keine HTML-Ansicht für dieses Dokument" });
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("GET signing document html failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /api/signing/:token/documents/:key/pdf — stream the doc for viewing
router.get("/:token/documents/:key/pdf", async (req, res) => {
  try {
    const sr = await loadByToken(req, res);
    if (!sr) return;
    const key = String(req.params.key || "");
    if (!(sr.documents || []).some((d) => d.key === key)) {
      return res.status(404).json({ error: "Dokument nicht gefunden" });
    }
    const pdf = await buildDocumentPdf(sr, key);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${key}.pdf"`);
    return res.end(pdf);
  } catch (err) {
    console.error("GET signing document pdf failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// POST /api/signing/:token/documents/:key
// Body: { signatureImage (data URL), editedFields?, extraFields?, place? }
router.post("/:token/documents/:key", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const sr = await loadByToken(req, res);
    if (!sr) return;

    const key = String(req.params.key || "");
    const doc = (sr.documents || []).find((d) => d.key === key);
    if (!doc) return res.status(404).json({ error: "Dokument nicht gefunden" });
    if (doc.status === "signed") {
      return res.status(409).json({ error: "Dokument wurde bereits unterschrieben" });
    }

    const sig = String(req.body?.signatureImage || "");
    if (!/^data:image\/png;base64,/.test(sig)) {
      return res.status(400).json({ error: "Unterschrift fehlt" });
    }

    // For the BU Angebot the payment term is mandatory. AH has no payment terms.
    const extraFields = req.body?.extraFields || {};
    if (key === "angebot" && !isAhOffer(sr)) {
      const idx = Number(extraFields.paymentTermIdx);
      if (!Number.isFinite(idx) || idx < 0) {
        return res
          .status(400)
          .json({ error: "Bitte wählen Sie eine Zahlungsbedingung aus" });
      }
    }

    doc.signatureImage = sig;
    doc.editedFields = req.body?.editedFields || {};
    doc.extraFields = extraFields;
    doc.place = String(req.body?.place || sr.prefill?.city || "").trim();
    doc.signedAt = new Date();
    doc.signedIp = clientIp(req);
    doc.userAgent = String(req.headers["user-agent"] || "").slice(0, 300);
    doc.status = "signed";

    await postTimeline(
      sr,
      `✍️ Dokument „${DOC_LABELS[key] || key}" unterschrieben am ` +
        `${doc.signedAt.toLocaleString("de-DE")}` +
        (sr.offerNumber ? ` (${sr.offerNumber})` : ""),
    );

    const prevStatus = sr.status;
    sr.recomputeStatus();

    // If everything is now signed, generate signed PDFs, email + attach to Bitrix.
    let completion = { completed: false };
    if (sr.status === "completed" && prevStatus !== "completed") {
      const signedPdfs = [];
      for (const d of sr.documents) {
        const buffer = await buildSignedPdf(sr, d);
        signedPdfs.push({
          filename: `${d.key}_${sr.offerNumber || "signiert"}.pdf`,
          buffer,
        });
      }

      // Email a copy to customer + office.
      const transporter = buildTransport();
      const office = process.env.SIGNING_OFFICE_EMAIL || smtpFrom();
      if (transporter) {
        const recipients = [sr.customerEmail, office].filter(Boolean);
        const attachments = signedPdfs.map((p) => ({
          filename: p.filename,
          content: p.buffer,
          contentType: "application/pdf",
        }));
        try {
          await transporter.sendMail({
            from: smtpFrom(),
            replyTo: process.env.SMTP_REPLY_TO || smtpFrom(),
            to: recipients.join(","),
            subject: `Unterschriebene Unterlagen – ${sr.offerNumber || "Angebot"}`,
            text:
              "Vielen Dank! Anbei die von Ihnen elektronisch unterschriebenen " +
              "Unterlagen als PDF.",
            attachments,
          });
        } catch (err) {
          console.warn("[signing] completion email failed:", err?.message || err);
        }
      }

      await postTimeline(
        sr,
        `✅ Alle Dokumente unterschrieben` +
          (sr.offerNumber ? ` (${sr.offerNumber})` : "") +
          `\nSignierte PDFs sind angehängt.`,
        signedPdfs.map((p) => ({
          filename: p.filename,
          base64: p.buffer.toString("base64"),
        })),
      );
      completion = { completed: true };
    }

    await sr.save();

    return res.json({
      ok: true,
      status: sr.status,
      documents: sr.documents.map((d) => ({ key: d.key, status: d.status })),
      ...completion,
    });
  } catch (err) {
    console.error("POST signing document failed:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// ---------- signing page ----------

// GET /sign/:token — serve the customer-facing signing page.
// Mounted directly on the app before the SPA fallback.
export function signingPageHandler(req, res) {
  // dotfiles:'allow' so this works even when the app runs from a path that
  // contains a dot-folder (e.g. a .claude worktree during testing).
  res.sendFile(
    path.join(__dirname, "..", "public", "signpage", "index.html"),
    { dotfiles: "allow" },
  );
}

export default router;
