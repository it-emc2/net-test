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

    // Map UI alias keys to actual product IDs in DB
    const aliasToId = {
      CL_BASIN: 'CL',
      // add more aliases here if your UI uses them
    };

    const push = (id, qtyRaw, checked) => {
      const qtyNum = qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== ''
        ? Number(qtyRaw)
        : (checked ? 1 : 0);

      const qty = Number.isFinite(qtyNum) ? qtyNum : 0;
      if ((checked || qty > 0) && qty > 0) {
        out.push({ productId: id, qty });
      }
    };

    // Iterate over optional keys and include any opt_* / qty_* pairs
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

    // If you have any fixed items not represented by optional.*, add them explicitly here:
    // Example:
    // push('DEPKS', opt['qty_DEPKS'], opt['opt_DEPKS']);

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

  return {
    computePrices: async (payload) => {
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

      const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
      const markupPct = extractMarkupPct(payload);
      const markup = round2(subtotal * markupPct);
      const travel = 0;
      const total = round2(subtotal + markup + travel);

      return { items, subtotal, markupPct, markup, travel, total };
    }
  };
};