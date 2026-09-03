import {
  buildTrayDimFilter,
  scoreTray,
  isBadoluxTray,
  trayDisplayPrice,
  matchesTrayDims,
  matchesTraySeriesAndSource,
  scoreAndRank,
} from '../../src/logic/tray-search-core.js';

// Tray categories disagree on which physical side is "width": Hassmann/SLA
// stores width >= length, Badolux/DW stores width <= length. A 120-footprint
// Badolux tray is therefore { widthCm: 100, lengthCm: 120 }. Matching must be
// orientation-independent for a SINGLE typed axis too, not just when both are
// given — otherwise typing width 120 excludes the rotated Badolux option.

test('single-axis width filter is orientation-independent, not axis-locked', () => {
  const f = buildTrayDimFilter({ w: 120, l: null, h: null });
  expect(f.widthCm).toBeUndefined();            // must NOT be a bare widthCm >= 120
  expect(f.$expr).toBeDefined();                // uses max(widthCm,lengthCm)
  expect(f.$expr.$gte[1]).toBe(120);
});

test('single-axis score is orientation-independent (rotated footprint ties)', () => {
  const dims = { w: 120, l: null, h: null };
  const badolux  = scoreTray({ widthCm: 100, lengthCm: 120 }, dims); // rotated
  const hassmann = scoreTray({ widthCm: 120, lengthCm: 100 }, dims);
  expect(badolux).toBe(hassmann);
  expect(badolux).toBe(0);                       // an exact 120 side exists
});

test('two-axis matching keeps the max/min footprint form', () => {
  const f = buildTrayDimFilter({ w: 120, l: 100, h: null });
  expect(Array.isArray(f.$expr?.$and)).toBe(true);
  expect(f.$expr.$and).toHaveLength(2);
});

test('height filter is preserved', () => {
  const f = buildTrayDimFilter({ w: 120, l: null, h: 3 });
  expect(f.heightCm).toEqual({ $gte: 3 });
});

test('Badolux is detected by source or DW* productId', () => {
  expect(isBadoluxTray({ productId: 'DW021', source: 'badolux' })).toBe(true);
  expect(isBadoluxTray({ productId: 'DW021', source: '' })).toBe(true);
  expect(isBadoluxTray({ productId: 'SLA12070', source: 'hassmann' })).toBe(false);
});

test('display price applies the Badolux discount so it matches the Kosten tab', () => {
  // DW021 list price 310,80 € → Kosten shows 310.80 × (1 − 0.20) = 248,64 €.
  expect(trayDisplayPrice({ productId: 'DW021', source: 'badolux', price: 310.8 }, 0.20)).toBe(248.64);
});

test('display price leaves Hassmann/SLA trays unchanged', () => {
  expect(trayDisplayPrice({ productId: 'SLA12070', source: 'hassmann', price: 341.46 }, 0.20)).toBe(341.46);
});

// matchesTrayDims is the offline fallback's in-memory stand-in for
// buildTrayDimFilter's Mongo $expr — same cases as above, expressed as a
// predicate over a plain object instead of a query. Both must agree, or a
// tray shown online could vanish (or a wrong one appear) offline.
describe('matchesTrayDims agrees with buildTrayDimFilter on the same cases', () => {
  test('single axis: larger side must cover it, orientation-independent', () => {
    const dims = { w: 120, l: null, h: null };
    expect(matchesTrayDims({ widthCm: 120, lengthCm: 90 }, dims)).toBe(true);   // Hassmann orientation
    expect(matchesTrayDims({ widthCm: 90, lengthCm: 120 }, dims)).toBe(true);   // Badolux orientation
    expect(matchesTrayDims({ widthCm: 100, lengthCm: 110 }, dims)).toBe(false); // too small either way
  });

  test('two axes: footprint must cover both the larger and smaller side', () => {
    const dims = { w: 120, l: 100, h: null };
    expect(matchesTrayDims({ widthCm: 120, lengthCm: 100 }, dims)).toBe(true);
    expect(matchesTrayDims({ widthCm: 100, lengthCm: 120 }, dims)).toBe(true); // rotated, still fits
    expect(matchesTrayDims({ widthCm: 120, lengthCm: 90 }, dims)).toBe(false); // shorter side too small
  });

  test('height is a hard floor when provided', () => {
    const dims = { w: null, l: null, h: 5 };
    expect(matchesTrayDims({ heightCm: 5 }, dims)).toBe(true);
    expect(matchesTrayDims({ heightCm: 4.9 }, dims)).toBe(false);
  });
});

test('matchesTraySeriesAndSource mirrors the route\'s productId/source filter', () => {
  const sla = { productId: 'SLA12070', source: 'hassmann' };
  const dw = { productId: 'DW021', source: 'badolux' };
  const other = { productId: 'PLA5282', source: '' };

  expect(matchesTraySeriesAndSource(sla, { series: 'SLA', source: '' })).toBe(true);
  expect(matchesTraySeriesAndSource(dw, { series: 'SLA', source: '' })).toBe(false);
  expect(matchesTraySeriesAndSource(dw, { series: '', source: 'badolux' })).toBe(true);
  expect(matchesTraySeriesAndSource(sla, { series: '', source: 'badolux' })).toBe(false);
  expect(matchesTraySeriesAndSource(other, { series: '', source: '' })).toBe(false); // neither SLA nor DW
});

test('scoreAndRank sorts by closeness then price and trims to 3', () => {
  const docs = [
    { productId: 'SLA1', price: 300, widthCm: 130, lengthCm: 90 },
    { productId: 'SLA2', price: 200, widthCm: 120, lengthCm: 90 }, // exact match, cheaper
    { productId: 'SLA3', price: 250, widthCm: 120, lengthCm: 90 }, // exact match, pricier
    { productId: 'SLA4', price: 100, widthCm: 150, lengthCm: 90 },
    { productId: 'SLA5', price: 100, widthCm: 160, lengthCm: 90 },
  ];
  const results = scoreAndRank(docs, { w: 120, l: 90, h: null, budget: false }, 0.20);
  expect(results).toHaveLength(3);
  // Two exact-fit trays tie on score (0) and are ordered by price.
  expect(results[0].productId).toBe('SLA2');
  expect(results[1].productId).toBe('SLA3');
  expect(results.some((r) => r.isDW !== undefined || r.isSLA !== undefined)).toBe(false); // internal flags stripped
});
