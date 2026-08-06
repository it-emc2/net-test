import { buildTrayDimFilter, scoreTray, isBadoluxTray, trayDisplayPrice } from '../../src/routes/trays.js';

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
