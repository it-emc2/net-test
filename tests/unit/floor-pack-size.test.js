/**
 * Fußboden quantities, against the real pricing core (not a mirror of it).
 *
 * Badolux-Hydroträgerplatten (BP*) are sold per pack of 1,49 m². They were
 * divided by the 0,3-m² V5FB02 panel size, so a 12-m² floor billed 46 units
 * instead of 10. The premium panels must come out exactly as before — every
 * saved offer with a floor uses them.
 */
import pricingCore from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  V5FB02: { productId: "V5FB02", name: "Fußboden V5", price: 159.84 },
  "AVP-W": { productId: "AVP-W", name: "Aluverbundplatte weiß", price: 126 },
  BP003: { productId: "BP003", name: "Hydroträgerplatte creme", price: 35.16 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
};

const ProductModel = {
  find: (q) => {
    const ids = q?.productId?.$in || [];
    const docs = ids.map((id) => PRODUCTS[id]).filter(Boolean);
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

const floorLine = async (product, area = "12") => {
  const r = await computePrices({
    activeOffer: "bu",
    Kundendaten: { payer: "Selbstzahler" },
    duschwanne: { addFlooring: true, floorArea: area, flooringProduct: [product] },
    wandverkleidung: {}, optional: {}, rabatt: {}, Arbeitszeit: {},
  });
  return r.materials.lines.find((l) => l.productId === product.split("|")[0]);
};

describe("floor quantities", () => {
  test("Badolux is billed per 1,49-m² pack", async () => {
    const l = await floorLine("BP003|Hydroträgerplatte creme");
    // 12 m² × 1,15 Verschnitt = 13,8 m² ÷ 1,49 = 9,26 → 10 packs
    expect(l.qty).toBe(10);
    expect(l.lineTotal).toBeCloseTo(351.6, 2);
    expect(l.label).toMatch(/10 Pkg Hydroträgerplatte \(1 Pkg = 1,49 m²\)/);
  });

  test("V5FB02 is unchanged: 0,3-m² panels at 1/8 of the pack price", async () => {
    const l = await floorLine("V5FB02|Lava-Beige");
    expect(l.qty).toBe(46);
    expect(l.unitPrice).toBeCloseTo(19.98, 2);
    expect(l.label).toBe("- 46 Stk Fußboden-Paneele (1 Paneele = 0.3 m²) — Farbe: Lava-Beige");
  });

  test("AVP-W is unchanged", async () => {
    const l = await floorLine("AVP-W|Weiß");
    expect(l.qty).toBe(46);
    expect(l.label).toBe("- 46 Stk Aluverbundplatte weiß (1 Paneele = 0.3 m²)");
  });

  test("packs always round up — a part pack is a whole pack", async () => {
    // 1 m² × 1,15 = 1,15 m² → 1 pack; 1,3 m² × 1,15 = 1,495 m² → 2 packs
    expect((await floorLine("BP003|creme", "1")).qty).toBe(1);
    expect((await floorLine("BP003|creme", "1,3")).qty).toBe(2);
  });
});
