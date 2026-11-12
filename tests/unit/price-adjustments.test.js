// Hand-set price changes (payload.offerOverrides.priceAdjustments) must move the position
// prices AND every total that depends on them — compared against the same offer without.
import pricingFactory, { sumPriceAdjustments } from '../../src/logic/pricing-core.js';

const model = (entries) => {
  const map = new Map(entries.map((d) => [d.productId, d]));
  return {
    find: (q) => ({ lean: async () => (q?.productId?.$in || []).map((i) => map.get(i)).filter(Boolean) }),
    findOne: (q) => ({ lean: async () => map.get(q?.productId) || null }),
  };
};
const { computePrices } = pricingFactory(model([{ productId: 'V3WVK09', price: 100, name: 'WV' }]), {
  cfg: { get: (_k, fallback) => fallback },
  fetchVigourNetPrices: async () => new Map(),
});
const base = { activeOffer: 'bu', wandverkleidung: { wvQty997: 1, wvColor: 'Weiß' } };
const adj = (rows) => ({ ...base, offerOverrides: { priceAdjustments: rows } });

test('material adjustment: net, VAT, total and position 002 follow', async () => {
  const a = await computePrices(base);
  const b = await computePrices(adj([{ target: 'material', amountNet: 50 }]));
  expect(b.netAfterRabatt_and_Bonus - a.netAfterRabatt_and_Bonus).toBeCloseTo(50, 2);
  expect(b.total - a.total).toBeCloseTo(59.5, 2); // 50 * 1.19
  expect(b.material_plus_aufschlag - a.material_plus_aufschlag).toBeCloseTo(50, 2);
  expect(b.services.sum).toBe(a.services.sum);
});

test('services adjustment (negative): position 001 and totals follow', async () => {
  // the test catalogue yields no priced lines, so give the offer a positive net first
  const a = await computePrices(adj([{ target: 'material', amountNet: 200 }]));
  const b = await computePrices(adj([{ target: 'material', amountNet: 200 }, { target: 'services', amountNet: -20 }]));
  expect(b.services.sum - a.services.sum).toBeCloseTo(-20, 2);
  expect(b.servicesDisplayDocx.sum - a.servicesDisplayDocx.sum).toBeCloseTo(-20, 2);
  expect(b.total - a.total).toBeCloseTo(-23.8, 2);
  expect(b.material_plus_aufschlag - a.material_plus_aufschlag).toBeCloseTo(0, 2); // 002 untouched
});

test('invalid rows are ignored; none = unchanged', async () => {
  expect(sumPriceAdjustments(adj([{ target: 'x', amountNet: 5 }, { target: 'material', amountNet: 'abc' }, { target: 'material', amountNet: 1e9 }]))).toEqual({ services: 0, material: 0 });
  const a = await computePrices(base);
  const b = await computePrices(adj([]));
  expect(b.total).toBe(a.total);
});

test('a sent (locked) offer number returns its frozen price, flagged _locked; a draft number does not', async () => {
  const snap = { locked: true, pricing: { total: 111, services: { sum: 5 } } };
  const mk = (doc) => ({ findOne: () => ({ select: () => ({ sort: () => ({ lean: async () => doc }) }) }) });
  const withOffer = (doc) => pricingFactory(model([]), { cfg: { get: (_k, f) => f }, fetchVigourNetPrices: async () => new Map(), OfferModel: mk(doc), DraftModel: mk(null) });
  const payload = { ...base, offerNumber: 'ANG2026-1008-104733', offerOverrides: { priceAdjustments: [{ target: 'material', amountNet: 1500 }] } };
  const locked = await withOffer(snap).computePrices(payload);
  expect(locked.total).toBe(111); // adjustment cannot move a sent offer
  expect(locked._locked).toBe(true);
  const live = await withOffer(null).computePrices(payload);
  expect(live._locked).toBeUndefined();
  expect(live.priceAdjustments.material).toBe(1500);
});

// ---- single positions (payload.offerOverrides.lineEdits, Kosten page) ----
import { lineEditDeltas } from '../../src/logic/pricing-core.js';

const edit = (rows) => ({ ...base, offerOverrides: { lineEdits: rows } });

test('line edit: only known positions with a valid price count; first of a duplicate wins', () => {
  const mats = [{ productId: 'A', source: null, qty: 2, unitPrice: 10 }, { productId: 'B', source: 'optional', qty: 1, unitPrice: 5 }];
  const svcs = [{ key: 'fahrzeug', qty: 1, unitPrice: 80, amount: 80 }, { key: 'kilometer', amount: 95.55 }];
  const out = lineEditDeltas({ offerOverrides: { lineEdits: [
    { block: 'material', id: 'A', unitPriceNet: 12.5 },            // +2.5 × 2
    { block: 'material', id: 'A', unitPriceNet: 99 },              // duplicate → ignored
    { block: 'material', id: 'B', source: 'optional', unitPriceNet: 0 }, // −5
    { block: 'material', id: 'B', unitPriceNet: 1 },               // wrong source → ignored
    { block: 'services', id: 'kilometer', unitPriceNet: 90 },      // amount-only line
    { block: 'services', id: 'fahrzeug', unitPriceNet: null, label: 'x' }, // wording only
    { block: 'material', id: 'ZZ', unitPriceNet: 3 },              // unknown
    { block: 'material', id: 'A2', unitPriceNet: -1 }, { block: 'x', id: 'A', unitPriceNet: 1 },
  ] } }, mats, svcs);
  expect(out.material).toBe(0);
  expect(out.services).toBe(-5.55);
  expect(out.applied.map((a) => [a.id, a.deltaNet])).toEqual([['A', 5], ['B', -5], ['kilometer', -5.55]]);
  expect(lineEditDeltas({}, mats, svcs)).toEqual({ services: 0, material: 0, applied: [] });
});
// totals on real offers: v2/packages/pricing/test/line-edits.test.ts (legacy and TS engine)
