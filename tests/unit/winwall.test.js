/**
 * winwall Wandverkleidung (second supplier, 2026-10): panel plan from the wall
 * widths, sets for pairs, accessories, sealing by area, cutting and freight —
 * and old offers (no wvSupplier) stay VIGOUR, priced exactly as before.
 */
import pricingCore, {
  winwallPanelPlan, winwallOrderLines, winwallSealingSets, winwallProfileSuggestion, winwallDecorCode, winwallDecor, WINWALL_DECORS, WINWALL_FORMATS, WINWALL_EXTRAS, NO_MARKUP_IDS, computeFingerprint, supplierCodes, SUPPLIER_QUALITY,
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
  test("sealing: 6,25 m² only for 5–6,25 m², otherwise 5 m² sets", () => {
    expect(winwallSealingSets(5)).toEqual([{ productId: "WS80301", qty: 1 }]);
    expect(winwallSealingSets(6)).toEqual([{ productId: "WS80302", qty: 1 }]);
    expect(winwallSealingSets(6.25)).toEqual([{ productId: "WS80302", qty: 1 }]);
    expect(winwallSealingSets(6.3)).toEqual([{ productId: "WS80301", qty: 2 }]);
    expect(winwallSealingSets(11.5)).toEqual([{ productId: "WS80301", qty: 3 }]);
    expect(winwallSealingSets(0)).toEqual([]);
  });
  test("profiles from the wall situation: joints per straight wall, one inner corner per corner", () => {
    // U-Form 120 / 200 / 120 at full height: 150 | 150+50 | 150 → joints only on the back wall
    const u = winwallProfileSuggestion(winwallPanelPlan("u", { links: 120, back: 200, rechts: 120 }, { heightCm: 250 }));
    expect(u).toEqual({ WS80110: 2, WS80111: 2, WS80112: 0, WS80113: 1 });
    expect(winwallProfileSuggestion(winwallPanelPlan("wand", { back: 90 }, { heightCm: 250 }))).toEqual({ WS80110: 2, WS80111: 0, WS80112: 0, WS80113: 0 });
    expect(winwallProfileSuggestion(winwallPanelPlan("ecke", { links: 90, back: 90 }, { heightCm: 250 })).WS80111).toBe(1);
  });
  test("decor codes: WS and NW, old digit-only values are WS", () => {
    expect(winwallDecorCode("203")).toBe("WS203");
    expect(winwallDecorCode("nw 220")).toBe("NW220");
    expect(winwallDecorCode("WS2O3")).toBe(null);
    expect(winwallDecor({ wvWwDecor: "custom", wvWwDecorCustom: "ws 233" })).toEqual({ code: "WS233", name: "Beton" });
    expect(winwallDecor({ wvWwDecor: "custom", wvWwDecorCustom: "WS999" })).toEqual({ code: "WS999", name: null });
    expect(WINWALL_DECORS.map((d) => d.code)).toEqual(["WS000", "WS243", "WS503", "WS228", "WS229", "WS227", "WS203",
      "WS219", "NW220", "NW222", "WS225", "NW215", "NW216", "WS210", "WS290"]);
    expect(WINWALL_DECORS.every((d) => d.name)).toBe(true);
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
      WS20325: 1, WS20316: 1, WS80110: 3, WS80113: 2, WS80102: 4, WS80302: 1, "WS-ZUSCHNITT": 3,
    });
  });
  test("no freight per offer (collective orders); no cutting unless ticked", async () => {
    const q = ids(await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_17: "1" }));
    expect(q).toEqual({ WS20317: 1 });
  });
  test("a typed NW decor is ordered and priced from the price list (no DB article)", async () => {
    const all = await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "custom", wvWwDecorCustom: "nw 230", wvWwQty_15: "3", wvWwSealing: "on", wvArea: "4" });
    const by = Object.fromEntries(all.map((l) => [l.productId, l]));
    expect(Object.keys(by).sort()).toEqual(["NW23015", "NW23025", "WS80301"]);
    expect([by.NW23025.unitPrice, by.NW23015.unitPrice, by.WS80301.unitPrice]).toEqual([261.76, 132.35, 113.5]);
  });
  test("Silikon for the joints: Kleinmaterial from stock, not a winwall article", async () => {
    PRODUCTS["2000302"] = PRODUCTS[2000302];
    const all = await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "WS203", wvWwQty_15: "1", wvWw_2000302: "on", wvWwQty_2000302: "2" });
    const sil = all.find((l) => l.productId === "2000302");
    expect([sil.qty, sil.category]).toEqual([2, "Kleinmaterial"]);
  });
  test("sealing without Wandfläche covers what the panels cover", async () => {
    const q = ids(await lines({ wvEnabled: true, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_15: "3", wvWwSealing: "on" }));
    // 3 × 2,5 m² = 7,5 m² → 2 × 5 m²
    expect([q.WS80301, q.WS80302]).toEqual([2, undefined]);
  });
  test("VIGOUR (hm) leaves the fingerprint of an old offer alone; winwall changes it", () => {
    const old = { activeOffer: "bu", wandverkleidung: { ...vigourWall } };
    expect(computeFingerprint({ ...old, wandverkleidung: { ...vigourWall, wvSupplier: "hm" } })).toBe(computeFingerprint(old));
    expect(computeFingerprint({ ...old, wandverkleidung: { ...vigourWall, wvSupplier: "ww" } })).not.toBe(computeFingerprint(old));
  });
  test("cutting and freight carry no markup", () => {
    for (const id of ["WS-ZUSCHNITT", "WS-FRACHT", "WS-FRACHT-GROSS"]) expect(NO_MARKUP_IDS.has(id)).toBe(true);
  });
});

