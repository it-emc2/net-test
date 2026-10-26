import pricingFactory from '../../src/logic/pricing-core.js';

// "Wandverkleidung als Fußboden" (Fußboden tab → WV) must print the same
// Auszuführende-Arbeiten line as the regular Fußboden option.
const ProductModel = {
  find: () => ({ lean: async () => [] }),
  findOne: () => ({ lean: async () => null }),
};
const { computePrices } = pricingFactory(ProductModel, {
  cfg: { get: (_k, fallback) => fallback },
  fetchVigourNetPrices: async () => new Map(),
});
const run = (duschwanne) => computePrices({ activeOffer: 'bu', duschwanne });
const has = (res, s) => JSON.stringify(res.services).includes(s);

test('WV als Fußboden, gesamter Badboden', async () => {
  const res = await run({ addWallCladding: true, wallCladdingKind: 'Gesamtes-Bad', wallCladdingQty: '3', wallCladdingColor: 'Struktur weiß' });
  expect(has(res, 'Fußbodenverkleidung im gesamten Badbereich')).toBe(true);
});

test('WV als Fußboden, Fehlstellen', async () => {
  const res = await run({ addWallCladding: true, wallCladdingKind: 'Fehlstellen', wallCladdingQty: '1' });
  expect(has(res, 'Schließen der Fehlstellen im Fußbodenbereich')).toBe(true);
});

test('regular Fußboden unchanged', async () => {
  const res = await run({ addFlooring: true, floorKind: 'Gesamtes-Bad', floorArea: '5' });
  expect(has(res, 'Fußbodenverkleidung im gesamten Badbereich')).toBe(true);
});

test('no floor → no floor line', async () => {
  const res = await run({ wallCladdingKind: 'Gesamtes-Bad' });
  expect(has(res, 'Fußbodenverkleidung')).toBe(false);
});
