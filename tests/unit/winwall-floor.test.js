/**
 * winwall as "Wandverkleidung als Fußboden" (Fußboden tab, 2026-11): panels per format
 * (pairs as sets), adhesive always the Flächenkleber for the whole floor, leftover math,
 * and old offers (no wallCladdingSupplier) stay VIGOUR, priced exactly as before.
 */
import pricingCore, {
  winwallLeftoverM2, WINWALL_FORMATS, WINWALL_EXTRAS, supplierCodes,
} from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  V3WV09: { productId: "V3WV09", name: "Wandverkleidung 1497", price: 400 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
};
for (const f of WINWALL_FORMATS) PRODUCTS[`WS203${f.code}`] = { productId: `WS203${f.code}`, name: "winwall", price: f.price, source: "winwall" };
for (const x of WINWALL_EXTRAS) PRODUCTS[x.id] = { productId: x.id, name: x.name, price: x.price, source: "winwall" };

const ProductModel = {
  find: (q) => {
    const docs = (q?.productId?.$in || []).map((id) => PRODUCTS[id]).filter(Boolean);
    return { lean: async () => docs, select: () => ({ lean: async () => docs }) };
  },
  findOne: () => ({ lean: async () => null }),
};
const noDoc = { findOne: () => ({ select: () => ({ lean: async () => null }), lean: async () => null }) };
const { computePrices } = pricingCore(ProductModel, {
  cfg: { get: (k, def) => def },
  fetchVigourNetPrices: async () => new Map(),
  OfferModel: noDoc,
  DraftModel: noDoc,
});
const run = (duschwanne) =>
  computePrices({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne, wandverkleidung: {}, optional: {}, rabatt: {}, Arbeitszeit: {} });
const floorLines = async (dw) => (await run(dw)).materials.lines.filter((l) => l.category === "Fußboden");
const ids = (ls) => Object.fromEntries(ls.map((l) => [l.productId || l.id, l.qty]));

const wwFloor = { addWallCladding: true, wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS203", wallCladdingKind: "Gesamtes-Bad" };

describe("winwall floor lines", () => {
  test("three 100×250: one set + one single, adhesive for the whole area", async () => {
    const l = await floorLines({ ...wwFloor, wallCladdingPanelSize: "15", wallCladdingQty: "3", wallCladdingArea: "7,5" });
    expect(ids(l)).toEqual({ WS20325: 1, WS20315: 1, R_4260602: 13 }); // 7,5 / 0,6 = 12,5 → 13
    expect(l.find((x) => x.productId === "WS20325").unitPrice).toBe(261.76);
  });
  test("a typed decor is billed at the same list price", async () => {
    const l = await floorLines({ ...wwFloor, wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: "ws 203", wallCladdingPanelSize: "17", wallCladdingQty: "1", wallCladdingArea: "3" });
    expect(ids(l)).toEqual({ WS20317: 1, R_4260602: 5 });
  });
  test("adhesive is always R_4260602, no winwall adhesive/sealing/cut/freight", async () => {
    const l = await floorLines({ ...wwFloor, wallCladdingPanelSize: "16", wallCladdingQty: "2", wallCladdingArea: "6" });
    expect(Object.keys(ids(l)).filter((id) => /^WS80|^WS-/.test(id))).toEqual([]);
    expect(ids(l).R_4260602).toBe(10);
  });
  test("leftover covers all of it (qty 0): only the adhesive for the full floor", async () => {
    const l = await floorLines({ ...wwFloor, wallCladdingUseLeftover: true, wallCladdingQty: "0", wallCladdingArea: "3" });
    expect(ids(l)).toEqual({ R_4260602: 5 });
  });
});

describe("old offers stay VIGOUR", () => {
  const vigour = { addWallCladding: true, wallCladdingPanelSize: "997", wallCladdingQty: "2", wallCladdingColor: "Marmor weiß", wallCladdingArea: "4" };
  test("no wallCladdingSupplier → Alu panels, no winwall article", async () => {
    const l = await floorLines(vigour);
    expect(ids(l)).toEqual({ V3WVK09: 2, R_4260602: 7 });
  });
  test("explicit hm prices exactly the same as missing", async () => {
    expect(await floorLines({ ...vigour, wallCladdingSupplier: "hm" })).toEqual(await floorLines(vigour));
  });
  test("a winwall decor left in an old offer changes nothing without the supplier", async () => {
    expect(await floorLines({ ...vigour, wallCladdingWwDecor: "WS203" })).toEqual(await floorLines(vigour));
  });
});

describe("winwallLeftoverM2", () => {
  test("delivered (sets count as two panels) minus wall, × 0,8", () => {
    // 2 × 100×250 + 1 × 125×250 = 5 + 3,125 = 8,125 m²; wall 6 → 2,125 × 0,8 = 1,70
    expect(winwallLeftoverM2({ 15: 2, 16: 1 }, 6)).toBe(1.7);
    expect(winwallLeftoverM2({ 13: 3 }, 5)).toBe(0.92); // 3 × 2,05 = 6,15 − 5 = 1,15 × 0,8
  });
  test("below the minimum or without area → null", () => {
    expect(winwallLeftoverM2({ 15: 2, 16: 1 }, 8)).toBe(null); // 0,125 × 0,8 = 0,1 < 0,5
    expect(winwallLeftoverM2({ 15: 2 }, 0)).toBe(null);
    expect(winwallLeftoverM2({}, 5)).toBe(null);
  });
  test("thresholds are parameters (admin)", () => {
    expect(winwallLeftoverM2({ 15: 2, 16: 1 }, 8, 1, 0.1)).toBe(0.13);
  });
});

describe("supplier Kürzel for the Fußboden", () => {
  const L = [{ category: "Fußboden" }];
  test("winwall floor adds fb and, without a wall, wv", () => {
    expect(supplierCodes({ duschwanne: { addWallCladding: true, wallCladdingSupplier: "ww" } }, L)).toEqual({ wv: "WV-WW", dw: null, fb: "WV-WW" });
  });
  test("old/VIGOUR floor: unchanged shape", () => {
    expect(supplierCodes({ duschwanne: { addWallCladding: true } }, L)).toEqual({ wv: null, dw: null });
  });
});
