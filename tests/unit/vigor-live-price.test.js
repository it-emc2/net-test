import { jest } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { pickFreshestNetPrices } from '../../src/external/vigorDb.js';

// Duschabtrennung configurator lines are priced from a build-time snapshot
// (vigor-model.json, weeks old), so pricing.js re-reads netPrice from the
// daily-refreshed vigor DB. The vigor scraper stores one doc per config path, so
// the same articleNumber comes back several times — the merge decides which price
// ends up in a customer quote, hence these checks.

test('same article from several config paths: freshest lastSeenAt wins', () => {
  const m = pickFreshestNetPrices([
    { articleNumber: 'V2PT83LC', netPrice: 501, lastSeenAt: '2026-07-01T00:00:00Z' },
    { articleNumber: 'V2PT83LC', netPrice: 529, lastSeenAt: '2026-07-27T00:00:00Z' },
    { articleNumber: 'V2PT83LC', netPrice: 480, lastSeenAt: '2026-06-01T00:00:00Z' },
  ]);
  expect(m.get('V2PT83LC')).toBe(529);
});

test('zero / missing / NaN price is "no data", never a real 0', () => {
  const m = pickFreshestNetPrices([
    { articleNumber: 'A', netPrice: 100, lastSeenAt: '2026-07-01T00:00:00Z' },
    // a bad scrape, newer than the good doc — must NOT win
    { articleNumber: 'A', netPrice: 0, lastSeenAt: '2026-07-27T00:00:00Z' },
    { articleNumber: 'B', netPrice: null },
    { articleNumber: 'C' },
    { articleNumber: 'D', netPrice: 'kaputt' },
    { articleNumber: 'E', netPrice: -5 },
  ]);
  expect(m.get('A')).toBe(100);      // good price survives the newer zero
  for (const id of ['B', 'C', 'D', 'E']) expect(m.has(id)).toBe(false);
});

test('docs without lastSeenAt still yield a price (treated as oldest)', () => {
  const m = pickFreshestNetPrices([{ articleNumber: 'X', netPrice: 42 }]);
  expect(m.get('X')).toBe(42);
});

test('empty / nullish input is an empty map, not a throw', () => {
  expect(pickFreshestNetPrices([]).size).toBe(0);
  expect(pickFreshestNetPrices(undefined).size).toBe(0);
});

// --- the wiring: what computePrices does with the live price -----------------
// pricing.js is the single chokepoint every consumer goes through (save, PDF,
// DOCX, e-mail, Kalkulation). The rule: a fresh quote gets today's price, an
// already-quoted offer keeps its price and only reports the difference, and a
// vigor outage degrades to the snapshot price loudly.

const CONFIG_ROW = {
  kind: 'config',                // the Duschabtrennung (neu) configurator
  productId: 'V2PT83LC',
  label: 'Pendeltür 1-tlg. 800x1950',
  qty: 1,
  price: 501,                    // stale snapshot price from vigor-model.json
};

// Absolute specifier on purpose: jest's moduleNameMapper (which strips the .js
// suffix) resolves a relative mock path against tests/setup.js, not this file.
const VIGOR_DB = fileURLToPath(new URL('../../src/external/vigorDb.js', import.meta.url));

async function computeWithVigor(fetchImpl, { offerNumber } = {}) {
  jest.resetModules();
  jest.unstable_mockModule(VIGOR_DB, () => ({
    getVigorDb: async () => { throw new Error('not used in this test'); },
    pickFreshestNetPrices,
    fetchVigourNetPrices: fetchImpl,
  }));
  const { default: pricingFactory } = await import('../../src/logic/pricing.js');
  const ProductModel = {
    find: () => ({ lean: async () => [] }),
    findOne: () => ({ lean: async () => null }),
  };
  const res = await pricingFactory(ProductModel).computePrices({
    activeOffer: 'bu',
    ...(offerNumber ? { offerNumber } : {}),
    duschabtrennung: { quickAdd: [CONFIG_ROW] },
  });
  return {
    line: res.materials.lines.find((l) => (l.productId || l.id) === 'V2PT83LC'),
    drift: res.materials.vigorPriceDrift,
  };
}

test('fresh quote (no offer number) uses the live vigor price', async () => {
  const { line, drift } = await computeWithVigor(
    async () => new Map([['V2PT83LC', 529]]),
  );
  expect(line).toBeDefined();
  expect(line.unitPrice).toBeCloseTo(529, 2);
  expect(drift).toBeNull();          // nothing was quoted yet, so nothing drifted
});

// The workflow that decides this: an offer is sent at 600, days later the parts are
// ordered from the reopened offer and the supplier now wants 620. Repricing to 620
// would hide the 20 € loss — the whole reason the offer is reopened.
test('saved offer keeps the quoted price and reports the drift', async () => {
  const { line, drift } = await computeWithVigor(
    async () => new Map([['V2PT83LC', 620]]),
    { offerNumber: 'ANG-1234' },
  );
  expect(line.unitPrice).toBeCloseTo(501, 2);        // quoted price still billed
  expect(line.currentNet).toBeCloseTo(620, 2);       // today's price, for the UI
  expect(drift.offerNumber).toBe('ANG-1234');
  expect(drift.totalDelta).toBeCloseTo(119, 2);      // (620 - 501) × qty 1
  expect(drift.lines[0]).toMatchObject({ productId: 'V2PT83LC', quotedNet: 501, currentNet: 620 });
});

test('saved offer with an unchanged price reports no drift at all', async () => {
  const { line, drift } = await computeWithVigor(
    async () => new Map([['V2PT83LC', 501]]),
    { offerNumber: 'ANG-1234' },
  );
  expect(line.unitPrice).toBeCloseTo(501, 2);
  expect(line.currentNet).toBeNull();
  expect(drift).toBeNull();
});

test('vigor DB unreachable → snapshot price is used AND an error is logged', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { line } = await computeWithVigor(async () => {
    throw new Error('ECONNREFUSED');
  });
  expect(line.unitPrice ?? line.unit).toBeCloseTo(501, 2);   // offer still possible
  const logged = spy.mock.calls.flat().join(' ');
  expect(logged).toMatch(/vigor live price lookup FAILED/);
  expect(logged).toMatch(/ECONNREFUSED/);
  spy.mockRestore();
});

test('article missing from vigor → snapshot price kept, article number logged', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const { line } = await computeWithVigor(async () => new Map());
  expect(line.unitPrice ?? line.unit).toBeCloseTo(501, 2);
  expect(spy.mock.calls.flat().join(' ')).toMatch(/V2PT83LC/);
  spy.mockRestore();
});
