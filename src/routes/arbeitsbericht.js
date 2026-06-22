/* eslint-disable no-unused-vars */
import express from "express";
import path from "path";
import dayjs from "dayjs";
import { randomBytes } from "crypto";
import mongoose from "mongoose";

import ProductModel from "../models/Product.js";
import Offer from "../models/Offer.js";
import Draft from "../models/Draft.js";
import pricingFactory from "../logic/pricing.js";

// Reuse the exact same helpers you already have (Docxtemplater + LibreOffice)
// + reuse mapData ONLY to get BonusRows logic that already exists there
import { renderDocx, convertDocxToPdf, mapData } from "./docx-template.js";

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

/* ===========================
   DB-backed uniqueness for ARB IDs (minimal queries)
   - Normal case: 1 insert
   - Collision case: retry (rare)
   =========================== */

const ArbIdSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true, collection: "arb_ids" },
);

// Avoid OverwriteModelError in dev/hot reload
const ArbId = mongoose.models.ArbId || mongoose.model("ArbId", ArbIdSchema);

function randomArbId6() {
  // 3 bytes => 0..16,777,215; take modulo 1,000,000 for 6 digits
  const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
  return `ARB-${String(n).padStart(6, "0")}`;
}

async function generateUniqueArbId6(maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const id = randomArbId6();
    try {
      await ArbId.create({ id }); // ✅ single DB op
      return id;
    } catch (e) {
      // Duplicate key => collision, retry
      if (e?.code === 11000) continue;
      throw e;
    }
  }
  throw new Error("Could not generate unique ARB id after multiple attempts");
}

/* ===========================
   Helpers
   =========================== */

function fmtDateDE(input) {
  const d = input ? dayjs(input) : dayjs();
  return d.isValid() ? d.format("DD.MM.YYYY") : "";
}

function fmtCurrency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

function safeOfferNumber(body) {
  return (
    (body?.offerNumber && String(body.offerNumber).trim()) || `ANG-${Date.now()}`
  );
}

// IMPORTANT: Do NOT fallback to bitrixContactId here (it can be the offer id)
function pickCustomerNumber(body) {
  const b = body?.Kundendaten || {};
  return String(b.customerNumber || b.kundennummer || "").trim();
}

function cleanLineLabel(s) {
  return String(s ?? "")
    .replace(/^\s*-\s*/g, "")
    .replace(/^\s*[•·]\s*/g, "")
    .trim();
}

function getOfferKey(body) {
  const findOffer = (src) => {
    if (!src || typeof src !== "object") return null;
    return src.activeOffer || src.currentOfferKey || src.offerType || null;
  };

  const offer =
    findOffer(body) ||
    findOffer(body?.payload) ||
    findOffer(body?.pricePreview) ||
    "bu";

  return String(offer).toLowerCase();
}

function safeFileName(s, fallback = "Arbeitsbericht") {
  const raw = String(s || "").trim() || fallback;
  // allow only letters, numbers, underscore, dash
  return raw.replace(/[^a-zA-Z0-9_]/g, "_") || fallback;
}

/* ===========================
   Services splitting for template
   =========================== */

function splitServiceLines(serviceLines = []) {
  const primary = [];
  const included = [];

  for (const l of serviceLines) {
    if (!l || l.docxHide) continue;

    const label = cleanLineLabel(l.label || l.name || "");
    if (!label) continue;

    const bullet = label.startsWith("-") ? label : `- ${label}`;
    const plain = label;

    const goesIncluded =
      /fahrzeugbereitstellung/i.test(plain) ||
      /bereitstellung.*werkzeug/i.test(plain) ||
      /ber.?umung der baustelle/i.test(plain) ||
      /kilometerpauschale/i.test(plain) ||
      /facharbeiter/i.test(plain);

    if (goesIncluded) included.push(bullet);
    else primary.push(bullet);
  }

  return {
    PrimaryServiceLines: primary.map((txt) => ({ ServiceLine: txt })),
    IncludedServiceLines: included.map((txt) => ({ ServiceLine: txt })),
    HasIncluded: included.length > 0, // works with {#HasIncluded}
  };
}

/* ===========================
   Mapping for Arbeitsbericht.docx
   (matches your template keys exactly)
   =========================== */

