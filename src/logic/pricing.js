export default (ProductModel) => {
  async function getPricesByIds(ids) {
    if (!ids.length) return () => 0;
    const docs = await ProductModel.find({ productId: { $in: ids } }).lean();
    const map = new Map(docs.map(d => [d.productId, Number(d.price) || 0]));
    return (id) => Number(map.get(id) || 0);
  }

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function collectSelections(payload) {
    const out = [];
    const opt = payload?.optional || {};

    const aliasToId = {
      CL_BASIN: 'CL',
    };

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

  // NEW: Service cost calculator for "Auszuführende Arbeiten"
  function computeServiceCosts(payload) {
    const b = payload?.bereich || {};
    const payer = b.payer === 'Kassenkunde' ? 'KK' : (b.payer === 'Selbstzahler' ? 'SZ' : '');
    const distanceKm = Number(payload?.bereich?.distanceKm || 0) || 0;
    const laborHours = Number(payload?.bereich?.laborHours || 0) || 0;

    // Zone chosen
    const zoneKK = payload?.bereich?.zoneKK || ''; // 'Zone 1'...'Zone 12'
    const zoneSZ = payload?.bereich?.zoneSZ || '';

    // Tariffs
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
    lines.push({
      key: 'fahrzeug',
      label: '- 1,00 Stk Fahrzeugbereitstellung',
      amount: round2(fahrzeugbereitstellung),
    });
    lines.push({
      key: 'werkzeuge',
      label: '- 1,00 Stk Bereitstellung und Vorhaltung von Maschinen & Werkzeugen',
      amount: round2(werkzeug),
    });
    if (distanceKm > 0) {
      lines.push({
        key: 'kilometer',
        label: `- ${distanceKm} km Kilometerpauschale`,
        amount: kilometerpauschale,
      });
    }
    if (laborHours > 0 && laborRate > 0) {
      lines.push({
        key: 'facharbeiter',
        label: `- ${laborHours} Std × 2 Facharbeiter × ${laborRate.toFixed(2)} €`,
        amount: facharbeiter,
      });
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
      // Products
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

      // Service costs
      const services = computeServiceCosts(payload);

      // Totals: product subtotal + service sum
      const productsSubtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
      const baseSubtotal = round2(productsSubtotal + (services.sum || 0));

      const markupPct = extractMarkupPct(payload);
      const markup = round2(baseSubtotal * markupPct);
      const travel = 0; // reserved if you keep a separate travel field
      const total = round2(baseSubtotal + markup + travel);

      return {
        items,
        productsSubtotal,
        services,       // expose breakdown
        subtotal: baseSubtotal,
        markupPct,
        markup,
        travel,
        total
      };
    }
  };
};