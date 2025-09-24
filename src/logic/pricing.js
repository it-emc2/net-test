// src/logic/pricing.js
export default (ProductModel) => {
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

    const lines = [];
    const idsNeeded = new Set();

    const add = (id, qty, labelOverride, unitOverride) => {
      const q = Number(qty) || 0;
      if (!id || q <= 0) return;
      idsNeeded.add(id);
      lines.push({
        id,
        qty: q,
        label: labelOverride || null,
        unitOverride: Number.isFinite(unitOverride) ? Number(unitOverride) : null
      });
    };

    // Duschwanne
    const traySize = dusch.traySize;
    const trayMap = new Map([
      ['180 x 100 x 3 cm', 'SLA180100'],
      ['160 x 100 x 3 cm', 'SLA160100'],
      ['140 x 100 x 3 cm', 'SLA140100'],
      ['120 x 100 x 3 cm', 'SLA120100'],
      ['100 x 100 x 3 cm', 'SLA100'],
      ['90 x 90 x 3 cm', 'SLA90'],
      ['80 x 80 x 3 cm', 'SLA80'],
    ]);
    if (trayMap.has(traySize)) add(trayMap.get(traySize), 1);

    if (dusch.abdichtSet) add('TRWDB', 1);
    if (dusch.drainSet) add('AGD9060', 1);

    // Kleinmaterial pauschal
    if (dusch.smallMaterial) add('KM02', 1);

    if (dusch.stelzlager) add('STELZ', 1);

    // Fußboden
    const addFlooring = !!dusch.addFlooring;
    const floorArea = Number(String(dusch.floorArea ?? '').replace(',', '.')) || 0;
    if (addFlooring && floorArea > 0) {
      const panels = ceilSafe(floorArea * 4);
      add('V5FB02', panels, `- ${panels} Stk Fußboden-Paneele (1 m² = 4 Paneele)`, 20.97);

      const packs = ceilSafe(floorArea / 0.6);
      if (packs > 0) add('V4FK600', packs, `- ${packs} Pkg Flächenkleber (1 Pkg je 0,60 m²)`, 17.39);

      if (dusch.floorSealing) add('TRBDSET7', 1);
    }

    // Wandverkleidung
    const qty997 = Number(wv?.wvQty997 || 0) || 0;
    const qty1497 = Number(wv?.wvQty1497 || 0) || 0;
    const totalPanels = qty997 + qty1497;

    if (wv?.wv997 && qty997 > 0) {
      add('V3WVK09', qty997, `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`);
    }
    if (wv?.wv1497 && qty1497 > 0) {
      add('V3WV09', qty1497, `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`);
    }

    if (wv?.wvSealing) add('TRWDSET5', 1);

    // Wandverkleidungsklebstoff: user qty oder Fallback
    if (wv?.wvAdhesive) {
      const userQtyAdh = Number(wv?.wvAdhesiveQty);
      const fallbackAdh = (3 * qty997) + (4 * qty1497);
      const qAdh = Number.isFinite(userQtyAdh) && userQtyAdh > 0 ? userQtyAdh : fallbackAdh;
      if (qAdh > 0) add('V4RKIT', qAdh, `- ${qAdh} Stk Wandverkleidungsklebstoff 3.0/4.0`);
    }

    // Abschlussprofil (V3A)
    let endProfilesQty = 0;
    if (wv?.wvEndProfile) {
      endProfilesQty = Number(wv?.wvEndProfileQty) || 0;
      if (endProfilesQty > 0) add('V3A', endProfilesQty);
    }

    // Verbindungsprofil(e) (V3V): Anzahl Platten - 1
    if (totalPanels >= 2) {
      const qV3V = totalPanels - 1;
      add('V3V', qV3V, `- ${qV3V} Stk Verbindungsprofil(e) (Plattenanzahl - 1)`);
    }

    // Profilklebstoff (V4RPKIT): user qty oder Fallback = Anzahl Endprofile
    if (wv?.wvProfileAdhesive) {
      const userQtyProfGlue = Number(wv?.wvProfileAdhesiveQty);
      const fallbackProfGlue = endProfilesQty;
      const qProfGlue = Number.isFinite(userQtyProfGlue) && userQtyProfGlue > 0 ? userQtyProfGlue : fallbackProfGlue;
      if (qProfGlue > 0) add('V4RPKIT', qProfGlue, `- ${qProfGlue} Stk Profilklebstoff (pro Abschlussprofil 1 Stk)`);
    }

    // Waschtisch required accessories (reuse opt)
    const basinQty = Number(opt?.qty_CL60 || 0) || 0;
    const basinSelected = !!opt?.opt_CL60 && basinQty > 0;
    if (basinSelected) {
      add('CL60', basinQty);
      add('WTBF', basinQty);
      add('RSL', basinQty);
      if (opt?.opt_EV) {
        const evQty = Number(opt?.qty_EV || 1) || 1;
        add('EV', evQty);
      }
    }

    // Resolve names + prices
    const productMap = await getProductsByIds([...idsNeeded]);
    const resolved = lines.map(l => {
      const prod = productMap.get(l.id) || { price: 0, name: '' };
      const unit = Number.isFinite(l.unitOverride) ? Number(l.unitOverride) : prod.price;
      const lineTotal = round2(unit * l.qty);
      return {
        productId: l.id,
        name: prod.name || '',
        qty: l.qty,
        unitPrice: unit,
        lineTotal,
        label: l.label,
      };
    });

    const sum = round2(resolved.reduce((a, x) => a + (x.lineTotal || 0), 0));
    return { title: 'Material für Badumbau', lines: resolved, sum };
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
      lines.push({ key: 'kilometer', label: `- ${roundTripKm} km Kilometerpauschale (Hin- & Rückfahrt)`, amount: kilometerpauschale });
    }
    if (total_hours_numeric  > 0 && laborRate > 0) {
      lines.push({ key: 'facharbeiter', label: `- ${total_hours_HH_mm} (${total_hours_numeric}) Std × ${handwerkerCount} Facharbeiter × ${laborRate.toFixed(2)} €`, amount: facharbeiter });
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

      const productsSubtotal = round2(
        (items || []).reduce((sum, i) => sum + (i?.lineTotal || 0), 0) +
        (materials?.sum ?? 0)
      );
      
      // Extract and enforce markup rules
      let markupPct = extractMarkupPct(payload);
      const payer = payload?.bereich?.payer || '';
      if (payer === 'Selbstzahler') {
        markupPct = 0.35; // enforce rule regardless of client input
      }
      const markup = round2( productsSubtotal  * (markupPct || 0));

  
     
      
      // Nettobetrag
      const baseSubtotal = round2(productsSubtotal + (services?.sum ?? 0) + markup );

      const vatOnNet = round2((baseSubtotal || 0) * TAX_RATE);
      const total = round2((baseSubtotal|| 0) + vatOnNet);

      // --- Rabatt on MATERIAL only (percent from payload.rabatt.materialDiscountPct) ---
      const materialPct = Number(payload?.rabatt?.materialDiscountPct || 0); // 0..0.09
      const rabattAmount = round2((productsSubtotal || 0) * materialPct);

      // VAT is applied AFTER discount on net amount:
      const netAfterDiscount = round2((baseSubtotal|| 0) - rabattAmount);
      const Vat_on_net_AfterDiscount = round2(netAfterDiscount * TAX_RATE);
      const totalAfterRabatt = round2(netAfterDiscount + Vat_on_net_AfterDiscount);

      // --- Neukundenbonus (after Rabatt) ---
      const flags = {
        bonus300: !!payload?.rabatt?.bonus300,
        bonusGrab: !!payload?.rabatt?.bonusGrab,
      };

      // If you want a threshold for the 300 € (e.g., only if totalAfterRabatt ≥ 3000), add it here:
      let bonusGross = 0;
      if (flags.bonus300 ) bonusGross += 300;
      if (flags.bonusGrab) bonusGross += 175;

      const totalAfterBonus = round2(Math.max(0, totalAfterRabatt - bonusGross));

      console.log('[pricing] subtotals:', {
        items: (items || []).length,
        materialsSum: materials?.sum ?? 0,
        servicesSum: services?.sum ?? 0,
        markupPct,
      });



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

let subsidyAmount = 0;
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
    // subsidyAmount = 4180 + Math.max(0, zuzahlungRaw);
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

// Base to subtract from: prefer most final amount
const baseForSubsidy =
  (Number.isFinite(totalAfterBonus)  && totalAfterBonus  > 0 ? totalAfterBonus  :
   Number.isFinite(totalAfterRabatt) && totalAfterRabatt > 0 ? totalAfterRabatt :
   total);

const selfPayAmount = round2(Math.max(0, Number(baseForSubsidy) - Number(subsidyAmount)));
const totalAfterSubsidy = selfPayAmount; // alias (safe to keep)

     


      return {
        // before discount:
        items, materials, productsSubtotal, services,
        Nettobetrag: baseSubtotal, markupPct, markup, vatOnNet, total, 

        // values after discount 
        totalAfterRabatt ,netAfterDiscount ,Vat_on_net_AfterDiscount,
        materialDiscountPct: materialPct,  // for the slider label in UI
        rabattAmount,

        // rabatt + bonus:
        bonusGross,
        totalAfterBonus,
        bonusFlags: flags,
        flags: flags,  

        // NEW: Zuschuss/Selbstkostenanteil for UI + DOCX
        subsidyKind: option,
        subsidyInput: Math.max(0, zuzahlungRaw),
        subsidyAmount,
        baseForSubsidy,
        selfPayAmount, 
          
       
      };
    }
  };
};