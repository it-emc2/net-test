// src/routes/docx-template.js
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// 1) Import your Mongoose model and pricing factory
import ProductModel from '../models/Product.js'; // adjust path
import pricingFactory from '../logic/pricing.js'; // adjust path

export const router = express.Router();

// 2) Create pricing service instance
const pricing = pricingFactory(ProductModel);

// Helper: format as currency (adjust locale/currency as needed)
function fmtCurrency(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(num);
}

// Map computed prices + body fields to your DOCX placeholders
function mapData(body = {}, computed = {}) {
  const b = body.bereich || {};
  const tb = body.textbausteine || {};

  // computed defaults
  const {
    items = [],
    subtotal = 0,
    markupPct = 0,
    markup = 0,
    travel = 0,
    total = 0,
  } = computed;

  // If your template expects specific fields under "preise" and "summe",
  // construct them from computed data. Adjust as needed.
  const prix = body.preise || {};
  const sum = body.summe || {};

  // Decide where "Arbeit" and "Material" come from:
  // If you want to keep using provided prix.* when present, fall back to computed subtotal/markup/etc.
  // Or, compute them explicitly if you split your catalog by type. For now, we’ll just expose totals.
  const Arbeit = prix.arbeit ?? '';     // keep existing behavior unless you want to compute
  const Material = prix.material ?? ''; // keep existing behavior unless you want to compute

  // Build sums: use body.summe if present, else compute from pricing
  const Nettobetrag = sum.netto ?? fmtCurrency(subtotal);
  const Rabatt = sum.rabatt ?? ''; // if you implement discounts, compute here
  const MwSt = sum.mwst ?? '';     // if VAT applies, compute here
  const Gesamtsumme = sum.gesamt ?? fmtCurrency(total);
  const Selbstkostenanteil = sum.selbstkostenanteil ?? '';
  const Zuschusskrankenkasse = sum.zuschuss ?? '';
  const Gesamtsummerabatt = sum.gesamtsummerabatt ?? '';

  // Build a human friendly markup string, if needed
  const MarkupPctStr = markupPct ? `${Math.round(markupPct * 100)}%` : '';
  const MarkupValue = fmtCurrency(markup);
  const TravelValue = fmtCurrency(travel);

  return {
    // Address / meta
    Anrede: b.salutation || '',
    Vorname: b.firstName || '',
    Nachname: b.lastName || '',
    Adresse: b.street || '',
    Stadt: b.city || '',
    PLZ: b.postalCode || '',
    Datum: b.date || dayjs().format('YYYY-MM-DD'),
    Ansprechpartner: body.ansprechpartner || (b.hasContactPerson || ''),
    Kundennummer: b.customerNumber || '',
    Greeting: b.salutation === 'Frau' ? 'Sehr geehrte Frau' : (b.salutation === 'Herr' ? 'Sehr geehrter Herr' : 'Guten Tag'),
    Angebotsnummer: body.offerNumber || 'ANG-0001',

    // Optional: keep original price fields if you already use them
    Arbeit,
    Material,

    // Text blocks
    Long1: tb.long1 ?? '',
    Long3: tb.long3 ?? '',
    Long: tb.long ?? '',

    // Bonus/position fields (unchanged)
    Pos003: body.pos003 ?? '',
    Bonus1Stk: body.bonus1Stk ?? '',
    Bonus1: body.bonus1 ?? '',
    Bonus1Price: body.bonus1Price ?? '',
    Pos004: body.pos004 ?? '',
    Bonus2Stk: body.bonus2Stk ?? '',
    Bonus2: body.bonus2 ?? '',
    Bonus2Price: body.bonus2Price ?? '',

    // Sums (use computed when not provided)
    Nettobetrag,
    Rabatt,
    MwSt,
    Gesamtsumme,
    Selbstkostenanteil,
    Zuschusskrankenkasse,
    Gesamtsummerabatt,

    // Also expose computed fields explicitly, in case you add placeholders in DOCX:
    Subtotal: fmtCurrency(subtotal),
    MarkupPct: MarkupPctStr,
    MarkupValue,
    TravelValue,

    // Expose items for a repeating table in DOCX (see template instructions below)
    Items: items.map(i => ({
      ProduktId: i.productId,
      Menge: i.qty,
      Einzelpreis: fmtCurrency(i.unitPrice),
      Zwischensumme: fmtCurrency(i.lineTotal),
    })),
  };
}

router.post('/', async (req, res) => {
  try {
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath); // Buffer

    // 3) Compute prices using the incoming payload
    // Make sure req.body matches the expected structure for collectSelections(payload)
    const computed = await pricing.computePrices(req.body || {});

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    // 4) Map data into template variables
    const data = mapData(req.body || {}, computed);
    console.log('[docx-template] replacing keys:', Object.keys(data));

    doc.setData(data);

    // Will throw if a placeholder in DOCX has no value and your template has "strict" tags
    doc.render();

    const out = doc.getZip().generate({ type: 'nodebuffer' });

    // Optional: write to disk for verification during debugging
    try {
      const verifyOut = path.join(process.cwd(), 'out-Angebot.docx');
      fsSync.writeFileSync(verifyOut, out);
      console.log('[docx-template] wrote generated DOCX:', verifyOut, 'size:', out.length);
    } catch (e) {
      console.warn('[docx-template] could not write verify file:', e?.message || e);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Angebot.docx"');
    res.send(out);
  } catch (e) {
    console.error('DOCX generation failed:', e);
    res.status(500).json({ error: 'DOCX generation failed', detail: e.message || String(e) });
  }
});

export default router;