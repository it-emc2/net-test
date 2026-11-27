// Kürzel je Produkt (owner 2026-11-27): each line of Fußboden, Wandverkleidung, Duschwanne and
// Duschabtrennung carries the Kürzel of ITS supplier — only for that supplier's own products, per
// line, not per section. One rule, lineSupplierCode(line, payload), in the TS core and the legacy
// copy (today's UI offline), which must answer identically. supplierCodes() stays as it was.
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore, { lineSupplierCode as legacyLineSupplierCode } from "../../../../src/logic/pricing-core.js";
import { createPricingEngine, lineSupplierCode, supplierCodes, WINWALL_FORMATS } from "../src/index.js";

const PRODUCTS: Record<string, Record<string, unknown>> = {
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  V3A: { productId: "V3A", name: "Abschlussprofil 3.0 255 cm silber eloxiert VIGOUR", price: 29.51 },
  V3V: { productId: "V3V", name: "Verbindungsprofil 3.0 255 cm silber eloxiert VIGOUR", price: 29.51 },
  TRWDSET5: { productId: "TRWDSET5", name: "TRINNITY Wandabdichtung BASIS-Set 5 qm", price: 152.52 },
  R_4260602: { productId: "R_4260602", name: "Ramsauer 645 Flächen Kleber", price: 11.82 },
  "2000302": { productId: "2000302", name: "Ramsauer 450 Sanitär 1K Silicon", price: 5.03 },
  WP001: { productId: "WP001", name: "Standard-Dekor Marmor weiß", price: 129, manufacturer: "Badolux" },
  PR101VBM3: { productId: "PR101VBM3", name: "Polymer Kleber Weiß, Kartusche 290 ml", price: 9.72, manufacturer: "Badolux" },
  WS80113: { productId: "WS80113", name: "winwall Verbindungsprofil 2550 mm, Alu eloxiert", price: 16.39, manufacturer: "winwall" },
  WS80301: { productId: "WS80301", name: "winwall Abdichtungsset 5 m² (DIN 18534-1)", price: 113.5, manufacturer: "winwall" },
  WS80302: { productId: "WS80302", name: "winwall Abdichtungsset 6,25 m² (DIN 18534-1)", price: 135.75, manufacturer: "winwall" },
};
for (const f of WINWALL_FORMATS) PRODUCTS[`WS229${f.code}`] = { productId: `WS229${f.code}`, name: "winwall", price: f.price, manufacturer: "winwall" };
const ProductModel = {
  find: (q: { productId: { $in: string[] } }) => ({ lean: async () => (q?.productId?.$in || []).map((id) => PRODUCTS[id]).filter(Boolean) }),
  findOne: () => ({ lean: async () => null }),
};
const deps = { cfg: { get: (_k: string, def?: unknown) => def }, fetchVigourNetPrices: async () => new Map<string, number>() };
const engines = { ts: createPricingEngine(ProductModel as any, deps), legacy: legacyCore(ProductModel, deps) };
const rules = { ts: lineSupplierCode, legacy: legacyLineSupplierCode as typeof lineSupplierCode };

const offer = (wandverkleidung: Record<string, unknown>, duschwanne: Record<string, unknown> = {}) =>
  ({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne, wandverkleidung, optional: {}, rabatt: {}, Arbeitszeit: {} });
/** VIGOUR wall: 2 panels, Abschlussprofil, TRINNITY sealing, Ramsauer adhesive + silicone (Verbindungsprofil follows by itself) */
const VIGOUR_WALL = { wvQty997: "2", wvColor: "V3WVK09|Marmor weiß", wvEndProfile: true, wvEndProfileQty: "1", wvSealing: true, flechenkleber: true, wvFlachenQty: "4", wvSilikon: true, wvSilikonQty: "2" };
/** winwall plates on the Fußboden tab („Wandverkleidung als Fußboden“) */
const WINWALL_FLOOR = { addWallCladding: true, wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingWwQty: '{"13":0,"15":2,"16":0,"17":0}', wallCladdingArea: "4" };
/** Badolux Standard rows (Keramico WP) with winwall's accessory set and a Badolux accessory */
const BADOLUX_WALL = { wvBudgetMode: "1", wvKRows: JSON.stringify([{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 3 }]), wvWw_WS80113: true, wvWwQty_WS80113: "2", wvWwSealing: true, wvArea: "6", wvBx_PR101VBM3: true, wvBxQty_PR101VBM3: "2" };

