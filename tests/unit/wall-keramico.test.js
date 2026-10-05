/**
 * Standard-Wandpaneele (Keramico WP*, 2600×95 mm = 0,247 m²) are priced from the
 * Wandfläche: ⌈Fläche × 1,15 ÷ 0,247⌉. They rode on the 997/1497 Alu quantities
 * before. Alu panels (every saved offer) must not change.
 */
import pricingCore from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  WP003: { productId: "WP003", name: "Keramico Wandpaneel", price: 129 },
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
const { computePrices } = pricingCore(ProductModel, {
  cfg: { get: (_k, def) => def },
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

describe("Keramico wall (Standard)", () => {
  test("priced from the area, Alu quantities ignored", async () => {
    const ls = await lines({ wvColor: "WP003|Beton grau", wvArea: "10", wvQty997: 2, wvQty1497: 1 });
    const k = ls.find((l) => l.productId === "WP003");
    // 10 × 1,15 = 11,5 ÷ 0,247 = 46,56 → 47
    expect(k.qty).toBe(47);
    expect(k.lineTotal).toBeCloseTo(47 * 129, 2);
    expect(k.label).toMatch(/47 Stk Wandpaneel Keramico 2600×95 mm .*für 10 m² inkl\. 15 % Verschnitt/);
    expect(ls.filter((l) => l.qty > 0 && l.productId === "WP003")).toHaveLength(1);
    expect(ls.find((l) => /997|1497/.test(l.label || ""))).toBeUndefined();
  });

  test("no area → no Keramico line", async () => {
    const ls = await lines({ wvColor: "WP003|Beton grau", wvArea: "" });
    expect(ls.find((l) => l.productId === "WP003")).toBeUndefined();
  });

  test("comma decimal", async () => {
    const ls = await lines({ wvColor: "WP003|x", wvArea: "8,5" });
    expect(ls.find((l) => l.productId === "WP003").qty).toBe(40); // 9,775/0,247=39,57
  });
});
