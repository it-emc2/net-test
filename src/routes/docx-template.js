// src/routes/docx-template.js
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// 1) Import your Mongoose model and pricing factory
import ProductModel from '../models/Product.js';
import pricingFactory from '../logic/pricing.js';

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

  // Computed fields from pricing.computePrices
  const {
    items = [],
    productsSubtotal = 0,
    services = { title: '', lines: [], sum: 0, payer: '', zoneLabel: '', distanceKm: 0, laborHours: 0, laborRate: 0 },
    subtotal = 0,
    markupPct = 0,
    markup = 0,
    travel = 0,
    total = 0,
  } = computed;

  // If your template still uses some manual price fields, keep them
  const prix = body.preise || {};
  const sum = body.summe || {};

  // Totals (fall back to computed if body.* not provided)
  const Nettobetrag = sum.netto ?? fmtCurrency(subtotal);
  const Rabatt = sum.rabatt ?? '';
  const MwSt = sum.mwst ?? '';
  const Gesamtsumme = sum.gesamt ?? fmtCurrency(total);
  const Selbstkostenanteil = sum.selbstkostenanteil ?? '';
  const Zuschusskrankenkasse = sum.zuschuss ?? '';
  const Gesamtsummerabatt = sum.gesamtsummerabatt ?? '';

  // Markup display fields
  const MarkupPctStr = markupPct ? `${Math.round(markupPct * 100)}%` : '';
  const MarkupValue = fmtCurrency(markup);
  const TravelValue = fmtCurrency(travel);

  // Build the service position placeholders
  const serviceLines = (services?.lines || []).map(l => l.label);
  const ServicePosTitle = services?.title || 'Auszuführende Arbeiten';
  const ServiceUnitPrice = fmtCurrency(services?.sum || 0); // Einheitspreis (per 1 Stk)
  const ServiceTotal = fmtCurrency(services?.sum || 0);     // Gesamt (1 Stk)

  // Optional meta for debugging/placeholders if needed
  const PayerKind = services?.payer || (b.payer || '');          // 'KK' / 'SZ'
  const ZoneChosen = services?.zoneLabel || '';
  const DistanceKm =
(services && services.distanceKm !== undefined && services.distanceKm !== null)
? services.distanceKm
: (Number(b.distanceKm ?? 0) || 0);

const LaborHours =
(services && services.laborHours !== undefined && services.laborHours !== null)
? services.laborHours
: (Number(b.laborHours ?? 0) || 0);
  const LaborRate = services?.laborRate ?? 0;

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

    // Legacy/optional price fields if used elsewhere in your template
    Arbeit: prix.arbeit ?? '',
    Material: prix.material ?? '',

    // Text blocks
    Long1: tb.long1 ?? '',
    Long3: tb.long3 ?? '',
    Long: tb.long ?? '',

    // Sums (use computed when not provided)
    Nettobetrag,
    Rabatt,
    MwSt,
    Gesamtsumme,
    Selbstkostenanteil,
    Zuschusskrankenkasse,
    Gesamtsummerabatt,

    // Computed summary (always available)
    Subtotal: fmtCurrency(subtotal),
    MarkupPct: MarkupPctStr,
    MarkupValue,
    TravelValue,

    // Materials (catalog items) table (if your DOCX uses a repeating table)
    Items: items.map(i => ({
      ProduktId: i.productId,
      Menge: i.qty,
      Einzelpreis: fmtCurrency(i.unitPrice),
      Zwischensumme: fmtCurrency(i.lineTotal),
    })),
    ProdukteZwischensumme: fmtCurrency(productsSubtotal),

    // NEW: Service position placeholders for "Auszuführende Arbeiten"
    ServicePosTitle,
    ServiceUnitPrice,
    ServiceTotal,
    ServiceLines: serviceLines.map(txt => ({ ServiceLine: txt })),

    // Optional debug/extra placeholders you can show in the document if needed
    PayerKind,
    ZoneChosen,
    DistanceKm,
    LaborHours,
    LaborRate: LaborRate ? `${LaborRate.toFixed(2)} €` : '',
  };
}

router.post('/', async (req, res) => {
  try {
    // 1) Load DOCX template
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath); // Buffer

    // 2) Compute prices using the incoming payload
    // Make sure req.body matches the expected structure for collectSelections(payload)
    const computed = await pricing.computePrices(req.body || {});

    // 3) Prepare docxtemplater
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 4) Map data into template variables
    const data = mapData(req.body || {}, computed);
    console.log('[docx-template] replacing keys:', Object.keys(data));
    // If you need to inspect service lines:
    // console.log('[docx-template] service lines:', data.ServiceLines);

    doc.setData(data);

    // Will throw if a placeholder in DOCX is malformed (strict mode in tags)
    doc.render();

    const out = doc.getZip().generate({ type: 'nodebuffer' });

    // Optional: write to disk for verification during development
    try {
      const verifyOut = path.join(process.cwd(), 'out-Angebot.docx');
      fsSync.writeFileSync(verifyOut, out);
      console.log('[docx-template] wrote generated DOCX:', verifyOut, 'size:', out.length);
    } catch (e) {
      console.warn('[docx-template] could not write verify file:', e?.message || e);
    }

    // 5) Send as download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Angebot.docx"');
    res.send(out);
  } catch (e) {
    console.error('DOCX generation failed:', e);
    res.status(500).json({ error: 'DOCX generation failed', detail: e.message || String(e) });
  }
});

export default router;