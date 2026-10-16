import pricingFactory from '../../src/logic/pricing-core.js';

// wvEnabled (WV checkbox): false bills nothing and prints no WV work line;
// a missing key is a legacy offer and must price exactly as before.
const products = [{ productId: 'V3WVK09', price: 100.0, name: 'Wandverkleidung 997×2550' }];
const ProductModel = {
  find: (q) => ({ lean: async () => products.filter((p) => (q?.productId?.$in || []).includes(p.productId)) }),
  findOne: (q) => ({ lean: async () => products.find((p) => p.productId === q?.productId) || null }),
};
const { computePrices } = pricingFactory(ProductModel, {
  cfg: { get: (_k, fallback) => fallback },
  fetchVigourNetPrices: async () => new Map(),
});
const wv = { wvKind: 'Fliesenspiegel', wvQty997: 1, wvColor: 'Marmor weiß' };
const NOTE = 'Verkleidung bis zur Höhe des Fliesenspiegels';
const run = (extra) => computePrices({ activeOffer: 'bu', wandverkleidung: { ...wv, ...extra } });
const hasNote = (res) => JSON.stringify(res).includes(NOTE);

test('legacy payload (no wvEnabled) prices WV as before', async () => {
  const res = await run({});
  expect(res.materials.sum).toBeCloseTo(100, 2);
  expect(hasNote(res)).toBe(true);
});

test('wvEnabled true prices WV', async () => {
  const res = await run({ wvEnabled: true });
  expect(res.materials.sum).toBeCloseTo(100, 2);
  expect(hasNote(res)).toBe(true);
});

test('wvEnabled false bills no panels and prints no WV work line', async () => {
  const res = await run({ wvEnabled: false });
  expect(res.materials.sum || 0).toBeCloseTo(0, 2);
  expect(hasNote(res)).toBe(false);
});
