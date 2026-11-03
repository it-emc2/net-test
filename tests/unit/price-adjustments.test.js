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
