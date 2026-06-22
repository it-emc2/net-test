/* eslint-disable no-useless-escape */
import express from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import dayjs from "dayjs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import ProductModel from "../models/Product.js";
import pricingFactory from "../logic/pricing.js";
import {
  aggregateMaterialsForOverview,
  formatQtyForOverview,
  convertDocxToPdf,
} from "./docx-template.js";

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

function isHassmannProduct(id) {
  const s = String(id || "").trim();
  if (!s) return false;

  if (/^HASS_/i.test(s)) return false;
  if (s === "OPT_CUSTOM") return false;
  if (s === "REHA_DELIVERY") return false;

  return true;
}


// ✅ UPDATED: Modern docxtemplater API usage
async function renderDocx(templatePath, data) {
  const content = await fs.readFile(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  try {
    doc.render(data); // ✅ Use render(data) directly instead of setData() + render()
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("Docxtemplater render error:", msg);
    if (e?.properties?.errors) {
      for (const er of e.properties.errors) {
        console.error("- Docx error:", {
          id: er.id,
          explanation: er.explanation,
          file: er.file,
          xtag: er.xtag,
          context: er.context,
          offset: er.offset,
        });
      }
    }
    throw new Error(`DOCX render failed: ${msg}`);
  }
  return doc.getZip().generate({ type: "nodebuffer" });
}

async function buildMaterialOverviewDocx(body = {}) {
  const computed = await pricing.computePrices(body);
  const offerKey =
    body.activeOffer ||
    body.currentOfferKey ||
    body.offerType ||
    computed?.activeOffer ||
    "bu";

  // Server-side safeguard: ignore body.materials unless it matches current offer
  // (use computed.materials instead to avoid cross-offer leakage)
  const bodyForOverview = { ...body, activeOffer: offerKey };
  delete bodyForOverview.materials;

  const rows = await aggregateMaterialsForOverview(bodyForOverview, computed);

  // EXTRA: Silikon-Duschabzieher (only for BU, only in Materialübersicht)
  try {
    const isBU = String(offerKey || "").toLowerCase() === "bu";
    if (isBU) {
      const already = rows.some((r) => r.materialNumber === "QR3923540");
      if (!already) {
        rows.push({
          materialNumber: "QR3923540",
          name: "Silikon-Duschabzieher mit Halter",
          unit: "Stck.",
          quantity: 1,
          remarks:
            "Geschenk für den Kunden (nicht im Angebot ausgewiesen).",
        });
      }
    }
  } catch (e) {
    console.warn(
      "[material-overview] failed to add QR3923540:",
      e?.message || e,
    );
  }

  const materials = rows.map((m, i) => ({
    pos: i + 1,
    materialNumber: m.materialNumber,
    name: m.name,
    quantity: formatQtyForOverview(m.quantity, m.unit || "Stck."),
    unit: m.unit || "Stck.",
    remarks: m.remarks || "",
  }));

  const b = body.Kundendaten || {};

  const salutation = b.salutation || "";
  const firstName = b.firstName || "";
  const lastName = b.lastName || "";

  const kundeName =
    [salutation, firstName, lastName].filter(Boolean).join(" ") || "";

  const street = b.street || "";
  const city = b.city || "";
  const plz = b.postalCode || "";

  const adresse = [street, [plz, city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const angebotNummer = (body.offerNumber || "").trim() || "ANG-0001";

  const data = {
    angebotNummer,
    datum: b.date || dayjs().format("YYYY-MM-DD"),
    kunde: kundeName,
    adresse,
    ansprechpartner: (b.emc2_contact || "").trim(),
    salutation,
    firstName,
    lastName,
    street,
    plz,
    city,
    materials,
  };

  console.log("[DEBUG] Template data:", {
    angebotNummer: data.angebotNummer,
    kunde: data.kunde,
    adresse: data.adresse,
    ansprechpartner: data.ansprechpartner,
    materialsCount: materials.length,
    firstMaterial: materials[0] || null,
  });

  const templatePath = path.join(
    process.cwd(),
    "src",
    "templates",
    "Materialuebersicht.docx",
  );
  const out = await renderDocx(templatePath, data);

  try {
    const verifyOut = path.join(process.cwd(), "out-Materialuebersicht.docx");
    fsSync.writeFileSync(verifyOut, out);
    console.log(
      "[material-overview] wrote generated DOCX:",
      verifyOut,
      "size:",
      out.length,
    );
  } catch (e) {
    console.warn(
      "[material-overview] could not write verify file:",
      e?.message || String(e),
    );
  }

  const safeOffer = angebotNummer.replace(/[^A-Za-z0-9_\-]+/g, "_");

  return {
    docxBuffer: out,
    angebotNummer,
    docxFilename: `Materialuebersicht_${safeOffer}.docx`,
    pdfFilename: `Materialuebersicht_${safeOffer}.pdf`,
  };
}

// ✅ COMPLETE: Material overview DOCX route
router.post("/", async (req, res) => {
  try {
    const { docxBuffer, docxFilename } = await buildMaterialOverviewDocx(req.body || {});

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${docxFilename}"`);
    res.send(docxBuffer);
  } catch (e) {
    console.error("Materialübersicht generation failed:", e);
    res.status(500).json({
      error: "Materialübersicht generation failed",
      detail: e.message || String(e),
    });
  }
});

router.post("/pdf", async (req, res) => {
  try {
    const { docxBuffer, pdfFilename } = await buildMaterialOverviewDocx(req.body || {});
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error("Materialübersicht PDF generation failed:", e);
    res.status(500).json({
      error: "Materialübersicht PDF generation failed",
      detail: e.message || String(e),
    });
  }
});


router.post("/hassmann-cart", async (req, res) => {
  try {
    const body = req.body || {};

    const computed = await pricing.computePrices(body);
    const offerKey =
      body.activeOffer ||
      body.currentOfferKey ||
      body.offerType ||
      computed?.activeOffer ||
      "bu";

    const bodyForOverview = { ...body, activeOffer: offerKey };
    delete bodyForOverview.materials;

    const rows = await aggregateMaterialsForOverview(bodyForOverview, computed);

    const filtered = rows.filter(
      (r) => isHassmannProduct(r.materialNumber) && Number(r.quantity || 0) > 0,
    );

    const lines = [
      //";Artikelnummer;Menge",
      ...filtered.map((r) => {
        const qty = Math.round(Number(r.quantity || 0));
        return `ART;${r.materialNumber};${qty}`;
      }),
    ];

    const csv = "\ufeff" + lines.join("\r\n");
    const angebotNummer = (body.offerNumber || "").trim() || "ANG-0001";
    const safeOffer = angebotNummer.replace(/[^A-Za-z0-9_\-]+/g, "_");
    const filename = `Hassmann_Warenkorb_${safeOffer}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e) {
    console.error("Hassmann cart generation failed:", e);
    res.status(500).json({
      error: "Hassmann cart generation failed",
      detail: e.message || String(e),
    });
  }
});
