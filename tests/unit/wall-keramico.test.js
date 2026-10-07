/**
 * Standard-Wandpaneele (Keramico WP*, 95 × 255 cm) are counted from the wall
 * widths like the cleverbad.de calculator: each wall ⌈Breite ÷ 95⌉, no offcut
 * carried round a corner. They rode on the 997/1497 Alu quantities before.
 */
import pricingCore, { keramicoPanelPlan } from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  WP003: { productId: "WP003", name: "Keramico Wandpaneel", price: 129 },
  WP007: { productId: "WP007", name: "Wandpaneel Sonder-Dekor", price: 169 },
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
};
const ProductModel = {
  find: (q) => {
    const docs = (q?.productId?.$in || []).map((id) => PRODUCTS[id]).filter(Boolean);
    return { lean: async () => docs, select: () => ({ lean: async () => docs }) };
  },
  findOne: () => ({ lean: async () => null }),
};
const noDoc = { findOne: () => ({ select: () => ({ lean: async () => null }), lean: async () => null }) };
let overrides = {};
const { computePrices } = pricingCore(ProductModel, {
  cfg: { get: (k, def) => (k in overrides ? overrides[k] : def) },
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

describe("keramicoPanelPlan (cleverbad.de rule)", () => {
  test("shop example: U-Form 100 / 200 / 90 → 6 panels, 3 cuts", () => {
    const p = keramicoPanelPlan("u", { links: 100, back: 200, rechts: 90 });
    expect(p.gesamt).toBe(6);
    expect(p.schnitte).toBe(3);
    expect(p.pieces.filter((x) => x.zuschnitt).map((x) => [x.platte, x.breite]))
      .toEqual([[2, 5], [5, 10], [6, 90]]);
    expect(p.verschnitt).toBe(180);
  });
  test("exact multiples need no cut", () => {
    const p = keramicoPanelPlan("wand", { back: 190 });
    expect([p.gesamt, p.schnitte]).toEqual([2, 0]);
  });
  test("situation decides which walls count", () => {
    expect(keramicoPanelPlan("wand", { links: 300, back: 100 }).gesamt).toBe(2);
    expect(keramicoPanelPlan("ecke", { links: "120,5", back: 100, rechts: 500 }).gesamt).toBe(4);
    expect(keramicoPanelPlan("nonsense", { back: 95 }).situation).toBe("wand");
  });
});

describe("Keramico wall (Standard) pricing", () => {
  test("counted from widths, Alu quantities ignored, −10 %", async () => {
    const ls = await lines({ wvColor: "WP003|grau", wvKSituation: "u", wvKLinks: "100", wvKBack: "200", wvKRechts: "90", wvQty997: 2 });
    const k = ls.find((l) => l.productId === "WP003");
    expect(k.qty).toBe(6);
    expect(k.unitPrice).toBeCloseTo(116.1, 2);
    expect(k.label).toBe("- 6 Stk Wandpaneel Keramico 950×2550 mm — Farbe: grau (U-Form: 100 + 200 + 90 cm, 3 Zuschnitte)");
    expect(ls.find((l) => /997|1497/.test(l.label || ""))).toBeUndefined();
  });

  test("no widths → no Keramico line", async () => {
    const ls = await lines({ wvColor: "WP003|grau", wvKSituation: "wand" });
    expect(ls.find((l) => l.productId === "WP003")).toBeUndefined();
  });

  test("Sonder-Dekor WP007 gets no discount", async () => {
    const ls = await lines({ wvColor: "WP007|Sonder", wvKBack: "180" });
    expect(ls.find((l) => l.productId === "WP007").unitPrice).toBe(169);
  });

  test("discount can be switched off in the Admin panel", async () => {
    overrides = { BU_WV_STANDARD_DISCOUNT: 0 };
    const ls = await lines({ wvColor: "WP003|x", wvKBack: "180" });
    overrides = {};
    expect(ls.find((l) => l.productId === "WP003").unitPrice).toBe(129);
  });
});