/** category → [productId, code] of every line of the four sections */
const coded = (r: any, payload: unknown, rule: typeof lineSupplierCode) =>
  (r.materialsDisplayDocx.lines as any[]).filter((l) => ["Fußboden", "Wandverkleidung", "Duschwanne", "Duschabtrennung"].includes(l.category))
    .map((l) => [l.category, l.productId, rule(l, payload)]);

describe.each(Object.keys(engines) as (keyof typeof engines)[])("lineSupplierCode on priced offers (%s engine + rule)", (name) => {
  const engine: any = engines[name], rule = rules[name];

  it("VIGOUR wall + winwall floor: per product, not per section", async () => {
    const p = offer(VIGOUR_WALL, WINWALL_FLOOR);
    const r = await engine.computePrices(structuredClone(p));
    expect(coded(r, p, rule)).toEqual([
      ["Fußboden", "WS22915", "WV-WW"],
      ["Fußboden", "R_4260602", null], // Ramsauer — no supplier of ours
      ["Wandverkleidung", "V3WVK09", "WV-HM"],
      ["Wandverkleidung", "TRWDSET5", "WV-HM"], // TRINNITY Wandabdichtung (Haßmann)
      ["Wandverkleidung", "R_4260602", null],
      ["Wandverkleidung", "V3A", "WV-HM"],
      ["Wandverkleidung", "V3V", "WV-HM"],
    ]);
    // the silicone is Kleinmaterial: outside the four sections, never coded
    expect((r.materials.lines as any[]).find((l) => l.productId === "2000302")?.category).toBe("Kleinmaterial");
    // the section codes (Bitrix „Material-Kürzel“, Bestellliste) are unchanged
    expect(r.supplierCodes).toEqual({ wv: "WV-HM", dw: null, fb: "WV-WW" });
  });

  it("Badolux Standard rows with winwall's profiles and sealing: the panels WV-BX, the winwall items WV-WW", async () => {
    const p = offer(BADOLUX_WALL);
    const r = await engine.computePrices(structuredClone(p));
    expect(coded(r, p, rule)).toEqual([
      ["Wandverkleidung", "WP001", "WV-BX"],
      ["Wandverkleidung", "WS80113", "WV-WW"],
      ["Wandverkleidung", "WS80302", "WV-WW"],
      ["Wandverkleidung", "PR101VBM3", "WV-BX"],
    ]);
    expect(r.supplierCodes.wv).toBe("WV-BX"); // one per section, as before
  });
});

