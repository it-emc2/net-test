import pricingFactory from '../../src/logic/pricing.js';

// Fake ProductModel that mimics Mongoose find().lean() and findOne().lean()
function makeFakeProductModel(entries = []) {
  const map = new Map(entries.map((d) => [d.productId, d]));
  return {
    find(query) {
      const ids = (query?.productId?.$in) || [];
      const docs = ids.map((id) => map.get(id)).filter(Boolean);
      return { lean: async () => docs };
    },
    findOne(query) {
      const id = query?.productId;
      const doc = map.get(id) || null;
      return { lean: async () => doc };
    },
  };
}

test('Example A — BU materials + optional grab bar compute correctly', async () => {
  const products = [
    { productId: 'CLPESG30', price: 30.0, name: 'Haltegriff CLPESG30' },
    { productId: 'V3WVK09', price: 100.0, name: 'Wandverkleidung 997×2550' },
    { productId: 'KM02', price: 10.0, name: 'Kleinmaterial' },
  ];

  const ProductModel = makeFakeProductModel(products);
  const { computePrices } = pricingFactory(ProductModel);

  const payload = {
    activeOffer: 'bu',
    optional: { opt_CLPESG30: true, qty_CLPESG30: 1 },
    wandverkleidung: { wvQty997: 1, wvColor: 'Weiß' },
  };

  const res = await computePrices(payload);

  expect(res.materials.sum).toBeCloseTo(130.0, 2);
  expect(res.productsSubtotal).toBeCloseTo(130.0, 2);
  expect(res.markupPct).toBeCloseTo(0.35, 6);
  expect(res.markup).toBeCloseTo(45.5, 2);
  expect(res.Nettobetrag).toBeCloseTo(175.5, 2);
  expect(res.vatOnNet).toBeCloseTo(33.35, 2);
  expect(res.total).toBeCloseTo(208.85, 2);
});

test('Example B — BWT door + grab bar applies global markup', async () => {
  const products = [
    { productId: '1226', price: 500.0, name: 'Standard Tür 1226' },
    { productId: 'CLPESG30', price: 30.0, name: 'Haltegriff CLPESG30' },
    { productId: 'KM02', price: 10.0, name: 'Kleinmaterial' },
  ];

  const ProductModel = makeFakeProductModel(products);
  const { computePrices } = pricingFactory(ProductModel);

  const payload = {
    activeOffer: 'bwt',
    bwt: { bwtDoorStdQty: 1 },
    optional: { opt_CLPESG30: true, qty_CLPESG30: 1 },
    pricing: { markupPct: 0.2 },
  };

  const res = await computePrices(payload);

  // materials: door 500 + global optional grab bar 30 → sum 530
  // Aufschlag applies to BWT the same as BU: 20% of 530 = 106.
  const mat = res.materials;
  expect(mat.sum).toBeCloseTo(530.0, 2);
  expect(res.markupPct).toBeCloseTo(0.2, 6);
  expect(res.markup).toBeCloseTo(106.0, 2);
  expect(res.Nettobetrag).toBeCloseTo(646.0, 2);
  expect(res.vatOnNet).toBeCloseTo(122.74, 2);
  expect(res.total).toBeCloseTo(768.74, 2);
});
