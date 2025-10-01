import express from 'express';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
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

// ✅ UPDATED: Modern docxtemplater API usage
async function renderDocx(templatePath, data) {
  const content = await fs.readFile(templatePath);
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { 
    paragraphLoop: true, 
    linebreaks: true, 
    nullGetter: () => '' 
  });
  
  try {
    doc.render(data);
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

// ✅ IMPROVED: Much more robust LibreOffice PDF conversion
async function convertDocxToPdf(docxBuffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docx2pdf-'));
  const timestamp = Date.now();
  const randomId = randomBytes(4).toString('hex');
  const inPath = path.join(tmpDir, `input-${timestamp}-${randomId}.docx`);
  
  try {
    await fs.writeFile(inPath, docxBuffer);
    console.log(`[PDF] Written DOCX to: ${inPath} (${docxBuffer.length} bytes)`);

    const args = [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', tmpDir,
      '--nologo',
      '--nolockcheck',
      '--nodefault',
      '--norestore',
      '--invisible',
      inPath
    ];

    console.log('[PDF] Starting LibreOffice conversion...');
    const startTime = Date.now();

    await new Promise((resolve, reject) => {
      const p = spawn('soffice', args, { 
        stdio: ['ignore', 'ignore', 'ignore'], // Suppress all output to avoid popups
        env: {
          ...process.env,
          HOME: tmpDir,           // Temporary home to avoid config conflicts
          TMPDIR: tmpDir,         // Ensure temp files go to our controlled location
          DISPLAY: ':99',         // Fake display to avoid GUI (if X11 is available)
          LIBREOFFICE_USER_PATH: tmpDir  // Isolate user config
        },
        detached: false
      });

      let timeoutId = setTimeout(() => {
        console.log('[PDF] LibreOffice timeout, killing process...');
        p.kill('SIGKILL');
        reject(new Error('LibreOffice conversion timeout after 60 seconds'));
      }, 60000); // 60 second timeout

      p.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error('[PDF] LibreOffice spawn error:', err);
        reject(err);
      });
      
      p.on('exit', (code, signal) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.log(`[PDF] LibreOffice finished in ${duration}ms with code ${code}, signal ${signal}`);
        
        // Don't reject on exit code 1 - LibreOffice often returns this even on success
        resolve();
      });
    });

    // Wait a bit for file system to sync
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try multiple strategies to find the PDF
    let pdfBuffer = null;
    
    console.log('[PDF] Searching for generated PDF...');
    
    // Strategy 1: Expected filename pattern
    const baseName = path.basename(inPath, '.docx');
    const expectedPdfPath = path.join(tmpDir, `${baseName}.pdf`);
    try {
      const stat = await fs.stat(expectedPdfPath);
      if (stat.isFile() && stat.size > 0) {
        pdfBuffer = await fs.readFile(expectedPdfPath);
        console.log(`[PDF] Found PDF at expected path: ${expectedPdfPath} (${pdfBuffer.length} bytes)`);
      }
    } catch (e) {
      console.log(`[PDF] Expected PDF not found: ${expectedPdfPath}`);
    }

    // Strategy 2: Search directory for any PDF
    if (!pdfBuffer) {
      try {
        const files = await fs.readdir(tmpDir);
        console.log(`[PDF] Files in temp dir: ${files.join(', ')}`);
        
        const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
        console.log(`[PDF] PDF files found: ${pdfFiles.join(', ')}`);
        
        for (const pdfFile of pdfFiles) {
          try {
            const pdfPath = path.join(tmpDir, pdfFile);
            const stat = await fs.stat(pdfPath);
            if (stat.size > 0) {
              pdfBuffer = await fs.readFile(pdfPath);
              console.log(`[PDF] Using PDF file: ${pdfFile} (${pdfBuffer.length} bytes)`);
              break;
            }
          } catch (e) {
            console.log(`[PDF] Could not read ${pdfFile}:`, e.message);
          }
        }
      } catch (e) {
        console.error('[PDF] Error reading temp directory:', e);
      }
    }

    // Strategy 3: Try common alternative names
    if (!pdfBuffer) {
      const alternativeNames = [
        'input.pdf',
        'document.pdf',
        'output.pdf',
        `${timestamp}.pdf`,
        `${randomId}.pdf`
      ];
      
      for (const name of alternativeNames) {
        try {
          const altPath = path.join(tmpDir, name);
          const stat = await fs.stat(altPath);
          if (stat.isFile() && stat.size > 0) {
            pdfBuffer = await fs.readFile(altPath);
            console.log(`[PDF] Found PDF with alternative name: ${name} (${pdfBuffer.length} bytes)`);
            break;
          }
        } catch (e) {
          // Continue to next alternative
        }
      }
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      // List all files for debugging
      try {
        const allFiles = await fs.readdir(tmpDir);
        console.error('[PDF] All files in temp dir:', allFiles);
        
        // Check file sizes
        for (const file of allFiles) {
          try {
            const stat = await fs.stat(path.join(tmpDir, file));
            console.error(`[PDF] ${file}: ${stat.size} bytes`);
          } catch (e) {
            console.error(`[PDF] Could not stat ${file}`);
          }
        }
      } catch (e) {
        console.error('[PDF] Could not list temp directory');
      }
      
      throw new Error('PDF file not found after conversion - LibreOffice may have failed silently');
    }

    console.log(`[PDF] Successfully converted to PDF, final size: ${pdfBuffer.length} bytes`);
    return pdfBuffer;
    
  } finally {
    // Cleanup with multiple attempts
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
        console.log(`[PDF] Cleanup successful on attempt ${attempt}`);
        break;
      } catch (e) {
        if (attempt === 5) {
          console.warn('[PDF] Final cleanup failed after 5 attempts:', e.message);
        } else {
          console.log(`[PDF] Cleanup attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }
}

/* ===========================
   Material Overview Aggregation
   =========================== */

// Fill missing names by querying products once (for optional items etc.)
async function ensureNames(lines) {
  const missingIds = [...new Set(
    lines
      .filter(l => (!l.name || !l.name.trim()) && l.materialNumber)
      .map(l => l.materialNumber)
  )];
  if (!missingIds.length) return lines;

  const docs = await ProductModel.find(
    { productId: { $in: missingIds } },
    { productId: 1, name: 1 }
  ).lean();

  const map = new Map(docs.map(d => [d.productId, d.name || '']));
  for (const l of lines) {
    if ((!l.name || !l.name.trim()) && l.materialNumber) {
      const nm = map.get(l.materialNumber);
      if (nm) l.name = nm;
    }
  }
  return lines;
}

function normalizeSourceLine(raw) {
  if (!raw) return null;
  const id = raw.productId || raw.id || raw.materialNumber || raw.nr || '';
  const qty = Number(raw.qty ?? raw.quantity ?? raw.menge ?? 0) || 0;
  const label = raw.label || '';
  const unit = raw.unit || raw.einheit || 'Stck.';
  let name = raw.name || raw.title || raw.description || '';

  // Prefer the label if name is empty; strip leading "- "
  if (label && !name) name = label.replace(/^-+\s*/, '');

  return {
    materialNumber: String(id || '').trim(),
    name: String(name || '').trim(),
    unit,
    quantity: qty
  };
}

function isFloorPanelLine(l) {
  return (l.materialNumber === 'V5FB02'); // floor panels
}
function isWVPanelLine(l) {
  return (l.materialNumber === 'V3WVK09' || l.materialNumber === 'V3WV09'); // WV panels 997/1497
}

async function aggregateMaterialsForOverview(body = {}, computed = {}) {
  const src = [];

  // 1) computed.materials.lines (primary)
  if (Array.isArray(computed?.materials?.lines)) {
    for (const l of computed.materials.lines) {
      src.push(normalizeSourceLine({
        productId: l.productId || l.id,
        name: l.name,
        qty: l.qty,
        unit: l.unit || 'Stck.',
        label: l.label || ''
      }));
    }
  }

  // 2) body.materials (fallback from client)
  if (Array.isArray(body?.materials)) {
    for (const m of body.materials) {
      src.push(normalizeSourceLine(m));
    }
  }

  // 3) computed.items (optional products as materials lines, if desired)
  if (Array.isArray(computed?.items)) {
    for (const it of computed.items) {
      src.push(normalizeSourceLine({
        productId: it.productId,
        name: it.name, // may be empty; will be resolved via DB
        qty: it.qty,
        unit: 'Stck.'
      }));
    }
  }

  let lines = src.filter(Boolean).filter(l => l.quantity > 0);

  // Ensure all missing names are filled from DB (particularly for optionals)
  lines = await ensureNames(lines);

  // Apply business rules and group by key
  const map = new Map();

  for (const l of lines) {
    // WV panels fallback name if somehow name is still empty
    if (!l.name && isWVPanelLine(l)) {
      l.name = 'Wandverkleidung 3.0 Alu Paneel';
    }
    // Flooring: readable name; article number will be hidden
    if (isFloorPanelLine(l)) {
      if (!l.name) l.name = 'Fußboden‑Paneele (Einzelpaneele)';
      else l.name = l.name.replace(/^-+\s*/, '');
    }

    const unit = l.unit || 'Stck.';
    // Hide material number for floor panels by using a neutral grouping key
    const key = isFloorPanelLine(l) ? `FLOOR_PANELS||${unit}` : `${l.materialNumber}||${unit}`;

    const prev = map.get(key) || {
      materialNumber: isFloorPanelLine(l) ? '' : l.materialNumber, // empty for V5FB02
      name: l.name,
      unit,
      quantity: 0,
      remarks: ''
    };

    // Prefer the longer/more descriptive name when merging
    if (l.name && (!prev.name || l.name.length > prev.name.length)) prev.name = l.name;

    prev.quantity += l.quantity;
    map.set(key, prev);
  }

  // Sort: by material number first (empty will sort first), then by name
  const rows = Array.from(map.values()).sort((a, b) => {
    const n = (a.materialNumber || '').localeCompare(b.materialNumber || '', 'de', { numeric: true });
    if (n) return n;
    return (a.name || '').localeCompare(b.name || '', 'de', { numeric: true });
  });

  return rows;
}

function formatQtyForOverview(q, unit) {
  const integerUnits = new Set(['Stck.', 'Set', 'Pkg', 'Stk', 'Stück']);
  if (integerUnits.has(unit)) return String(Math.round(q));
  const num = Math.round((q + Number.EPSILON) * 100) / 100;
  return num.toFixed(2).replace('.', ','); // German comma
}

/* ===========================
   Angebot mapping
   =========================== */
function mapData(body = {}, computed = {}) {
  const b = body.bereich || {};
  const tb = body.textbausteine || {};

  const {
    items = [],
    productsSubtotal = 0,
    materials = { title: '', lines: [], sum: 0 },
    services = { title: '', lines: [], sum: 0, payer: '', zoneLabel: '', distanceKm: 0, laborHours: 0, laborRate: 0 },

    // use server-computed fields (from pricing.js)
    Nettobetrag: netAfterRabatt_and_Bonus = 0,
    markupPct = 0,
    markup = 0,
    travel = 0,
    total = 0,
    vatOnNet = 0,
    Vat_on_net_AfterDiscount: vatAfterDiscount = 0,
    totalAfterRabatt = 0,
    rabattAmount = 0,
    bonusGross = 0,
    totalAfterBonus = 0,

    // Zuschuss/Selbstkosten from pricing.js
    subsidyAmount = 0,
    selfPayAmount = 0,
  } = computed || {};

  // Placeholders used in Angebot.docx
  const Nettobetrag = fmtCurrency(netAfterRabatt_and_Bonus);       // "Nettobetrag (ohne Rabatt)"
  const Rabatt = fmtCurrency(rabattAmount);                 // Materialrabatt Betrag
  const MwSt = fmtCurrency(vatOnNet);                       // 19% MwSt (nach Rabatt, falls vorhanden)
  const Gesamtsumme = fmtCurrency(total);                   // Brutto vor Rabatt
  const Gesamtsummerabatt = fmtCurrency(totalAfterRabatt);  // "Gesamtbetrag nach Materialrabatt"

  // Synonyms if the template uses alternative tags
  const NettobetragOhneRabatt = Nettobetrag;
  const Materialrabatt = Rabatt;
  const GesamtbetragNachMaterialrabatt = Gesamtsummerabatt;

  // (If you actually use these in the template, keep them; otherwise you can delete)
  const Selbstkostenanteil = '';

  const MarkupPctStr = markupPct ? `${Math.round(markupPct * 100)}%` : '';
  const MarkupValue = fmtCurrency(markup);
  const TravelValue = fmtCurrency(travel);

  // Services block
  const serviceLines = (services?.lines || [])
  .filter(l => l && l.key !== 'facharbeiter' && !l.docxHide)
  .map(l => l.label);
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

  const hasRabatt = (rabattAmount ?? 0) > 0;
  const hasBonus  = (bonusGross   ?? 0) > 0;

  // --- bonus detection (prefer pricing flags, fallback to payload.rabatt) ---
  const pricingFlags = computed?.flags || {};
  const payloadRabatt = body?.rabatt || {};

  const hasBonusGrab = Boolean(
    pricingFlags.bonusGrab ?? payloadRabatt.bonusGrab ?? false
  );

  const hasBonus300 = Boolean(
    pricingFlags.bonus300 ?? payloadRabatt.bonus300 ?? false
  );

  // Assemble up to two rows; first present gets pos "003", second "004"
  const BonusRows = [];
  let pos = '003';

  if (hasBonusGrab) {
    BonusRows.push({
      Bonus: pos,
      BonusMenge: '1 Stk',
      BonusLabel: 'Aktion: Haltegriff',
      BonusDetail: '-- 1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage',
      preis: '0,00 €',
      gesamt: '-0,00 €',
    });
    pos = '004';
  }

  if (hasBonus300) {
    BonusRows.push({
      Bonus: pos,
      BonusMenge: '1 Stk',
      BonusLabel: 'Bestandkundenbonus:',
      BonusDetail: '-- Rabatt von 300 € ab einem Gesamtwert von 3.000',
      preis: '-252,10 €',
      gesamt: '-252,10 €',
    });
  }

  // Set hasBonus based on whether we actually have rows to render
  const hasBonusrows = BonusRows.length > 0;

  // --- Selbstkostenanteil for DOCX ---
  const toNum = v => (typeof v === 'number' ? v : Number(String(v || '').replace(',', '.')) || 0);

  const subsidyAmountNum  = toNum(computed?.subsidyAmount);
  const totalNum = toNum(computed?.total);
  const selfPayAmountNum  = toNum(computed?.selfPayAmount);

  const SelbstkostenanteilFmt = fmtCurrency(selfPayAmountNum);
  const Zuschusskrankenkasse  = fmtCurrency(subsidyAmountNum);

  // Show line iff a subsidy actually applied
  const hasZuschuss = subsidyAmountNum > 0;

  // Build the summary rows exactly as you want them to appear:
  /*const baseTotals = [
    {
      label: hasRabatt ? 'Nettobetrag (ohne Rabatt)' : 'Nettobetrag',
      value: fmtCurrency(netBeforeDiscount)
    },
    ...(hasRabatt ? [{ label: 'Rabatt', value: fmtCurrency(rabattAmount) }] : []),
    { label: 'zzgl. 19% MwSt.', value: fmtCurrency(vatOnNet) },
    { label: 'Gesamtsumme', value: fmtCurrency(total) },
    ...(hasRabatt ? [{ label: 'Gesamtbetrag nach Materialrabatt', value: fmtCurrency(totalAfterRabatt) }] : []),
    ...(hasBonus ? [{ label: 'Gesamtbetrag nach Neukundenbonus', value: fmtCurrency(totalAfterBonus) }] : []),
    ...(hasZuschuss ? [{ label: 'Zuschuss Krankenkasse', value: Zuschusskrankenkasse }] : []),
    ...(hasZuschuss ? [{ label: 'Selbstkostenanteil', value: SelbstkostenanteilFmt }] : []),
  ]; */

  const baseTotals = [
    { label: 'Nettobetrag', value: fmtCurrency(netAfterRabatt_and_Bonus) },
    { label: 'zzgl. 19% MwSt.', value: fmtCurrency(vatOnNet) },
    { label: 'Gesamtsumme', value: fmtCurrency(total) },
 
  ];

  // mark every second row (0-based: 1,3,5,...) as "alt"
  const Totals = baseTotals.map((r, i) => ({ ...r, isAlt: i % 2 === 0 }));

  // Pick Regie-Stundensatz based on payer
  const payerNorm = String(PayerKind || '').toUpperCase();
  const isKK = payerNorm === 'KK' || payerNorm === 'KASSENKUNDE';
  const isSZ = payerNorm === 'SZ' || payerNorm === 'SELBSTZAHLER';

  // Prefer explicit rates per payer; fallback to computed laborRate if neither was selected yet
  let regieRateNum;
  if (isKK) regieRateNum = 69.50;
  else if (isSZ) regieRateNum = 59.50;
  else regieRateNum = Number(services?.laborRate) || 0;

  // Format exactly like "69,50€" (no space) to match your paragraph
  const RegieRateFmt = regieRateNum ? `${regieRateNum.toFixed(2).replace('.', ',')}€` : '';

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
    Arbeit: fmtCurrency(services?.sum ?? 0),
    Material: fmtCurrency(materials?.sum ?? 0),

    // Text blocks
    Long1: tb.long1 ?? '',
    Long3: tb.long3 ?? '',
    Long: tb.long ?? '',

    // Totals (single placeholders)
    Nettobetrag,
    Rabatt,
    MwSt,
    Gesamtsumme,
    Selbstkostenanteil,
    Zuschusskrankenkasse,
    Gesamtsummerabatt,

    // Computed summary
    Nettobetrag: fmtCurrency(netAfterRabatt_and_Bonus),
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

    // for summary rows / conditionals
    hasRabatt,
    hasBonus,
    hasBonusrows,
    Totals,
    BonusRows,

    // for selbstkostenanteil.
    Selbstkostenanteil: SelbstkostenanteilFmt,  // keeps {Selbstkostenanteil} working
    SelbstkostenanteilFmt,                      // if you use this tag directly
    Zuschusskrankenkasse,                       // formatted subsidy for template
    hasSubsidyLine: hasZuschuss,

    // for Regie-Stundensatz
    RegieRateFmt,
  };
}

/* ===========================
   Routes
   =========================== */

// -------- Existing Angebot DOCX route --------
router.post('/', async (req, res) => {
  try {
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath);

    const computed = await pricing.computePrices(req.body || {});
    console.log('[docx] computed subsidy:',
      { subsidyAmount: computed?.subsidyAmount,
        total: computed?.total,
        selfPayAmount: computed?.selfPayAmount ,
        userInput: computed?.subsidyInput}
    );

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const data = mapData(req.body || {}, computed);
    console.log('[docx-template] replacing keys:', Object.keys(data));

    try {
      console.log('[docx] subsidyKind:', computed?.subsidyKind);
      doc.render(data);
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

// ✅ UPDATED: Material overview DOCX route with enhanced aggregation and name resolution
router.post('/material-overview', async (req, res) => {
  try {
    const computed = await pricing.computePrices(req.body || {});
    const rows = await aggregateMaterialsForOverview(req.body || {}, computed);

    const materials = rows.map((m, i) => ({
      pos: i + 1,
      materialNumber: m.materialNumber || '', // blank for V5FB02 (floor panels)
      name: m.name || '',
      quantity: formatQtyForOverview(m.quantity, m.unit || 'Stck.'),
      unit: m.unit || 'Stck.',
      remarks: m.remarks || ''
    }));

    // Build customer header fields
    const b = req.body?.bereich || {};
    const salutation = b.salutation || '';
    const firstName = b.firstName || '';
    const lastName = b.lastName || '';
    const kundeName = [salutation, firstName, lastName].filter(Boolean).join(' ') || '';
    const street = b.street || '';
    const city = b.city || '';
    const plz = b.postalCode || '';
    const adresse = [street, [plz, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

    const data = {
      angebotNummer: req.body?.offerNumber || 'ANG-0001',
      datum: (b.date || dayjs().format('YYYY-MM-DD')),
      kunde: kundeName,
      adresse,
      ansprechpartner: (b.emc2_contact || '').trim(),
      salutation,
      firstName,
      lastName,
      street,
      plz,
      city,
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

// ✅ IMPROVED: PDF route with much more robust LibreOffice handling
router.post('/pdf', async (req, res) => {
  try {
    const templatePath = path.join(process.cwd(), 'src', 'templates', 'Angebot.docx');
    const content = await fs.readFile(templatePath);

    const computed = await pricing.computePrices(req.body || {});
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const data = mapData(req.body || {}, computed);

    try {
      doc.render(data);
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
      return res.status(500).json({ error: 'DOCX render failed', detail: msg, properties: e.properties || null });
    }

    const docxBuffer = doc.getZip().generate({ type: 'nodebuffer' });

    // Optional: write debug copy
    try {
      const verifyOut = path.join(process.cwd(), 'out-Angebot.docx');
      fsSync.writeFileSync(verifyOut, docxBuffer);
      console.log('[docx-template/pdf] wrote generated DOCX for conversion:', verifyOut);
    } catch (e) {
      console.warn('[docx-template/pdf] could not write verify docx:', e?.message || e);
    }

    // Convert to PDF using improved LibreOffice function
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Angebot.pdf"');
    res.send(pdfBuffer);
    
  } catch (e) {
    console.error('DOCX->PDF conversion failed:', e);
    res.status(500).json({ error: 'DOCX->PDF conversion failed', detail: e.message || String(e) });
  }
});

export default router;