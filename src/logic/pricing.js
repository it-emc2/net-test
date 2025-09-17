// pricing.js
export default (ProductModel) => {
  async function getPricesByIds(ids) {
    if (!ids.length) return () => 0;
    const docs = await ProductModel.find({ productId: { $in: ids } }).lean();
    const map = new Map(docs.map(d => [d.productId, Number(d.price) || 0]));
    return (id) => Number(map.get(id) || 0);
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const ceil2 = (n) => Math.ceil(Number(n) - 1e-12); // avoid float issues

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

  // ----- NEW: Materials calculator -----
  async function computeMaterials(payload) {
    const dusch = payload?.duschwanne || {};
    const wv = payload?.wandverkleidung || {};
    const opt = payload?.optional || {};

    // Helper to push lines
    const lines = [];
    const idsNeeded = new Set();

    const addLine = (id, qty, labelOverride) => {
      if (!qty || qty <= 0) return;
      idsNeeded.add(id);
      lines.push({ id, qty, labelOverride: labelOverride || null });
    };

    // 1) Duschwanne selection -> SLA… size by radio value
    const traySize = dusch.traySize; // eg '120 x 100 x 3 cm'
    const trayMap = new Map([
      ['180 x 100 x 3 cm', 'SLA180100'],
      ['160 x 100 x 3 cm', 'SLA160100'],
      ['140 x 100 x 3 cm', 'SLA140100'],
      ['120 x 100 x 3 cm', 'SLA120100'],
      ['100 x 100 x 3 cm', 'SLA100'],
      ['90 x 90 x 3 cm', 'SLA90'],
      ['80 x 80 x 3 cm', 'SLA80'],
    ]);
    if (trayMap.has(traySize)) addLine(trayMap.get(traySize), 1);

    // TRINNITY Wannenabdichtband-Set (checkbox)
    if (dusch.abdichtSet) addLine('TRWDB', 1);

    // Ablaufgarnitur 90mm (checkbox)
    if (dusch.drainSet) addLine('AGD9060', 1);

    // Kleinmaterial selection block
    if (dusch.smallMaterial) {
      const varVal = dusch.smallMaterialVariant; // '45€ klein' | '150€ groß'
      if (varVal === '45€ klein') addLine('KM01', 1);
      else if (varVal === '150€ groß') addLine('KM02', 1);
      else addLine('KM01', 1); // default small
    }

    // Stelzlager
    if (dusch.stelzlager) addLine('STELZ', 1);

    // Fußboden
    const addFlooring = !!dusch.addFlooring;
    const floorArea = Number(String(dusch.floorArea || '').replace(',', '.')) || 0;
    if (addFlooring && floorArea > 0) {
      // Panels: 1 m² = 4 panels, 1 panel = 20.97 €
      // Your DB has V5FB02 item price 159.84 (pack?), but your rule says 1 panel = 20.97€.
      // Two approaches:
      // A) use DB item V5FB02 and compute qty as area_m2/?? -> ambiguous
      // B) model panels as virtual "PANEL" at 20.97€ each.
      // We'll compute price using the DB item where productId=V5FB02 and qty = panels/?? is unclear.
      // Safer: compute line with labelOverride showing decimal panels and a computed unitPrice below.
      // Instead: model per-panel cost as unit override:
      const panelUnitPrice = 20.97;
      const neededPanels = ceil2(floorArea * 4);
      lines.push({
        id: 'V5FB02', // keep for reference
        qty: neededPanels,
        labelOverride: `- ${neededPanels} Stk Fußboden-Paneele (1 m² = 4 Paneele)`,
        unitOverride: panelUnitPrice,
      });

      // Flächenkleber V4FK600: packs
      const m2PerPiece = 0.60;
      const piecesPerPack = 20;
      const packPrice = 17.39;
      const neededPieces = ceil2(floorArea / m2PerPiece);
      const neededPacks = ceil2(neededPieces / piecesPerPack);
      lines.push({
        id: 'V4FK600',
        qty: neededPacks,
        labelOverride: `- ${neededPacks} Pkg Flächenkleber (à 20 Stk; 0,60 m²/Stk)`,
        unitOverride: packPrice,
      });

      // TRINNITY Bodenabdichtung TRBDSET7: always 1 when flooring selected
      if (dusch.floorSealing) addLine('TRBDSET7', 1);
    }

    // 2) Wandverkleidung
    const wv997Checked = !!wv?.wv997;
    const wv1497Checked = !!wv?.wv1497;
    const qty997 = Number(wv?.wvQty997 || 0) || 0;
    const qty1497 = Number(wv?.wvQty1497 || 0) || 0;

    if (wv997Checked && qty997 > 0) addLine('V3WVK09', qty997, `- ${qty997} Stk Wandverkleidung 3.0 Alu 997×2550 mm`);
    if (wv1497Checked && qty1497 > 0) addLine('V3WV09', qty1497, `- ${qty1497} Stk Wandverkleidung 3.0 Alu 1497×2550 mm`);

    // TRINNITY Wandabdichtung
    if (wv?.wvSealing) addLine('TRWDSET5', 1);

    // Wandverkleidungsklebstoff V4RKIT: qty = 4*1497 + 3*997
    if (wv?.wvAdhesive) {
      const q = (4 * qty1497) + (3 * qty997);
      if (q > 0) addLine('V4RKIT', q, `- ${q} Stk Wandverkleidungsklebstoff 3.0/4.0`);
    }

    // Abschlussprofil V3A with Menge
    if (wv?.wvEndProfile) {
      const q = Number(wv?.wvEndProfileQty || 0) || 0;
      if (q > 0) addLine('V3A', q);
      // Profilklebstoff V4RPKIT = same Menge
      if (wv?.wvProfileAdhesive && q > 0) addLine('V4RPKIT', q);
    }

    // 3) Optional picks already handled by collectSelections, but we need the “Waschtisch extras” rule here if basin selected
    // Check for basin CL60 in optional
    const optBasinQty = Number(opt?.qty_CL60 || 0) || 0;
    const optBasinChecked = !!opt?.opt_CL60;
    const basinSelected = optBasinChecked && optBasinQty > 0;
    if (basinSelected) {
      addLine('CL60', optBasinQty);
      // required extras per basin (qty ties to basin quantity)
      addLine('WTBF', optBasinQty);
      addLine('RSL', optBasinQty);
      // pass through optional EV if selected
      if (opt?.opt_EV) addLine('EV', Number(opt?.qty_EV || 1) || 1);
    }

    // Price lookup
    const priceOf = await getPricesByIds([...idsNeeded]);
    // Build material lines with resolved labels/prices
    const materialLines = lines.map(l => {
      const unit = ('unitOverride' in l && Number.isFinite(l.unitOverride)) ? Number(l.unitOverride) : priceOf(l.id);
      const lineTotal = round2(unit * l.qty);
      return {
        productId: l.id,
        qty: l.qty,
        unitPrice: unit,
        lineTotal,
        label: l.labelOverride || null, // if null, DOCX can just show product/name elsewhere
      };
    });

    const sum = round2(materialLines.reduce((a, x) => a + x.lineTotal, 0));

    return {
      title: 'Material für Badumbau',
      lines: materialLines,
      sum,
    };
  }

  // ----- Existing service calc remains unchanged -----
  function computeServiceCosts(payload) { /* ... unchanged ... */ }

  return {
    computePrices: async (payload) => {
      // Existing optional selections list:
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

      // NEW
      const materials = await computeMaterials(payload);

      const services = computeServiceCosts(payload);

      const productsSubtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0) + (materials.sum || 0));
      const baseSubtotal = round2(productsSubtotal + (services.sum || 0));

      const markupPct = extractMarkupPct(payload);
      const markup = round2(baseSubtotal * markupPct);
      const travel = 0;
      const total = round2(baseSubtotal + markup + travel);

      return {
        items,
        materials, // expose new block
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