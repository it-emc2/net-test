// src/logic/pricing.js
export default (ProductModel) => {

  // Minimal helper: adjust only the visible label to billable qty (selected - 1)
// - Does NOT change qty, unitPrice, or lineTotal (so totals remain untouched).
// - If billable becomes 0 and hideWhenZero=true, remove the line from the list (keeps "0 Stk" hidden).
function setCL40LabelToBillable(list, { hideWhenZero = false } = {}) {
  const row = list?.find(l => (l.productId || l.id) === 'CLPESG40');
  if (!row) return;

  const selectedQty = Number(row.qty || 0) || 0;
  const billableQty = Math.max(0, selectedQty - 1);

  if (billableQty === 0 && hideWhenZero) {
    const idx = list.indexOf(row);
    if (idx > -1) list.splice(idx, 1);
    return;
  }

  // strip any "(hidden)" that older logic may have appended
  const baseName = (row.name || row.label || row.productId || '')
    .replace(/\s*\(hidden\)\s*$/,'')
    .trim();

  row.label = `- ${billableQty} Stk ${baseName}`;
  // IMPORTANT: do not touch row.qty / row.unitPrice / row.lineTotal
}


// --- helper: include selected tray as a material line ---

  async function getProductsByIds(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return new Map();
    const docs = await ProductModel.find({ productId: { $in: unique } }).lean();
    const map = new Map();
    for (const d of docs) {
      map.set(d.productId, {
        price: Number(d.price) || 0,
        name: d.name || '',
      });
    }
    return map;
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ceilSafe = (n) => Math.ceil((Number(n) || 0) - 1e-12);

  const TAX_RATE = 0.19;

  function collectSelections(payload) {
    const out = [];
    const opt = payload?.optional || {};
    // --- quantities for Haltegriffe (esp. CLPESG40) ---
const cl40Qty = Number(opt?.qty_CLPESG40 ?? (opt?.opt_CLPESG40 ? 1 : 0)) || 0;
// if you also use the other grab bars anywhere, define them too (optional):
const cl60Qty = Number(opt?.qty_CLPESG60 ?? (opt?.opt_CLPESG60 ? 1 : 0)) || 0;
const cl80Qty = Number(opt?.qty_CLPESG80 ?? (opt?.opt_CLPESG80 ? 1 : 0)) || 0;

    const aliasToId = { CL_BASIN: 'CL' };
    const push = (id, qtyRaw, checked) => {
      const qtyNum = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== ''
        ? Number(qtyRaw)
        : (checked ? 1 : 0);
      const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
      if ((checked || qty > 0) && qty > 0) out.push({ productId: id, qty });
    };
    for (const [key, val] of Object.entries(opt)) {
      if (key.startsWith('opt_')) {
        const k = key.slice(4);
        const id = aliasToId[k] || k;
        push(id, opt[`qty_${k}`], Boolean(val));
      } else if (key.startsWith('qty_')) {
        const k = key.slice(4);
        const id = aliasToId[k] || k;
        const qty = val;
        const checked = Boolean(opt[`opt_${k}`]);
        push(id, qty, checked);
      }
    }
    return out;
  }

  // Prefer numeric payload.pricing.markupPct; fallback to bereich.aufschlag like "35%".
  const extractMarkupPct = (payload) => {
    const fromNumeric = payload?.pricing?.markupPct;
    if (typeof fromNumeric === 'number' && Number.isFinite(fromNumeric)) {
      return fromNumeric;
    }
    const a = payload?.bereich?.aufschlag;
    if (!a) return 0.35; // safe default
    const m = String(a).trim().match(/^(\d+)\%$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n / 100;
    }
    return 0.35;
  };

  // Build zero-cost "work notes" for DOCX and UI
  function computeWorkNotes(payload) {
    const opt = payload?.optional || {};
    const kind = payload?.wandverkleidung?.wvKind || '';
     const dusch = payload?.duschwanne || {};

    const picked = new Set();

    // Wandverkleidung
    if (kind === 'Fehlstellen') picked.add('Schließen der Fehlstellen');
    if (kind === 'Deckenhoch') picked.add('Verkleidung Deckenhoch im Dusch/ Wannenbereich');

    // Generic detector: true if non-empty array/string, or qty > 0
    const chosen = (flag, qty) => {
      if (Array.isArray(flag) && flag.length > 0) return true;
      if (typeof flag === 'string' && flag.trim() !== '') return true;
      if (flag === true) return true;
      const q = Number(qty);
      return Number.isFinite(q) && q > 0;
    };

    // IMPORTANT: your keys include [] in their names
    const shower = chosen(opt['optShower[]'], opt.qty_V22WS1R || opt.qty_TEMPDSU250 || opt.qty_V22BG903R || opt.qty_DEDS2503E);
    const grab   = chosen(opt['optGrab[]'],   opt.qty_CLPESG40 || opt.qty_CLPESG60 || opt.qty_CLPESG80);
    const fold   = chosen(opt['optFold[]'],   opt.qty_DEPSKG60 || opt.qty_DEPSKG85);
    const basin  = chosen(opt['optBasin[]'],  opt.qty_CL60);
    const tap    = chosen(opt['optBasinTap[]'], opt.qty_CL_BASIN || opt.qty_DEPOH);
    const thermo = chosen(opt['optThermo[]'], opt.qty_CLTB || opt.qty_DEPTB || opt.qty_CLB);
    const seat   = chosen(opt['optSeat[]'],   opt.qty_DEPKS);

    if (shower) picked.add('Auswechseln des Duschsystems');
    if (grab)   picked.add('Anbringen zusätzlicher Haltegriffe');
    if (fold)   picked.add('Anbringen zusätzlicher Stützklappgriffe');
    if (basin)  picked.add('Auswechseln eines Waschtisches');
    if (tap)    picked.add('Einbau einer einhand-Waschtischbatterie');
    if (thermo) picked.add('Austausch eines Thermostates');
    if (seat)   picked.add('Einbau eines Klappsitzes');

// >>> robust DW workTasks parse (handles odd literal keys like "duschwanne[workTasks][]")
function normalizeDWTasks(payload) {
  const dw = payload?.duschwanne ?? {};
  const out = [];

  const addVal = (v) => {
    if (!v) return;
    if (Array.isArray(v)) { out.push(...v); return; }
    if (typeof v === 'string') {
      // try JSON array first; else comma-separated; else single value
      try { const parsed = JSON.parse(v); if (Array.isArray(parsed)) { out.push(...parsed); return; } } catch {}
      const parts = v.includes(',') ? v.split(',') : [v];
      out.push(...parts.map(s => s.trim()).filter(Boolean));
      return;
    }
  };

  // Expected shapes
  addVal(dw.workTasks);
  addVal(dw['workTasks[]']);
  addVal(payload?.['duschwanne[workTasks][]']);
  addVal(payload?.['duschwanne.workTasks']);
  addVal(payload?.duschwanne_workTasks);

  // NEW: catch any weird nesting under duschwanne (like "duschwanne[workTasks][]")
  for (const [k, v] of Object.entries(dw)) {
    if (/worktasks/i.test(k)) addVal(v);
  }

  // de-dup & return
  return Array.from(new Set(out));
}

const MAP_DW = {
  remove_tub:        'Entfernen und Entsorgen der Badewanne inkl. Befliesung',
  remove_enclosure:  'Entfernen und Entsorgen der Duschabtrennung',
  install_tray:      'Einbau der Duschwanne',
  install_enclosure: 'Einbau der Duschabtrennung',
};

const dwTasks = normalizeDWTasks(payload);
for (const key of dwTasks) {
  const label = MAP_DW[String(key)];
  if (label) picked.add(label);
}
// <<< end robust parse

console.log('[worknotes] dw raw:', payload?.duschwanne);
console.log('[worknotes] dw tasks norm:', normalizeDWTasks(payload));

    return Array.from(picked).map(txt => ({
      key: 'worknote',
      label: `- ${txt}`,
      amount: 0,
    }));
  }

async function computeMaterials(payload) {
  const dusch = payload?.duschwanne || {};
  const wv = payload?.wandverkleidung || {};
  const opt = payload?.optional || {};

  // For Haltegriff counts (used by UI logic later)
  let grabTotalQty = 0;
  let cl40Qty = 0;

  const lines = [];
  const idsNeeded = new Set();

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ceilSafe = (n) => Math.ceil((Number(n) || 0) - 1e-12);

  // helper to push unresolved lines; we resolve names/prices at the end
  const add = (id, qty, labelOverride, unitOverride, source) => {
    const q = Number(qty) || 0;
    if (!id || q <= 0) return;
    idsNeeded.add(id);
    lines.push({
      id,
      qty: q,
      label: labelOverride || null,
      unitOverride: Number.isFinite(unitOverride) ? Number(unitOverride) : null,
      source: source || null, // 'optional' for optionals, else null
    });
  };

  // ------- Duschwanne ancillary
  if (dusch.abdichtSet) add('TRWDB', 1);
  if (dusch.drainSet)   add('AGD9060', 1);
  if (dusch.smallMaterial) add('KM02', 1);
  if (dusch.stelzlager) add('STELZ', 1);

  // ------- Fußboden
  const addFlooring = !!dusch.addFlooring;
  const floorArea = Number(String(dusch.floorArea ?? '').replace(',', '.')) || 0;

  if (addFlooring && floorArea > 0) {
    // Paneele inkl. 15% Verschnitt
    const panels = ceilSafe((floorArea * 1.15) / 0.3);
    add('V5FB02', panels, `- ${panels} Stk Fußboden-Paneele (1 Paneele = 0.3 m² )`, 20.97);

    // Flächenkleber (0,60 m²/Pack)
    const packs = ceilSafe(floorArea / 0.6);
    if (packs > 0) add('V4FK600', packs, `- ${packs} Pkg Flächenkleber (1 Pkg je 0,60 m²)`, 17.39);

    // Bodenabdichtung pro m² (Checkbox name can be floorSealing or floorSealing[])
    const floorSealingOn = !!(dusch.floorSealing || dusch['floorSealing[]']);
    if (floorSealingOn) {
      const effM2 = round2(floorArea * 1.15);
      if (effM2 > 0) {
        idsNeeded.add('TRBDSET7');
        lines.push({
          id: 'TRBDSET7',
          qty: effM2,
          label: `- ${effM2} m² Trinnity Bodenabdichtung (inkl. 15% Verschnitt)`,
          perM2Base: 7, // derive €/m² = price(TRBDSET7)/7
          source: null,
        });
      }
    }

    // individ. 5.0 V5FB02 — Menge = eingegebene m², Preis/Einheit = DB-Preis von V5FB02
    const m2 = round2(floorArea);
    if (m2 > 0) {
      add('V5FB02', m2, `- ${m2} m² Fußboden individ.5.0 V5FB02`);
    }
  }

  // ------- Wandverkleidung
  const qty997 = Number(wv?.wvQty997 || 0) || 0;
  const qty1497 = Number(wv?.wvQty1497 || 0) || 0;
  const totalPanels = qty997 + qty1497;
  const wvColor = String(wv?.wvColor || '').trim();

  if (qty997 > 0) {
    const base = `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`;
    const label = wvColor ? `${base} — Farbe: ${wvColor}` : base;
    add('V3WVK09', qty997, label);
  }
  if (qty1497 > 0) {
    const base = `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`;
    const label = wvColor ? `${base} — Farbe: ${wvColor}` : base;
    add('V3WV09', qty1497, label);
  }

  if (wv?.wvSealing) add('TRWDSET5', 1);

  if (wv?.wvAdhesive) {
    const userQtyAdh = Number(wv?.wvAdhesiveQty);
    const fallbackAdh = (3 * qty997) + (4 * qty1497);
    const qAdh = Number.isFinite(userQtyAdh) && userQtyAdh > 0 ? userQtyAdh : fallbackAdh;
    if (qAdh > 0) add('V4RKIT', qAdh, `- ${qAdh} Stk Wandverkleidungsklebstoff 3.0/4.0`);
  }

  let endProfilesQty = 0;
  if (wv?.wvEndProfile) {
    endProfilesQty = Number(wv?.wvEndProfileQty) || 0;
    if (endProfilesQty > 0) add('V3A', endProfilesQty);
  }

  if (totalPanels >= 2) {
    const qV3V = totalPanels - 1;
    add('V3V', qV3V, `- ${qV3V} Stk Verbindungsprofil(e) (Plattenanzahl - 1)`);
  }

  if (wv?.wvProfileAdhesive) {
    const userQtyProfGlue = Number(wv?.wvProfileAdhesiveQty);
    const fallbackProfGlue = endProfilesQty;
    const qProfGlue = Number.isFinite(userQtyProfGlue) && userQtyProfGlue > 0 ? userQtyProfGlue : fallbackProfGlue;
    if (qProfGlue > 0) add('V4RPKIT', qProfGlue, `- ${qProfGlue} Stk Profilklebstoff (pro Abschlussprofil 1 Stk)`);
  }

  // ------- OPTIONALS as material lines (tagged so UI can filter them out of Material/Debug)
  try {
    const selections = collectSelections(payload); // [{productId, qty}]
    const isGrabId = id => id === 'CLPESG40' || id === 'CLPESG60' || id === 'CLPESG80';

    grabTotalQty = selections
      .filter(s => isGrabId(s.productId))
      .reduce((a, s) => a + (Number(s.qty) || 0), 0);

    cl40Qty = selections
      .filter(s => s.productId === 'CLPESG40')
      .reduce((a, s) => a + (Number(s.qty) || 0), 0);

    for (const s of selections) {
      add(s.productId, s.qty, null, null, 'optional');
    }
  } catch (e) {
    console.warn('[pricing] optional->materials failed:', e?.message || e);
  }

// ------- Sonderduschabtrennung Hassmann (user-entered net price)
try {
  const raw = payload?.duschabtrennung?.daNetto ?? '';
  // allow 1.234,56 or 1234.56
  const val = Number(String(raw).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  if (Number.isFinite(val) && val > 0) {
    // Add as a non-optional material line so it shows under "Material für Badumbau"
    add(
      'HASSMANN_CUSTOM',                         // arbitrary id (no DB lookup needed)
      1,                                         // qty
      '- 1 Stk Sonderduschabtrennung Hassmann',  // exact label to display
      val,                                       // unitOverride = user price
      null                                       // source=null => regular material
    );
  }
} catch (e) {
  console.warn('[pricing] Hassmann price add failed:', e?.message || e);
}


  // ------- Resolve names/prices once
  const productMap = await getProductsByIds([...idsNeeded]);

  const resolved = lines.map(l => {
    const prod = productMap.get(l.id) || { price: 0, name: '' };

    let unit;
    if (l.perM2Base && prod.price) {
      unit = round2((Number(prod.price) || 0) / Number(l.perM2Base)); // €/m² from set
    } else if (Number.isFinite(l.unitOverride)) {
      unit = Number(l.unitOverride);
    } else {
      unit = Number(prod.price) || 0;
    }

    const displayName = (prod.name || '').trim() || l.id;
    const builtLabel  = `- ${l.qty} Stk ${displayName}`;
    const label       = l.label || builtLabel;
    const lineTotal   = round2(unit * l.qty);

    return {
      productId: l.id,
      name: displayName,
      qty: l.qty,
      unitPrice: unit,
      lineTotal,
      label,
      source: l.source || null,
    };
  });

  const sum = round2(resolved.reduce((a, x) => a + (x.lineTotal || 0), 0));

  // Return grabCounts at materials-level; UI or computePrices can bubble it up
  return {
    title: 'Material für Badumbau',
    lines: resolved,
    sum,
    grabCounts: { cl40: cl40Qty, total: grabTotalQty },
  };
}


  // Services (zones removed)
  function computeServiceCosts(payload) {
  
    const b = payload?.bereich || {};
    const payer = b.payer === 'Kassenkunde' ? 'KK' : (b.payer === 'Selbstzahler' ? 'SZ' : '');
    const oneWayKm = Number(b.distanceKm || 0) || 0; // user enters one-way distance
    const roundTripKm = Math.max(0, oneWayKm * 2);   // bill both ways
    
   
  // total_hours : travel time(Hin- und Rückfahrt) + Arbeitszeit
  const laborHours = Number(payload?.bereich?.laborNumeric ?? 0);
    const total_hours_numeric = Number(payload?.bereich?.totalHoursNumeric ?? 0);
     const total_hours_HH_mm   = String(payload?.bereich?.totalHoursHHMM ?? '');

    const handwerkerCount = 2;
    const laborRateKK = 69.50;
    const laborRateSZ = 59.50;
    const kmRate = 0.70;

    const fahrzeugbereitstellung = 80.00;
    const werkzeug = 7.50;
    const beraeumung = 4.50; // Beräumung der Baustelle

    const kilometerpauschale = round2(roundTripKm * kmRate);
    const laborRate = payer === 'KK' ? laborRateKK : (payer === 'SZ' ? laborRateSZ : 0);
    const facharbeiter = total_hours_numeric * handwerkerCount * laborRate;

    const lines = [];
    lines.push({ key: 'fahrzeug',   label: '- 1,00 Stk Fahrzeugbereitstellung', amount: round2(fahrzeugbereitstellung) });
    lines.push({ key: 'werkzeuge',  label: '- 1,00 Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen', amount: round2(werkzeug) });
    lines.push({ key: 'beraeumung', label: '- 1,00 Stk Beräumung der Baustelle', amount: round2(beraeumung) });
    if (roundTripKm > 0) {
      lines.push({ key: 'kilometer', label: `- ${roundTripKm} km Kilometerpauschale `, amount: kilometerpauschale });
    }
    if (total_hours_numeric  > 0 && laborRate > 0) {
      lines.push({ key: 'facharbeiter', label: `- ${total_hours_HH_mm} (${total_hours_numeric}) Std × ${handwerkerCount} Facharbeiter × ${laborRate.toFixed(2)} €`, amount: facharbeiter , docxHide: true  });
    }


    // Append zero-cost work notes
    try {
      const notes = computeWorkNotes(payload);
      for (const n of notes) lines.push(n);
    } catch (e) {
      console.warn('[pricing] computeWorkNotes failed:', e?.message || e);
    }

    const posTitle = 'Auszuführende Arbeiten';
    const sum = round2(lines.reduce((a, x) => a + (x.amount || 0), 0));
    return { title: posTitle, lines, sum, payer, zoneLabel: '', distanceKm: roundTripKm, laborHours, laborRate };
  }

 

  return {
    computePrices: async (payload) => {
      const selections = collectSelections(payload);
      const ids = [...new Set(selections.map(s => s.productId))];
      const productMap = await getProductsByIds(ids);

      const items = selections.map(s => {
        const prod = productMap.get(s.productId) || { price: 0 };
        const unit = prod.price;
        const qty = s.qty || 1;
        return {
          productId: s.productId,
          qty,
          unitPrice: unit,
          lineTotal: round2(unit * qty),
        };
      });

 let materials = { title: '', lines: [], sum: 0 };
try { materials = await computeMaterials(payload); } catch (e) { console.error('[pricing] computeMaterials failed:', e); }

let services = { title: '', lines: [], sum: 0, payer: '', zoneLabel: '', distanceKm: 0, laborHours: 0, laborRate: 0 };
try { services = computeServiceCosts(payload) || services; } catch (e) { console.error('[pricing] computeServiceCosts failed:', e); }

// --- add the selected Duschwanne (from smart search) as a material line ---
let selectedTray = null;
try {
  const pid = payload?.duschwanne?.chosenTrayProductId;
  const sizeLabel = (payload?.duschwanne?.traySize || '').trim();
 

  if (pid) {
    const already = (materials?.lines || []).some(l =>
      l?.productId === pid || l?.id === pid
    );

    if (!already) {
      const p = await ProductModel.findOne({ productId: pid }).lean();
      if (p) {
        const unit = Number(p.price || 0);
        const qty  = 1; // ← add this
        const line = {
          productId: p.productId,
          name: p.name || '',
          qty,
          unitPrice: unit,
          lineTotal: round2(unit * qty),
          label: sizeLabel
            ? `- ${qty} Stk Duschwanne ${sizeLabel}`
            : `- ${qty} Stk Duschwanne`
        };
        materials.lines.push(line);
        materials.sum = round2((materials.sum || 0) + line.lineTotal);

        selectedTray = {
          productId: p.productId,
          name: p.name || '',
          sizeLabel,
          unitPrice: unit
        };
      }
    }
  }
} catch (e) {
  console.warn('[pricing] addSelectedTrayLine failed:', e?.message || e);
}

// ----- UI/DOCX display adjustments for Haltegriff-Bonus (presentation only) -----
// ---- HALTEGRIFF + DISPLAY PREP ----
const grabCounts = (materials?.grabCounts) || { cl40: 0, total: 0 };
const bonusHG = !!payload?.rabatt?.bonusGrab;

// Split materials into non-optional (for UI) and all (for DOCX)
const allMatLines = Array.isArray(materials?.lines) ? materials.lines.map(x => ({ ...x })) : [];
const optLines = allMatLines.filter(l => l.source === 'optional');
const nonOptLines = allMatLines.filter(l => l.source !== 'optional');

// Sums
const optSum = optLines.reduce((a, x) => a + (Number(x.lineTotal) || 0), 0);
const nonOptSum = (materials?.sum || 0) - optSum;

// --- UI MATERIALS: show ONLY non-optional under “Material für Badumbau”
const uiMaterials = nonOptLines.map(x => ({ ...x }));
// --- UI OPTIONALS: show ONLY optional under “Optional gewählte Produkte”
const uiOptionals = optLines.map(x => ({ ...x }));

// --- DOCX MATERIALS: include everything (business rule)
const docxMaterials = allMatLines.map(x => ({ ...x }));

// --- SERVICES display copies
const uiServices = (services?.lines || []).map(x => ({ ...x }));
const docxServices = (services?.lines || []).map(x => ({ ...x }));

// ===== Apply bonus presentation rules =====
const ONLY_ONE_CL40 = grabCounts.total === 1 && grabCounts.cl40 === 1;

// Helper: decrement CLPESG40 qty by exactly 1 across an array (remove if qty -> 0)
function decOneCL40(arr, { removeIfZero }) {
  let left = 1;
  for (let i = 0; i < arr.length && left > 0; i++) {
    const l = arr[i];
    const pid = l.productId || l.id;
    if (pid === 'CLPESG40') {
      const q = Number(l.qty || 0);
      if (q > 0) {
        const newQ = Math.max(0, q - left);
        left = Math.max(0, left - q);
        l.qty = newQ;
        // recompute lineTotal for display only (prices NEVER used from these lists)
        l.lineTotal = Math.round((Number(l.unitPrice || 0) * newQ + Number.EPSILON) * 100) / 100;
        if (removeIfZero && newQ === 0) {
          arr.splice(i, 1);
          i--;
        }
      }
    }
  }
}

// UI rules
if (bonusHG && grabCounts.cl40 > 0) {

    // Multiple grab bars: show CLPESG40 as qty-1 in Optional UI
    setCL40LabelToBillable(uiOptionals, { hideWhenZero: false }); // show "0 Stk ..." in UI
  // Particular case: single CLPESG40 and no other grab bars → hide the worknote in UI (to mirror DOCX behavior)
  if (ONLY_ONE_CL40) {
    const GRAB_NOTE = 'Anbringen zusätzlicher Haltegriffe';
    const uiNoteIdx = uiServices.findIndex(s => (s.label || '').includes(GRAB_NOTE));
    if (uiNoteIdx >= 0) uiServices.splice(uiNoteIdx, 1);
  }
}

// DOCX rules
if (bonusHG && grabCounts.cl40 > 0) {
  if (ONLY_ONE_CL40) {
    // Single CLPESG40 → hide it completely in DOCX materials
    const idx = docxMaterials.findIndex(l => (l.productId || l.id) === 'CLPESG40');
    if (idx >= 0) docxMaterials.splice(idx, 1);
    // Remove the worknote line from DOCX services
    const GRAB_NOTE = 'Anbringen zusätzlicher Haltegriffe';
    const dn = docxServices.findIndex(s => (s.label || '').includes(GRAB_NOTE));
    if (dn >= 0) docxServices.splice(dn, 1);
  } else {
    // Multiple → decrement one from DOCX
    setCL40LabelToBillable(docxMaterials, { hideWhenZero: true }); // hide when 0 in PDF
  }
}

// Pack adjusted displays (presentation only; totals remain from server truth)
const materialsDisplayUI     = { title: materials.title, sum: nonOptSum, lines: uiMaterials };
const optionalDisplayUI      = { sum: optSum,            lines: uiOptionals };
const materialsDisplayDocx   = { title: materials.title, lines: docxMaterials };
const servicesDisplayUI      = { ...services, lines: uiServices };
const servicesDisplayDocx    = { ...services, lines: docxServices };






    

       //const productsSubtotal = round2((items || []).reduce((sum, i) => sum + (i?.lineTotal || 0), 0) +(materials?.sum ?? 0));
       const productsSubtotal = round2(Number(materials?.sum || 0));

      
      // Extract and enforce markup rules
      let markupPct = extractMarkupPct(payload);
      const payer = payload?.bereich?.payer || '';
      if (payer === 'Selbstzahler') {
        markupPct = 0.35; // enforce rule regardless of client input
      }
      const markup = round2( productsSubtotal  * (markupPct || 0));

      // Nettobetrag
      const baseSubtotal = round2(productsSubtotal + (services?.sum ?? 0) + markup );    
      const baseVat = round2(baseSubtotal * TAX_RATE);
      const base_total =  round2(baseSubtotal +  baseVat );
      // --- Rabatt on MATERIAL only (percent from payload.rabatt.materialDiscountPct) ---
      const materialPct = Number(payload?.rabatt?.materialDiscountPct || 0); // 0..0.09
      const rabattAmount = round2((productsSubtotal || 0) * materialPct);

      // VAT is applied AFTER discount on net amount:
      const netAfterRabatt = round2((baseSubtotal|| 0) - rabattAmount);
      //const Vat_on_net_AfterDiscount = round2(netAfterDiscount * TAX_RATE);
      const totalAfterRabatt = round2(netAfterRabatt * (1+TAX_RATE));
      console.log("totalAfterRabatt  ", totalAfterRabatt )

      // --- Neukundenbonus (after Rabatt) ---
      const flags = {
        bonus_neu: !!payload?.rabatt?.bonus300,
        bonus_Haltegriff: !!payload?.rabatt?.bonusGrab,
      };

      // If you want a threshold for the 300 € (e.g., only if totalAfterRabatt ≥ 3000), add it here:
      let bonusGross = 0;
      if (flags.bonus_neu) bonusGross += 252.1;
      if (flags.bonus_Haltegriff) bonusGross += 147.06;

      // const totalAfterBonus = round2(Math.max(0, totalAfterRabatt - bonusGross));
      const netAfterRabatt_and_Bonus = round2(Math.max(0, netAfterRabatt - bonusGross));

      console.log('[pricing] subtotals:', {
        items: (items || []).length,
        materialsSum: materials?.sum ?? 0,
        servicesSum: services?.sum ?? 0,
        markupPct,
      });


const vatOnNet = round2((netAfterRabatt_and_Bonus || 0) * TAX_RATE);
      const total = round2((netAfterRabatt_and_Bonus|| 0) + vatOnNet);


      // -------- NEW: Zuschuss/Selbstkostenanteil --------
const b = payload?.bereich || {};

// Accept string or array; pick the first non-empty if it's an array
const rawOptionSrc = b?.budgetOption ?? b?.budgetOptionsPanel ?? b?.budgetOptions ?? '';
const rawOption = Array.isArray(rawOptionSrc)
  ? (rawOptionSrc.find(v => v != null && String(v).trim() !== '') || '')
  : rawOptionSrc;

// Canonicalize: underscores->spaces, collapse whitespace, uppercase
const option = String(rawOption)
  .toUpperCase()
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Copay from any field you might use
const zuzahlungRaw = Number(b?.zuzahlung ?? b?.copay ?? b?.copayAmount ?? 0) || 0;
const prior = Number(b.wohnumfeld.amount) || 0;
let subsidyAmount = 0;
let subsidyAmount_max = 0;  // changed if prior different from 0
switch (option) {
  case '4180 MAXIMAL':
  case 'MAX_4180':
  case '4180_MAXIMAL':
  case 'MAXIMAL_4180':
    subsidyAmount = 4180;
    break;

  case '4180 MIT ZUZAHLUNG':
  case 'KUNDE_MIT_ZUZAHLUNG':
  case '4180_KUNDE_MIT_ZUZAHLUNG':
  case 'ZUSZAHLUNG_CA':
    //  subsidyAmount = 4180 - Math.max(0, zuzahlungRaw);
    subsidyAmount = 4180;
    break;

  case 'ZWEI PERSONEN MIT PFLEGEGRAD':
  case 'ZWEI_PERSONEN_8360':
  case '2_PERSONEN_MIT_PFLEGEGRAD':
  case '8360_ZWEI_PERSONEN':
    subsidyAmount = 8360;
    break;

  default:
    subsidyAmount = 0;
}
subsidyAmount_max = subsidyAmount;
 // subtract prior Wohnumfeld amount (KK only)
 console.log("payerrrr ", payer)
 console.log("and ", b?.wohnumfeld?.done)
  if ((payer === 'Kassenkunde') && b?.wohnumfeld?.done) {
    // prevent negative subsidy
   
    subsidyAmount_max  = Math.max(0, subsidyAmount - Math.max(0, prior));  //   // we substract prior (wohnumfeldAmount ) if exist from money help pfelegebudget
    console.log("subsidyAmount", subsidyAmount)
    console.log("subsidyAmount_max", subsidyAmount_max)
  }


// Base to subtract from: prefer most final amount
// const baseForSubsidy =
  // (Number.isFinite(totalAfterBonus)  && totalAfterBonus  > 0 ? totalAfterBonus  :
  //  Number.isFinite(totalAfterRabatt) && totalAfterRabatt > 0 ? totalAfterRabatt :
  //  total);

const selfPayAmount = round2(Math.max(0, Number(total) - Number(subsidyAmount_max )));


     


      return {
        // before discount:
        items, materials, productsSubtotal, services,
        Nettobetrag: baseSubtotal, markupPct, markup, vatOnNet, total, netAfterRabatt_and_Bonus,

        // values after discount 
        netAfterRabatt ,
        materialDiscountPct: materialPct,  // for the slider label in UI
        rabattAmount,
        totalAfterRabatt ,baseVat, base_total ,

        // rabatt + bonus:
        bonusGross,
        bonusFlags: flags,
        flags: flags,  

        // NEW: Zuschuss/Selbstkostenanteil for UI + DOCX
        subsidyKind: option,
        subsidyInput: Math.max(0, zuzahlungRaw),
        subsidyAmount, // money help pfelegebudget
        prior, //  wohnumfeldAmount
        subsidyAmount_max,
        selfPayAmount, 
        selectedTray,


  // NEW display-only blocks
 grabCounts,

  // presentation-only copies
  materialsDisplayUI,
  optionalDisplayUI,
  servicesDisplayUI,

  materialsDisplayDocx,
  servicesDisplayDocx,

      
          
       
      };
    }
  };
};