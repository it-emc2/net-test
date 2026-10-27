/**
 * winwall Wandverkleidung (second supplier, 2026-10): panel plan from the wall
 * widths, sets for pairs, accessories, sealing by area, cutting and freight —
 * and old offers (no wvSupplier) stay VIGOUR, priced exactly as before.
 */
import pricingCore, {
  winwallPanelPlan, winwallOrderLines, winwallSealingSets, WINWALL_FORMATS, WINWALL_EXTRAS, NO_MARKUP_IDS,
} from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  TRWDSET5: { productId: "TRWDSET5", name: "Wandabdichtung", price: 80 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
  V3A: { productId: "V3A", name: "Abschlussprofil", price: 20 },
  V3V: { productId: "V3V", name: "Verbindungsprofil", price: 20 },
  2000302: { productId: "2000302", name: "Silikon", price: 8 },
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
const lines = async (wv) =>
  (await computePrices({
    activeOffer: "bu",
    Kundendaten: { payer: "Selbstzahler" },
    duschwanne: {}, wandverkleidung: wv, optional: {}, rabatt: {}, Arbeitszeit: {},
  })).materials.lines;
const ids = (ls) => Object.fromEntries(ls.map((l) => [l.productId || l.id, l.qty]));

// What a VIGOUR offer looks like on the page (accessories ticked by default).
const vigourWall = {
  wvEnabled: true, wvColor: "Marmor weiß", wvQty997: "3",
  wvSealing: "x", flechenkleber: "x", wvFlachenQty: "6", wvEndProfile: "x", wvEndProfileQty: "2",
  wvV3VQty: "2", wvSilikon: "x", wvSilikonQty: "2",
};

describe("winwallPanelPlan", () => {
  test("up to 205 cm only 100 × 205 (cheapest per cm)", () => {
    expect(winwallPanelPlan("wand", { back: 180 }, { heightCm: 200 }).qty).toEqual({ 13: 2 });
  });
  test("full height: cheapest mix of 100/125/150 × 250 over the job", () => {
    // 120 → one 125 (173,53) beats two 100 (264,70); 180 → two 100 is cheapest.
    expect(winwallPanelPlan("ecke", { links: 120, back: 180 }, { heightCm: 250 }).qty).toEqual({ 17: 0, 16: 1, 15: 2 });
  });
  test("low cladding: several strips out of one panel", () => {
    const p = winwallPanelPlan("wand", { back: 180 }, { heightCm: 60 });
    expect([p.perPanel, p.gesamt, p.panelHeightCm]).toEqual([3, 1, 205]);
  });
});

describe("winwallOrderLines / winwallSealingSets", () => {
  test("pairs become sets, the 150 has no set", () => {
    expect(winwallOrderLines("203", { 15: 3, 16: 2, 17: 1 }).map((l) => [l.productId, l.qty]))
      .toEqual([["WS20325", 1], ["WS20315", 1], ["WS20326", 1], ["WS20317", 1]]);
  });
  test("sealing: cheapest sets that cover the area", () => {
    expect(winwallSealingSets(5)).toEqual([{ productId: "WS80301", qty: 1 }]);
    expect(winwallSealingSets(6)).toEqual([{ productId: "WS80302", qty: 1 }]);
    expect(winwallSealingSets(11.5)).toEqual([{ productId: "WS80302", qty: 2 }]);
    expect(winwallSealingSets(0)).toEqual([]);
  });
});

describe("winwall pricing", () => {
  test("old offer without wvSupplier stays VIGOUR", async () => {
    const q = ids(await lines(vigourWall));
    expect(q).toMatchObject({ V3WVK09: 3, TRWDSET5: 1, R_4260602: 6, V3A: 2, V3V: 2, 2000302: 2 });
    expect(Object.keys(q).some((k) => k.startsWith("WS"))).toBe(false);
  });
  test("winwall replaces the VIGOUR panels and accessories", async () => {
    const q = ids(await lines({
      ...vigourWall, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_15: "2", wvWwQty_16: "1",
      wvWw_WS80110: "on", wvWwQty_WS80110: "3", wvWw_WS80113: "on", wvWwQty_WS80113: "2",
      wvWw_WS80102: "on", wvWwQty_WS80102: "4", wvWwSealing: "on", wvArea: "6", wvWwCut: "on",
    }));
    expect(q).toEqual({
      WS20325: 1, WS20316: 1, WS80110: 3, WS80113: 2, WS80102: 4, WS80302: 1, "WS-ZUSCHNITT": 3, "WS-FRACHT": 1,
    });
  });
  test("a 150 cm panel ships as Großplatte; no cutting unless ticked", async () => {
    const q = ids(await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_17: "1" }));
    expect(q).toEqual({ WS20317: 1, "WS-FRACHT-GROSS": 1 });
  });
  test("sealing without Wandfläche covers what the panels cover", async () => {
    const q = ids(await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_15: "3", wvWwSealing: "on" }));
    // 3 × 2,5 m² = 7,5 m²: 2 × 5 m² (338 €) beats 6,25 + 5 (365 €) and 2 × 6,25 (392 €).
    expect([q.WS80301, q.WS80302]).toEqual([2, undefined]);
  });
  test("cutting and freight carry no markup", () => {
    for (const id of ["WS-ZUSCHNITT", "WS-FRACHT", "WS-FRACHT-GROSS"]) expect(NO_MARKUP_IDS.has(id)).toBe(true);
  });
});
