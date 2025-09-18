// src/routes/docx-template.js
import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

import ProductModel from '../models/Product.js';
import pricingFactory from '../logic/pricing.js';

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

// -------- Helpers --------
function fmtCurrency(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(num);
}

async function renderDocx(templatePath, data) {
  const content = await fs.readFile(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.setData(data);
  try {
    doc.render();
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('Docxtemplater render error:', msg);
    if (e?.properties?.errors) {
      for (const er of e.properties.errors) {
        console.error('- Docx error:', {
          id: er.id, explanation: er.explanation, file: er.file,
          xtag: er.xtag, context: er.context, offset: er.offset,
        });
      }
    }
    throw new Error(`DOCX render failed: ${msg}`);
  }
  return doc.getZip().generate({ type: 'nodebuffer' });
}

// Collect + aggregate materials for the Material overview
function aggregateMaterialsForOverview(body = {}, computed = {}) {
  const sourceLines = [];

  // 1) From computed.materials.lines (if present)
  const compMat = computed?.materials;
  if (Array.isArray(compMat?.lines)) {
    for (const l of compMat.lines) {
      sourceLines.push({
        materialNumber: l.materialNumber || l.sku || l.productId || '',
        name: l.name || l.label || '',
        unit: l.unit || 'Stck.',
        quantity: Number(l.qty ?? l.quantity ?? 0) || 0,
        remarks: l.remarks || ''
      });
    }
  }

  // 2) Fallback: explicit body.materials (if UI sends any)
  if (Array.isArray(body?.materials)) {
    for (const m of body.materials) {
      sourceLines.push({
        materialNumber: m.materialNumber || m.nr || m.id || '',
        name: m.name || m.title || m.description || '',
        unit: m.unit || m.einheit || 'Stck.',
        quantity: Number(m.quantity ?? m.menge ?? 0) || 0,
        remarks: m.remarks || m.bemerkung || ''
      });
    }
  }

  // 3) Optional: include computed items as materials (if desired)
  const items = computed?.items || [];
  for (const it of items) {
    if (!it) continue;
    sourceLines.push({
      materialNumber: it.productId || it.sku || '',
      name: it.name || '',
      unit: it.unit || 'Stck.',
      quantity: Number(it.qty ?? 0) || 0,
      remarks: ''
    });
  }

  // Aggregate by materialNumber + unit
  const map = new Map();
  for (const l of sourceLines) {
    const nr = String(l.materialNumber || '').trim();
    const unit = String(l.unit || 'Stck.').trim();
    const qty = Number(l.quantity) || 0;
    if (!nr || qty <= 0) continue;

    const key = `${nr}||${unit}`;
    const prev = map.get(key) || { materialNumber: nr, name: String(l.name || '').trim(), unit, quantity: 0, remarks: '' };

    // Prefer longer name
    const nm = String(l.name || '').trim();
    if (nm && (!prev.name || nm.length > prev.name.length)) prev.name = nm;

    // Merge remarks
    const rm = String(l.remarks || '').trim();
    if (rm) prev.remarks = prev.remarks ? `${prev.remarks}; ${rm}` : rm;

    prev.quantity += qty;
    map.set(key, prev);
  }

  // Sort by material number then name
  const rows = Array.from(map.values()).sort((a, b) => {
    const n = a.materialNumber.localeCompare(b.materialNumber, 'de', { numeric: true });
    if (n) return n;
    return a.name.localeCompare(b.name, 'de', { numeric: true });
  });

  return rows;
}

function formatQtyForOverview(q, unit) {
  const integerUnits = new Set(['Stck.', 'Set', 'Pkg']);
  if (integerUnits.has(unit)) return String(Math.round(q));
  const num = Math.round((q + Number.EPSILON) * 100) / 100;
  return num.toFixed(2).replace('.', ','); // German comma
}

// -------- Existing Angebot mapping --------
function mapData(body = {}, computed = {}) {
  const b = body.bereich || {};
  const tb = body.textbausteine || {};

  const {
    items = [],
    productsSubtotal = 0,
    materials = { title: '', lines: [], sum: 0 },
    services = { title: '', lines: [], sum: 0, payer: '', zoneLabel: '', distanceKm: 0, laborHours: 0, laborRate: 0 },
    subtotal = 0,
    markupPct = 0,
    markup = 0,
    travel = 0,
    total = 0,
  } = computed || {};

  const prix = body.preise || {};
  const sum = body.summe || {};

  const Nettobetrag = sum.netto ?? fmtCurrency(subtotal);
  const Rabatt = sum.rabatt ?? '';
  const MwSt = sum.mwst ?? '';
  const Gesamtsumme = sum.gesamt ?? fmtCurrency(total);
  const Selbstkostenanteil = sum.selbstkostenanteil ?? '';
  const Zuschusskrankenkasse = sum.zuschuss ?? '';
  const Gesamtsummerabatt = sum.gesamtsummerabatt ?? '';

  const MarkupPctStr = markupPct ? `${Math.round(markupPct * 100)}%` : '';
  const MarkupValue = fmtCurrency(markup);
  const TravelValue = fmtCurrency(travel);

  // Services block
  const serviceLines = (services?.lines || []).map(l => l.label);
  const ServicePosTitle = services?.title || 'Auszuführende Arbeiten';
  const ServiceUnitPrice = fmtCurrency(services?.sum || 0);
  const ServiceTotal = fmtCurrency(services?.sum || 0);

  // Materials block
  const MaterialsPosTitle = materials?.title || 'Material für Badumbau';
  const MaterialsUnitPrice = fmtCurrency(materials?.sum || 0);
  const MaterialsTotal = fmtCurrency(materials?.sum || 0);
  const MaterialsLines = (materials?.lines || []).map(l => {
    const qtyStr = Number(l.qty || 0).toFixed(2).replace(/\.00$/, '');
    const nameOrId = l.name || l.productId || '';
    return {
      MaterialLine: l.label ? l.label : `- ${qtyStr} Stk ${nameOrId}`,
    };
  });

  const PayerKind = services?.payer || (b.payer || '');
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
    Ansprechpartner: (b.emc2_contact || '').trim(),
    Kundennummer: b.customerNumber || '',
    Greeting: b.salutation === 'Frau' ? 'Sehr geehrte Frau' : (b.salutation === 'Herr' ? 'Sehr geehrter Herr' : 'Guten Tag'),
    Angebotsnummer: body.offerNumber || 'ANG-0001',

    // Legacy/optional price fields
    Arbeit: prix.arbeit ?? '',
    Material: prix.material ?? '',

    // Text blocks
    Long1: tb.long1 ?? '',
    Long3: tb.long3 ?? '',
    Long: tb.long ?? '',

    // Totals
    Nettobetrag,
    Rabatt,
    MwSt,
    Gesamtsumme,
    Selbstkostenanteil,
    Zuschusskrankenkasse,
    Gesamtsummerabatt,

    // Computed summary
    Subtotal: fmtCurrency(subtotal),
    MarkupPct: MarkupPctStr,
    MarkupValue,
    TravelValue,

    // Items (legacy)
    Items: (items || []).map(i => ({
      ProduktId: i.productId,
      Menge: i.qty,
      Einzelpreis: fmtCurrency(i.unitPrice),
      Zwischensumme: fmtCurrency(i.lineTotal),
    })),
    ProdukteZwischensumme: fmtCurrency(productsSubtotal),

    // Service position
    ServicePosTitle,
    ServiceUnitPrice,
    ServiceTotal,
    ServiceLines: serviceLines.map(txt => ({ ServiceLine: txt })),

    // Materials position
    MaterialsPosTitle,
    MaterialsUnitPrice,
    MaterialsTotal,
    MaterialsLines,

    // Meta
    PayerKind,
    ZoneChosen,
    DistanceKm,
    LaborHours,
    LaborRate: LaborRate ? `${LaborRate.toFixed(2)} €` : '',
  };
}