describe.each(Object.entries(rules))("lineSupplierCode — the rule per line kind (%s)", (_name, rule) => {
  const L = (category: string, productId: string | null, extra: Record<string, unknown> = {}) => ({ category, productId, ...extra });
  const tray = (id: string) => offer({}, { chosenTrayProductId: id });

  it("winwall: every WS…/NW… item, in whichever of the four sections", () => {
    for (const id of ["WS20315", "NW22016", "WS80110", "WS80111", "WS80112", "WS80113", "WS80301", "WS80302", "WS-ZUSCHNITT"]) {
      expect(rule(L("Wandverkleidung", id), {})).toBe("WV-WW");
      expect(rule(L("Fußboden", id), {})).toBe("WV-WW");
      expect(rule(L("Duschabtrennung", id), {})).toBe("WV-WW");
    }
  });

  it("VIGOUR / Haßmann wall system: panels, its profiles, TRINNITY Wandabdichtung → WV-HM", () => {
    for (const id of ["V3WVK09", "V3WV09", "V3WVK05", "V3WV20", "V3A", "V3V", "TRWDSET5"]) expect(rule(L("Wandverkleidung", id), {})).toBe("WV-HM");
    // a VIGOUR plate on the floor (Wandverkleidung als Fußboden) and „Aluverbundplatte weiß“ (ordered as V3WVK07)
    expect(rule(L("Fußboden", "V3WVK07", { hassmannArticle: "V3WVK07" }), {})).toBe("WV-HM");
    expect(rule(L("Fußboden", "AVP-W", { hassmannArticle: "V3WVK07" }), {})).toBe("WV-HM");
  });

  it("Badolux / Keramico: WP panels and the Badolux wall accessories → WV-BX", () => {
    for (const id of ["WP001", "WP006", "WP007", "PR101VBM3", "PR47VBM02", "PR59VBM03", "PR59VBM05", "PR59VBM07", "PRI130VBM01", "PRI130VBM02"])
      expect(rule(L("Wandverkleidung", id), {})).toBe("WV-BX");
  });

  it("trays: Slate DW-SL, Badolux DW-BX, other catalogue tray DW-HM, the Freier Posten DW-FP", () => {
    expect(rule(L("Duschwanne", "SLA12090"), tray("SLA12090"))).toBe("DW-SL");
    expect(rule(L("Duschwanne", "SLA12090-3"), tray("SLA12090"))).toBe("DW-SL"); // colour article of the Slate tray
    expect(rule(L("Duschwanne", "DW015"), tray("DW015"))).toBe("DW-BX");
    expect(rule(L("Duschwanne", "V2PT83LC"), tray("V2PT83LC"))).toBe("DW-HM");
    // the free item: its id is typed by the user, so only the payload tells it apart from the catalogue tray
    expect(rule(L("Duschwanne", "DW_CUSTOM"), tray(""))).toBe("DW-FP");
    expect(rule(L("Duschwanne", "SLA999"), offer({}, {}))).toBe("DW-FP");
    expect(rule(L("Duschwanne", "DW_CUSTOM"), tray("SLA12090"))).toBe("DW-FP"); // tray + free item: each its own
  });

  it("the leftover-only floor plate (ADR 031, no id): the floor's supplier", () => {
    expect(rule(L("Fußboden", null, { displayOnly: true }), offer({}, { wallCladdingSupplier: "ww" }))).toBe("WV-WW");
    expect(rule(L("Fußboden", null, { displayOnly: true }), offer({}, {}))).toBe("WV-HM");
  });

  it("no code: third-party material, floor products and sealing, shower screens, Aluprofil, other sections", () => {
    for (const [cat, id] of [
      ["Wandverkleidung", "R_4260602"], ["Fußboden", "R_4260602"], // Ramsauer adhesive
      ["Fußboden", "V5FB02"], ["Fußboden", "BP001"], ["Fußboden", "TRBDSET7"], ["Fußboden", "TRDB10"], // floor panels / floor sealing: no code defined
      ["Duschabtrennung", "HASS_PANDELTUER"], ["Duschabtrennung", "V2PT83LC"], ["Duschabtrennung", "TB_AUSGLEICH_0"], // shower screens, Aluprofil für Trockenbau
      ["Kleinmaterial", "WS80113"], ["Zubehör", "V3A"], ["Duschvorhang", "WS80113"], [undefined, "WP001"], // outside the four sections
    ] as const) expect(rule(L(cat as string, id), tray("SLA12090"))).toBe(null);
  });
});

it("supplierCodes() is untouched: one code per section, as the Bitrix field and the Bestellliste read it", () => {
  const lines = [{ category: "Wandverkleidung" }, { category: "Duschwanne" }];
  expect(supplierCodes({ wandverkleidung: { wvSupplier: "ww" }, duschwanne: { chosenTrayProductId: "SLA100" } }, lines as never)).toEqual({ wv: "WV-WW", dw: "DW-SL" });
});