async function mapArbeitsberichtData(body = {}, computed = {}) {
  const b = body?.Kundendaten || {};
  const offerKey = getOfferKey(body);

  const offerNumber = safeOfferNumber(body);

  // ✅ DB-backed unique 6-digit ARB id (no date)
  const dokumentnummer = await generateUniqueArbId6();

  // Prefer docx-specific display lists if present
  const svcLines =
    computed?.servicesDisplayDocx?.lines || computed?.services?.lines || [];
  const matLines =
    computed?.materialsDisplayDocx?.lines || computed?.materials?.lines || [];

  const { PrimaryServiceLines, IncludedServiceLines, HasIncluded } =
    splitServiceLines(svcLines);

  const MaterialsLines = (matLines || [])
    .map((l) => {
      if (l?.label) return { MaterialLine: String(l.label) };

      const qty = Number(l?.qty || 0);
      const qtyStr = Number.isFinite(qty)
        ? qty.toFixed(2).replace(/\.00$/, "")
        : "";
      const nameOrId = l?.name || l?.productId || l?.id || "";
      return { MaterialLine: `- ${qtyStr} Stk ${nameOrId}`.trim() };
    })
    .filter((x) => x.MaterialLine && String(x.MaterialLine).trim());

  // Title: your template should use {MaterialsPosTitle}
  const MaterialsPosTitle =
    offerKey === "hl" ? "Material für Handlauf" : "Material für Badumbau";

  // Price fields (template has them, so we fill them)
  const serviceSum = Number(computed?.services?.sum ?? 0) || 0;
  const materialSum =
    Number(
      computed?.material_plus_aufschlag ?? computed?.materials?.sum ?? 0,
    ) || 0;

  // Greeting matches your template usage: "{Greeting} {Nachname},"
  const Greeting =
    b.salutation === "Frau"
      ? "Sehr geehrte Frau"
      : b.salutation === "Herr"
        ? "Sehr geehrter Herr"
        : b.salutation === "Familie"
          ? "Sehr geehrte Familie"
          : "Guten Tag";

  // ✅ Bonus handling: reuse the already-working logic from docx-template.js/mapData
  // Your Arbeitsbericht template expects {#hasBonus} and {#BonusRows}
  const angebotData = mapData(body, computed);
  const BonusRows = Array.isArray(angebotData?.BonusRows)
    ? angebotData.BonusRows
    : [];
  const hasBonus = BonusRows.length > 0;

  return {
    // Address / header
    Anrede: b.salutation || "",
    Vorname: b.firstName || "",
    Nachname: b.lastName || "",
    Adresse: b.street || "",
    PLZ: b.postalCode || "",
    Stadt: b.city || "",

    // Meta box
    Dokumentennummer: dokumentnummer, // ✅ unique ARB id
    Kundennummer: pickCustomerNumber(body),
    Projektnummer: offerNumber, // ✅ Offer ID stays here
    Datum: fmtDateDE(b.date),
    Ansprechpartner: String(b.emc2_contact || "").trim(),
    Greeting,

    // Services position
    ServiceUnitPrice: fmtCurrency(serviceSum),
    ServiceTotal: fmtCurrency(serviceSum),
    PrimaryServiceLines,
    HasIncluded,
    IncludedServiceLines,

    // Materials position
    MaterialsPosTitle,
    MaterialsUnitPrice: fmtCurrency(materialSum),
    MaterialsTotal: fmtCurrency(materialSum),
    MaterialsLines,

    // Bonus block (works with your template)
    hasBonus,
    BonusRows,
  };
}

async function renderArbeitsberichtPdfBuffer(body = {}) {
  const computed = await pricing.computePrices(body);

  const templatePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "Arbeitsbericht.docx",
  );

  const data = await mapArbeitsberichtData(body, computed);
  const docxBuffer = await renderDocx(templatePath, data);
  const pdfBuffer = await convertDocxToPdf(docxBuffer);
  const fileName = `${safeFileName(
    data.Dokumentennummer,
    "Arbeitsbericht",
  )}.pdf`;

  return { pdfBuffer, fileName };
}

async function resolveExternalArbeitsberichtPayload(selector = {}) {
  const kind = String(selector.kind || "").trim().toLowerCase();

  if (kind === "draft") {
    const id = String(selector.id || "").trim();
    if (!id) {
      const err = new Error("draft id is required");
      err.statusCode = 400;
      throw err;
    }

    const draft = await Draft.findById(id).lean();
    if (!draft) {
      const err = new Error("Entwurf nicht gefunden");
      err.statusCode = 404;
      throw err;
    }

    return draft.payload || {};
  }

  if (kind === "offer") {
    const offerNumber = String(selector.offerNumber || "").trim();
    if (!offerNumber) {
      const err = new Error("offerNumber is required");
      err.statusCode = 400;
      throw err;
    }

    const offer = await Offer.findOne({ offerNumber }).lean();
    if (!offer) {
      const err = new Error("Angebot nicht gefunden");
      err.statusCode = 404;
      throw err;
    }

    return offer.payload || {};
  }

  const err = new Error('kind must be "draft" or "offer"');
  err.statusCode = 400;
  throw err;
}

/* ===========================
   Routes
   =========================== */

// Generate DOCX Arbeitsbericht
router.post("/docx", async (req, res) => {
  try {
    const body = req.body || {};
    const computed = await pricing.computePrices(body);

    const templatePath = path.join(
      process.cwd(),
      "src",
      "templates",
      "Arbeitsbericht.docx",
    );

    const data = await mapArbeitsberichtData(body, computed);
    const out = await renderDocx(templatePath, data);

    const fname = `${safeFileName(
      data.Dokumentennummer,
      "Arbeitsbericht",
    )}.docx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(out);
  } catch (e) {
    console.error("[arbeitsbericht/docx] generation failed:", e);
    res.status(500).json({
      error: "Arbeitsbericht DOCX generation failed",
      detail: e?.message || String(e),
    });
  }
});

// Generate PDF Arbeitsbericht (DOCX -> LibreOffice)
router.post("/pdf", async (req, res) => {
  try {
    const body = req.body || {};
    const { pdfBuffer, fileName } = await renderArbeitsberichtPdfBuffer(body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error("[arbeitsbericht/pdf] generation failed:", e);
    res.status(500).json({
      error: "Arbeitsbericht PDF generation failed",
      detail: e?.message || String(e),
    });
  }
});

// Generate PDF Arbeitsbericht from external search selection
router.post("/external/pdf", async (req, res) => {
  try {
    const payload = await resolveExternalArbeitsberichtPayload(req.body || {});
    const { pdfBuffer, fileName } = await renderArbeitsberichtPdfBuffer(payload);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (e) {
    const statusCode = Number(e?.statusCode) || 500;
    console.error("[arbeitsbericht/external/pdf] generation failed:", e);
    res.status(statusCode).json({
      error: "Arbeitsbericht external PDF generation failed",
      detail: e?.message || String(e),
    });
  }
});

export default router;