describe("supplier codes (Kürzel)", () => {
  const L = (...cats) => cats.map((category) => ({ category }));
  test("Wandverkleidung: winwall / VIGOUR / Badolux, only with WV lines", () => {
    expect(supplierCodes({ wandverkleidung: { wvSupplier: "ww" } }, L("Wandverkleidung")).wv).toBe("WV-WW");
    expect(supplierCodes({ wandverkleidung: {} }, L("Wandverkleidung")).wv).toBe("WV-HM");
    expect(supplierCodes({ wandverkleidung: { wvSupplier: "hm" } }, L("Wandverkleidung")).wv).toBe("WV-HM");
    expect(supplierCodes({ wandverkleidung: { wvColor: "WP001|Standard-Dekor" } }, L("Wandverkleidung")).wv).toBe("WV-BX");
    expect(supplierCodes({ wandverkleidung: { wvSupplier: "ww" } }, L("Fußboden")).wv).toBe(null);
  });
  test("Duschwanne: Slate / Badolux / Haßmann / Freier Posten", () => {
    const dw = (tray) => supplierCodes({ duschwanne: { chosenTrayProductId: tray } }, L("Duschwanne")).dw;
    expect([dw("SLA12090"), dw("DW015"), dw("V2PT83LC"), dw("")]).toEqual(["DW-SL", "DW-BX", "DW-HM", "DW-FP"]);
    expect(supplierCodes({ duschwanne: { chosenTrayProductId: "SLA12090" } }, []).dw).toBe(null);
  });
  test("quality texts exist for winwall, VIGOUR and Slate", () => {
    expect(SUPPLIER_QUALITY["WV-WW"]).toMatch(/EN 13501-1.*Greenguard Gold.*5 Jahre/);
    expect(SUPPLIER_QUALITY["WV-HM"]).toMatch(/DIN 4102-1/);
    expect(SUPPLIER_QUALITY["DW-SL"]).toMatch(/DIN 51097.*EN 14527/);
  });
  test("the price result carries the codes", async () => {
    const r = await computePrices({
      activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne: {},
      wandverkleidung: { wvEnabled: true, wvSupplier: "ww", wvWwDecor: "203", wvWwQty_15: "1" },
      optional: {}, rabatt: {}, Arbeitszeit: {},
    });
    expect(r.supplierCodes).toEqual({ wv: "WV-WW", dw: null });
  });
});