// -------- Existing Angebot DOCX route --------
router.post('/', async (req, res) => {
  try {
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath);

    const computed = await pricing.computePrices(req.body || {});

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const data = mapData(req.body || {}, computed);
    console.log('[docx-template] replacing keys:', Object.keys(data));

    doc.setData(data);

    try {
      doc.render();
    } catch (e) {
      console.error('Docxtemplater render error:', e?.message || e);
      if (e?.properties?.errors) {
        for (const er of e.properties.errors) {
          console.error('- Docx error:', {
            id: er.id, explanation: er.explanation, file: er.file,
            xtag: er.xtag, context: er.context, offset: er.offset,
          });
        }
      }
      return res.status(500).json({ error: 'DOCX render failed', detail: e.message || String(e), properties: e.properties || null });
    }

    const out = doc.getZip().generate({ type: 'nodebuffer' });

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

// -------- NEW: Material overview DOCX route --------
router.post('/material-overview', async (req, res) => {
  try {
    const computed = await pricing.computePrices(req.body || {});
    const rows = aggregateMaterialsForOverview(req.body || {}, computed);

    const materials = rows.map((m, i) => ({
      pos: i + 1,
      materialNumber: m.materialNumber,
      name: m.name,
      quantity: formatQtyForOverview(m.quantity, m.unit || 'Stck.'),
      unit: m.unit || 'Stck.',
      remarks: m.remarks || ''
    }));

    const data = {
      angebotNummer: req.body?.offerNumber || 'ANG-0001',
      datum: (req.body?.bereich?.date || dayjs().format('YYYY-MM-DD')),
      kunde: req.body?.bereich?.customerName || req.body?.kunde?.name || '',
      ansprechpartner: (req.body?.bereich?.emc2_contact || '').trim(),
      materials
    };

    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Materialuebersicht.docx');
    const out = await renderDocx(templatePath, data);

    try {
      const verifyOut = path.join(process.cwd(), 'out-Materialuebersicht.docx');
      fsSync.writeFileSync(verifyOut, out);
      console.log('[material-overview] wrote generated DOCX:', verifyOut, 'size:', out.length);
    } catch (e) {
      console.warn('[material-overview] could not write verify file:', e?.message || e);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Materialuebersicht.docx"');
    res.send(out);
  } catch (e) {
    console.error('Materialübersicht generation failed:', e);
    res.status(500).json({ error: 'Materialübersicht generation failed', detail: e.message || String(e) });
  }
});

export default router;