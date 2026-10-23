/**
 * Standard-Wandpaneele (Keramico WP*, 95 × 255 cm) are counted from the wall
 * widths like the cleverbad.de calculator: each wall ⌈Breite ÷ 95⌉, no offcut
 * carried round a corner. They rode on the 997/1497 Alu quantities before.
 */
import pricingCore, { keramicoPanelPlan, vigourPanelPlan } from "../../src/logic/pricing-core.js";

const PRODUCTS = {
  WP003: { productId: "WP003", name: "Keramico Wandpaneel", price: 129 },
  WP007: { productId: "WP007", name: "Wandpaneel Sonder-Dekor", price: 169 },
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
  V3V: { productId: "V3V", name: "Verbindungsprofil", price: 20 },
  PR101VBM3: { productId: "PR101VBM3", name: "Polymer Kleber Weiß", price: 12.96, source: "badolux" },
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

describe("keramicoPanelPlan — cladding height", () => {
  test("50 cm high: one panel gives 5 strips, so 6 columns need 2 panels", () => {
    // U-Form 100 / 200 / 90 = 6 columns (see the shop example above)
    const p = keramicoPanelPlan("u", { links: 100, back: 200, rechts: 90 }, { heightCm: 50 });
    expect([p.perPanel, p.gesamt]).toEqual([5, 2]);
    expect(p.pieces.map((x) => x.platte)).toEqual([1, 1, 1, 1, 1, 2]);
    // panel 1: 5 strips, 5 cm left → 5 height cuts; panel 2: 1 strip → 1; + 3 width cuts
    expect([p.hoehenSchnitte, p.breitenSchnitte, p.schnitte]).toEqual([6, 3, 9]);
  });
  test("the saw cut counts: 51 cm fits 4×, not 5×, into 255 cm", () => {
    expect(keramicoPanelPlan("wand", { back: 500 }, { heightCm: 51 }).perPanel).toBe(4);
  });
  test("motif panels are only shortened, never shared", () => {
    const p = keramicoPanelPlan("u", { links: 100, back: 200, rechts: 90 }, { heightCm: 50, reuse: false });
    expect([p.perPanel, p.gesamt, p.hoehenSchnitte]).toEqual([1, 6, 6]);
  });
  test("full height or none: the plain rule", () => {
    for (const heightCm of [null, "", 255, 300])
      expect(keramicoPanelPlan("u", { links: 100, back: 200, rechts: 90 }, { heightCm }).gesamt).toBe(6);
  });
});

describe("Keramico wall (Standard) pricing", () => {
  test("counted from widths, Alu quantities ignored, −10 %", async () => {
    const ls = await lines({ wvColor: "WP003|grau", wvKSituation: "u", wvKLinks: "100", wvKBack: "200", wvKRechts: "90", wvQty997: 2 });
    const k = ls.find((l) => l.productId === "WP003");
    expect(k.qty).toBe(6);
    expect(k.unitPrice).toBeCloseTo(116.1, 2);
    expect(k.label).toBe("- 6 Stk Wandpaneel 950×2550 mm — Farbe: grau (U-Form: 100 + 200 + 90 cm, 3 Zuschnitte)");
    expect(ls.find((l) => /997|1497/.test(l.label || ""))).toBeUndefined();
  });

  test("cladding height and manual quantity reach the offer", async () => {
    const low = await lines({ wvColor: "WP003|grau", wvKSituation: "u", wvKLinks: "100", wvKBack: "200", wvKRechts: "90", wvKHoehe: "50" });
    expect(low.find((l) => l.productId === "WP003").label).toBe("- 2 Stk Wandpaneel 950×2550 mm — Farbe: grau (U-Form: 100 + 200 + 90 cm, Höhe 50 cm, 9 Zuschnitte)");
    const manual = await lines({ wvColor: "WP003|grau", wvKSituation: "wand", wvKBack: "180", wvKQty: "5" });
    expect(manual.find((l) => l.productId === "WP003")).toMatchObject({ qty: 5 });
    expect(manual.find((l) => l.productId === "WP003").label).toMatch(/Menge manuell\)$/);
    const onlyManual = await lines({ wvColor: "WP003|grau", wvKQty: "3" });
    expect(onlyManual.find((l) => l.productId === "WP003").label).toBe("- 3 Stk Wandpaneel 950×2550 mm — Farbe: grau (Menge manuell)");
  });

  test("no widths → no Keramico line", async () => {
    const ls = await lines({ wvColor: "WP003|grau", wvKSituation: "wand" });
    expect(ls.find((l) => l.productId === "WP003")).toBeUndefined();
  });

  test("Sonder-Dekor WP007 gets no discount", async () => {
    const ls = await lines({ wvColor: "WP007|Sonder", wvKBack: "180" });
    expect(ls.find((l) => l.productId === "WP007").unitPrice).toBe(169);
  });

  test("Sonder-Dekor names the chosen motif", async () => {
    const ls = await lines({ wvColor: "WP007|Sonder", wvKBack: "180", wvMotif: "PRE97WP22|Arcadia" });
    expect(ls.find((l) => l.productId === "WP007").label).toMatch(/Farbe: Sonder — Motiv: Arcadia \(PRE97WP22\) \(Eine Wand: 180 cm/);
    const own = await lines({ wvColor: "WP007|Sonder", wvKBack: "180", wvMotif: "eigen|Eigenes Motiv nach Absprache" });
    expect(own.find((l) => l.productId === "WP007").label).toMatch(/Motiv: Eigenes Motiv nach Absprache \(Eine/);
    const std = await lines({ wvColor: "WP003|grau", wvKBack: "180", wvMotif: "PRE97WP22|Arcadia" });
    expect(std.find((l) => l.productId === "WP003").label).not.toMatch(/Motiv/);
  });

  test("discount can be switched off in the Admin panel", async () => {
    overrides = { BU_WV_STANDARD_DISCOUNT: 0 };
    const ls = await lines({ wvColor: "WP003|x", wvKBack: "180" });
    overrides = {};
    expect(ls.find((l) => l.productId === "WP003").unitPrice).toBe(129);
  });
});

describe("Keramico accessories (same as Premium + Badolux)", () => {
  test("Flächenkleber and V3V fall back to the Keramico panel count", async () => {
    // 180 cm → 2 panels: 2 × 2 Flächenkleber, 2 − 1 V3V
    const ls = await lines({ wvColor: "WP003|grau", wvKBack: "180", flechenkleber: "on" });
    expect(ls.find((l) => l.productId === "R_4260602")).toMatchObject({ qty: 4 });
    expect(ls.find((l) => l.productId === "V3V")).toMatchObject({ qty: 1 });
  });
  test("Badolux accessory billed only when ticked with a quantity", async () => {
    const on = await lines({ wvColor: "WP003|grau", wvKBack: "180", wvBx_PR101VBM3: "on", wvBxQty_PR101VBM3: "3" });
    expect(on.find((l) => l.productId === "PR101VBM3")).toMatchObject({ qty: 3 });
    const off = await lines({ wvColor: "WP003|grau", wvKBack: "180", wvBxQty_PR101VBM3: "3" });
    expect(off.find((l) => l.productId === "PR101VBM3")).toBeUndefined();
  });
});

describe("vigourPanelPlan (Premium 997 / 1497, cheapest mix)", () => {
  const prices = { 997: 168, 1497: 240 };
  test("one wall: cheapest of the mixes", () => {
    expect(vigourPanelPlan("wand", { back: 180 }, { prices })).toMatchObject({ qty997: 2, qty1497: 0 });
    expect(vigourPanelPlan("wand", { back: 140 }, { prices })).toMatchObject({ qty997: 0, qty1497: 1 });
    // 249,4 cm (1497 + 997) is too short for 250 cm
    expect(vigourPanelPlan("wand", { back: 250 }, { prices })).toMatchObject({ qty997: 0, qty1497: 2 });
  });
  test("prices decide: an expensive 1497 is replaced by 997s", () => {
    expect(vigourPanelPlan("wand", { back: 140 }, { prices: { 997: 100, 1497: 500 } })).toMatchObject({ qty997: 2, qty1497: 0 });
  });
  test("cladding height shares panels per size", () => {
    const p = vigourPanelPlan("u", { links: 90, back: 160, rechts: 90 }, { prices, heightCm: 120 });
    expect([p.qty997, p.qty1497, p.pieces.length]).toEqual([2, 0, 4]);
  });
  test("without prices: least panel width", () => {
    expect(vigourPanelPlan("wand", { back: 250 })).toMatchObject({ qty997: 3, qty1497: 0 });
  });
});
