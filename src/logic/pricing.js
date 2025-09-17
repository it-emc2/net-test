// src/logic/pricing.js
export default (ProductModel) => {
  async function getPricesByIds(ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return () => 0;
    const docs = await ProductModel.find({ productId: { $in: unique } }).lean();
    const map = new Map(docs.map(d => [d.productId, Number(d.price) || 0]));
    return (id) => Number(map.get(id) || 0);
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ceilSafe = (n) => Math.ceil((Number(n) || 0) - 1e-12);

  // Legacy optional collector (kept)
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

  // Materials calculator (Option A for adhesive: packs)
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

    // Duschwanne size
    const traySize = dusch.traySize; // '120 x 100 x 3 cm' ...
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

    // Abdichtband, Ablaufgarnitur
    if (dusch.abdichtSet) add('TRWDB', 1);
    if (dusch.drainSet) add('AGD9060', 1);

    // Kleinmaterial
    if (dusch.smallMaterial) {
      const v = dusch.smallMaterialVariant;
      if (v === '150€ groß') add('KM02', 1);
      else add('KM01', 1);
    }

    // Stelzlager
    if (dusch.stelzlager) add('STELZ', 1);

    // Fußboden
    const addFlooring = !!dusch.addFlooring;
    const floorArea = Number(String(dusch.floorArea ?? '').replace(',', '.')) || 0;
    if (addFlooring && floorArea > 0) {
      // Panels: 1 m² = 4 Panels, 1 panel = 20.97 €
      const panels = ceilSafe(floorArea * 4);
      add('V5FB02', panels, `- ${panels} Stk Fußboden-Paneele (1 m² = 4 Paneele)`, 20.97);

      // Adhesive as packs (Option A)
      const piecesNeeded = ceilSafe(floorArea / 0.60); // 0.60 m² per piece
      const packs = ceilSafe(piecesNeeded / 20); // 20 Stück per pack
      if (packs > 0) add('V4FK600', packs, `- ${packs} Pkg Flächenkleber (à 20 Stk; 0,60 m²/Stk)`, 17.39);

      // Floor sealing (checkbox)
      if (dusch.floorSealing) add('TRBDSET7', 1);
    }

    // Wandverkleidung
    const wv997Checked = !!wv?.wv997;
    const wv1497Checked = !!wv?.wv1497;
    const qty997 = Number(wv?.wvQty997 || 0) || 0;
    const qty1497 = Number(wv?.wvQty1497 || 0) || 0;

    if (wv997Checked && qty997 > 0) add('V3WVK09', qty997, `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`);
    if (wv1497Checked && qty1497 > 0) add('V3WV09', qty1497, `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`);

    if (wv?.wvSealing) add('TRWDSET5', 1);

    if (wv?.wvAdhesive) {
      const q = (4 * qty1497) + (3 * qty997);
      if (q > 0) add('V4RKIT', q, `- ${q} Stk Wandverkleidungsklebstoff 3.0/4.0`);
    }

    if (wv?.wvEndProfile) {
      const q = Number(wv?.wvEndProfileQty || 0) || 0;
      if (q > 0) add('V3A', q);
      if (wv?.wvProfileAdhesive && q > 0) add('V4RPKIT', q);
    }

    // Waschtisch rule in Optional
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

    // Resolve prices
    const priceOf = await getPricesByIds([...idsNeeded]);
    const resolved = lines.map(l => {
      const unit = Number.isFinite(l.unitOverride) ? l.unitOverride : priceOf(l.id);
      const lineTotal = round2(unit * l.qty);
      return {
        productId: l.id,
        qty: l.qty,
        unitPrice: unit,
        lineTotal,
        label: l.label,
      };
    });

    const sum = round2(resolved.reduce((a, x) => a + (x.lineTotal || 0), 0));
    return {
      title: 'Material für Badumbau',
      lines: resolved,
      sum,
    };
  }

  // Service cost calculator (full implementation)
  function computeServiceCosts(payload) {
    const b = payload?.bereich || {};
    const payer = b.payer === 'Kassenkunde' ? 'KK' : (b.payer === 'Selbstzahler' ? 'SZ' : '');
    const distanceKm = Number(payload?.bereich?.distanceKm || 0) || 0;
    const laborHours = Number(payload?.bereich?.laborHours || 0) || 0;

    const zoneKK = payload?.bereich?.zoneKK || '';
    const zoneSZ = payload?.bereich?.zoneSZ || '';

    const tableKK = {
      'Zone 1': 46.33, 'Zone 2': 69.50, 'Zone 3': 92.66, 'Zone 4': 139.00,
      'Zone 5': 185.33, 'Zone 6': 231.66, 'Zone 7': 278.00, 'Zone 8': 324.32,
      'Zone 9': 370.66, 'Zone 10': 416.99, 'Zone 11': 461.48, 'Zone 12': 508.74, 'Zone 13': 556.00,
    };
    const tableSZ = {
      'Zone 1': 39.66, 'Zone 2': 59.50, 'Zone 3': 79.33, 'Zone 4': 119.00,
      'Zone 5': 158.66, 'Zone 6': 198.32, 'Zone 7': 238.00, 'Zone 8': 277.65,
      'Zone 9': 317.31, 'Zone 10': 356.00, 'Zone 11': 395.08, 'Zone 12': 435.54, 'Zone 13': 476.00,
    };
    const laborRateKK = 69.50;
    const laborRateSZ = 59.50;
    const kmRate = 0.70;

    const zoneLabel = payer === 'KK' ? (zoneKK || '') : (payer === 'SZ' ? (zoneSZ || '') : '');
    const zonePrice = payer === 'KK' ? (tableKK[zoneLabel] || 0) : (payer === 'SZ' ? (tableSZ[zoneLabel] || 0) : 0);

    const fahrzeugbereitstellung = 80.00;
    const werkzeug = 7.50;
    const kilometerpauschale = round2(distanceKm * kmRate);
    const laborRate = payer === 'KK' ? laborRateKK : (payer === 'SZ' ? laborRateSZ : 0);
    const facharbeiter = round2(laborHours * 2 * laborRate);

    const lines = [];
    if (zoneLabel && zonePrice > 0) {
      lines.push({
        key: 'zone',
        label: `- 1,00 Stk An- und Abfahrtzone ${zoneLabel}`,
        amount: round2(zonePrice),
      });
    }
    lines.push({ key: 'fahrzeug', label: '- 1,00 Stk Fahrzeugbereitstellung', amount: round2(fahrzeugbereitstellung) });
    lines.push({ key: 'werkzeuge', label: '- 1,00 Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen', amount: round2(werkzeug) });
    if (distanceKm > 0) {
      lines.push({ key: 'kilometer', label: `- ${distanceKm} km Kilometerpauschale`, amount: kilometerpauschale });
    }
    if (laborHours > 0 && laborRate > 0) {
      lines.push({ key: 'facharbeiter', label: `- ${laborHours} Std × 2 Facharbeiter × ${laborRate.toFixed(2)} €`, amount: facharbeiter });
    }

    const posTitle = (payload?.bereich?.offerType === 'Wanne zu Dusche')
      ? 'Auszuführende Arbeiten - Wanne zu Dusche'
      : (payload?.bereich?.offerType === 'Dusche zu Dusche'
          ? 'Auszuführende Arbeiten - Dusche zu Dusche'
          : 'Auszuführende Arbeiten');

    const sum = round2(lines.reduce((a, x) => a + (x.amount || 0), 0));

    return {
      title: posTitle,
      lines,
      sum,
      payer, zoneLabel, distanceKm, laborHours, laborRate,
    };
  }

  return {
    computePrices: async (payload) => {
      // Optional selections (legacy)
      const selections = collectSelections(payload);
      const ids = [...new Set(selections.map(s => s.productId))];
      const priceOf = await getPricesByIds(ids);

      const items = selections.map(s => {
        const unit = priceOf(s.productId);
        const qty = s.qty || 1;
        return {
          productId: s.productId,
          qty,
          unitPrice: unit,
          lineTotal: round2(unit * qty),
        };
      });

      // Compute materials and services with guards
      let materials = { title: '', lines: [], sum: 0 };
      try {
        materials = await computeMaterials(payload);
      } catch (e) {
        console.error('[pricing] computeMaterials failed:', e);
      }

      let services = { title: '', lines: [], sum: 0, payer: '', zoneLabel: '', distanceKm: 0, laborHours: 0, laborRate: 0 };
      try {
        services = computeServiceCosts(payload) || services;
      } catch (e) {
        console.error('[pricing] computeServiceCosts failed:', e);
      }

      // Totals
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

      return {
        items,
        materials,
        productsSubtotal,
        services,
        subtotal: baseSubtotal,
        markupPct,
        markup,
        travel,
        total,
      };
    }
  };
};