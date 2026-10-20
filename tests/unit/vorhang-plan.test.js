import { planParts, applyPlan, fromSaved, buildLines } from "../../src/public/configurator/vorhang-plan.js";

const item = (articleNumber, net, sizeCm = null, extra = {}) => ({ articleNumber, name: articleNumber, net, sizeCm, ...extra });
const catalog = {
  curtains: [120, 140, 200, 240, 250, 300, 350, 400].map((s) => item(`HEWIDV${s}200W`, s / 2, s)),
  rods: [90, 100, 120, 150, 180].map((s) => item(`DEPVS${s}`, s / 3, s)),
  mandatory: [item("DEPVSROS", 32)],
  optional: [
    item("DEPDS30", 40), item("DEPDS50", 51.2), item("DEPDS80", 68.48),
    item("DEPVSBO", 22.46), item("DEPVSK", 25.6),
    item("DEPVSRI", 13.25, null, { packNote: "Beutel à 10 Ringe" }),
  ],
};
const fresh = (shape, legs) => applyPlan({ ...fromSaved(null), enabled: true, shape, legs, mandatoryQty: {} }, catalog);
const qtyOf = (lines) => Object.fromEntries(lines.map((l) => [l.articleNumber, l.qty]));

test("Nische: 1 rod, curtain ≥ width, no Bogen/Deckenstütze", () => {
  expect(qtyOf(buildLines(fresh("nische", { a: 120 }), catalog))).toEqual({
    HEWIDV120200W: 1, DEPVS120: 1, DEPVSROS: 1, DEPVSRI: 1,
  });
});

test("Ecke: 2 rods, 1 Bogen, 1 Deckenstütze 50 cm", () => {
  expect(qtyOf(buildLines(fresh("ecke", { a: 90, b: 90 }), catalog))).toEqual({
    HEWIDV200200W: 1, DEPVS90: 2, DEPVSROS: 1, DEPVSBO: 1, DEPDS50: 1, DEPVSRI: 1,
  });
});

test("U-Form: 3 rods, 2 Bögen, 2 Deckenstützen, config text on the curtain only", () => {
  const lines = buildLines(fresh("u", { a: 90, b: 120, c: 90 }), catalog);
  expect(qtyOf(lines)).toEqual({
    HEWIDV300200W: 1, DEPVS90: 2, DEPVS120: 1, DEPVSROS: 1, DEPVSBO: 2, DEPDS50: 2, DEPVSRI: 1,
  });
  expect(lines[0].label).toBe("HEWIDV300200W 300 cm (U-Form 90 + 120 + 90 cm)");
  expect(lines.find((l) => l.articleNumber === "DEPVSRI").label).toBe("DEPVSRI (Beutel à 10 Ringe)");
});

test("side > 180 cm → 2 rods + Kupplung; run > 400 cm → 2 curtains", () => {
  expect(planParts("nische", { a: 250 }, catalog)).toMatchObject({ rodQty: { DEPVS150: 2 }, kupplung: 1 });
  expect(planParts("u", { a: 150, b: 180, c: 150 }, catalog).curtainQty).toEqual({ HEWIDV240200W: 2 });
});

test("switching shape keeps the chosen Deckenstütze length and ring bags", () => {
  const s = fresh("ecke", { a: 90, b: 90, c: 90 });
  s.optionalQty.DEPDS50 = 0; s.optionalQty.DEPDS80 = 1; s.optionalQty.DEPVSRI = 3;
  s.shape = "u";
  applyPlan(s, catalog);
  expect(s.optionalQty).toMatchObject({ DEPDS80: 2, DEPDS50: 0, DEPVSRI: 3, DEPVSBO: 2 });
});

test("offer saved before the shape picker restores the exact same lines", () => {
  const legacy = {
    enabled: true, widthCm: 130, curtainSel: "HEWIDV140200W", rodSel: "DEPVS150",
    mandatoryQty: { DEPVSROS: 1 }, optionalQty: { DEPVSK: 2, DEPVSBO: 0 },
  };
  const lines = buildLines(fromSaved(legacy), catalog);
  expect(lines.map((l) => [l.articleNumber, l.qty, l.label])).toEqual([
    ["HEWIDV140200W", 1, "HEWIDV140200W 140 cm"],
    ["DEPVS150", 1, "DEPVS150"],
    ["DEPVSROS", 1, "DEPVSROS"],
    ["DEPVSK", 2, "DEPVSK"],
  ]);
  // and survives a save → restore round trip of the new format unchanged
  const again = buildLines(fromSaved(JSON.parse(JSON.stringify(fromSaved(legacy)))), catalog);
  expect(again).toEqual(lines);
});
