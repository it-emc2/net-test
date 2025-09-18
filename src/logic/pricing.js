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

  const extractMarkupPct = (payload) => {
    const a = payload?.bereich?.aufschlag;
    if (!a) return 0;
    const m = String(a).trim();
    if (m.endsWith('%')) {
      const n = Number(m.slice(0, -1));
      return Number.isFinite(n) ? n / 100 : 0;
    }
    return 0;
  };

  // Build zero-cost "work notes" that must be printed in DOCX
  function computeWorkNotes(payload) {
    const opt = payload?.optional || {};
    const kind = payload?.wandverkleidung?.wvKind || '';

    const picked = new Set();

    // Wandverkleidung tasks
    if (kind === 'Fehlstellen') picked.add('Schließen der Fehlstellen');
    if (kind === 'Deckenhoch') picked.add('Verkleidung Deckenhoch im Dusch/ Wannenbereich');

    // Optional groups -> tasks
    const hasAny = (arr) => Array.isArray(arr) && arr.length > 0;
    if (hasAny(opt.optShower))    picked.add('Auswechseln des Duschsystems');
    if (hasAny(opt.optGrab))      picked.add('Anbringen zusätzlicher Haltegriffe');
    if (hasAny(opt.optFold))      picked.add('Anbringen zusätzlicher Stützklappgriffe');
    if (hasAny(opt.optBasin))     picked.add('Auswechseln eines Waschtisches');
    if (hasAny(opt.optBasinTap))  picked.add('Einbau einer einhand-Waschtischbatterie');
    if (hasAny(opt.optThermo))    picked.add('Austausch eines Thermostates');
    if (hasAny(opt.optSeat))      picked.add('Einbau eines Klappsitzes');

    // Map to zero-cost service lines (to be shown and printed)
    return Array.from(picked).map(txt => ({
      key: 'worknote',
      label: `- ${txt}`,
      amount: 0,
    }));
  }

  async function computeMaterials(payload) {
    const dusch = payload?.duschwanne || {};
    const wv = payload?.wandverkleidung || {};
    const opt = payload?.optional || {}; // declare once and reuse

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
    const distanceKm = Number(b.distanceKm || 0) || 0;
    const laborHours = Number(b.laborHours || 0) || 0;

    const laborRateKK = 69.50;
    const laborRateSZ = 59.50;
    const kmRate = 0.70;

    const fahrzeugbereitstellung = 80.00;
    const werkzeug = 7.50;
    const beraeumung = 4.50; // Beräumung der Baustelle

    const kilometerpauschale = round2(distanceKm * kmRate);
    const laborRate = payer === 'KK' ? laborRateKK : (payer === 'SZ' ? laborRateSZ : 0);
    const facharbeiter = round2(laborHours * 2 * laborRate);

    const lines = [];
    lines.push({ key: 'fahrzeug',   label: '- 1,00 Stk Fahrzeugbereitstellung', amount: round2(fahrzeugbereitstellung) });
    lines.push({ key: 'werkzeuge',  label: '- 1,00 Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen', amount: round2(werkzeug) });
    lines.push({ key: 'beraeumung', label: '- 1,00 Stk Beräumung der Baustelle', amount: round2(beraeumung) });
    if (distanceKm > 0) {
      lines.push({ key: 'kilometer', label: `- ${distanceKm} km Kilometerpauschale`, amount: kilometerpauschale });
    }
    if (laborHours > 0 && laborRate > 0) {
      lines.push({ key: 'facharbeiter', label: `- ${laborHours} Std × 2 Facharbeiter × ${laborRate.toFixed(2)} €`, amount: facharbeiter });
    }

    // Append zero-cost work notes so they are shown and printed in DOCX
    try {
      const notes = computeWorkNotes(payload);
      for (const n of notes) lines.push(n);
    } catch (e) {
      console.warn('[pricing] computeWorkNotes failed:', e?.message || e);
    }

    const posTitle = 'Auszuführende Arbeiten';
    const sum = round2(lines.reduce((a, x) => a + (x.amount || 0), 0));
    return { title: posTitle, lines, sum, payer, zoneLabel: '', distanceKm, laborHours, laborRate };
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
      const baseSubtotal = round2(productsSubtotal + (services?.sum ?? 0));

      const markupPct = extractMarkupPct(payload);
      const markup = round2(baseSubtotal * (markupPct || 0));
      const travel = 0;
      const total = round2(baseSubtotal + markup + travel);

      console.log('[pricing] subtotals:', {
        items: (items || []).length,
        materialsSum: materials?.sum ?? 0,
        servicesSum: services?.sum ?? 0,
      });

      return { items, materials, productsSubtotal, services, subtotal: baseSubtotal, markupPct, markup, travel, total };
    }
  };
};