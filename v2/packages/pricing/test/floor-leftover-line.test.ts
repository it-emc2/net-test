// Floor covered ONLY by leftovers of the Wandverkleidung (owner 2026-11-26, ADR 031): the offer
// document lists „- 1 Stk Aluverbundplatte …“ without a price, in the wording of the bought plate
// lines and without any word about leftovers. Display only: the line is in materialsDisplayDocx
// and nowhere else — materials.lines, every sum, the markup and the plate counts stay as they were.
// TS engine AND the legacy copy (today's UI offline), which must answer identically.
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore from "../../../../src/logic/pricing-core.js";
import { createPricingEngine, floorLeftoverLine, supplierCodes, wallCladdingLeftoverOnly, WINWALL_CATALOG, WINWALL_FORMATS } from "../src/index.js";

const PRODUCTS: Record<string, Record<string, unknown>> = {
  V3WVK09: { productId: "V3WVK09", name: "Wandverkleidung 997", price: 300 },
  R_4260602: { productId: "R_4260602", name: "Flächenkleber", price: 11.82 },
};
for (const d of ["WS203", "WS229", "NW220"]) for (const f of WINWALL_FORMATS)
  PRODUCTS[`${d}${f.code}`] = { productId: `${d}${f.code}`, name: "winwall", price: f.price, source: "winwall" };
const ProductModel = {
  find: (q: { productId: { $in: string[] } }) => ({ lean: async () => (q?.productId?.$in || []).map((id) => PRODUCTS[id]).filter(Boolean) }),
  findOne: () => ({ lean: async () => null }),
};
const deps = { cfg: { get: (_k: string, def?: unknown) => def }, fetchVigourNetPrices: async () => new Map<string, number>() };
const engines = { ts: createPricingEngine(ProductModel as any, deps), legacy: legacyCore(ProductModel, deps) };

const payload = (duschwanne: Record<string, unknown>) =>
  ({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne, wandverkleidung: {}, optional: {}, rabatt: {}, Arbeitszeit: {} });
/** VIGOUR floor, only leftovers: "Reste anrechnen" on, no panels, 4 m² typed */
const vigour = { addWallCladding: "on", wallCladdingColor: "Marmor weiß", wallCladdingPanelSize: "", wallCladdingQty: "", wallCladdingUseLeftover: "on", wallCladdingArea: "4" };
/** winwall floor, only leftovers */
const ww = { addWallCladding: true, wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingWwQty: '{"13":0,"15":0,"16":0,"17":0}', wallCladdingQty: "0", wallCladdingUseLeftover: "on", wallCladdingArea: "3,5" };
const ws229 = `${WINWALL_CATALOG.WS229} (WS 229)`;
const ids = (ls: any[]) => Object.fromEntries(ls.map((l) => [l.productId || l.id, l.qty]));
const shownOnly = (r: any) => (r.materialsDisplayDocx.lines as any[]).filter((l) => l.displayOnly);
const MONEY = ["total", "Nettobetrag", "netAfterRabatt_and_Bonus", "netAfterRabatt", "vatOnNet", "markup", "markupBase", "productsSubtotal",
  "material_plus_aufschlag", "material_afterRabatt_and_aufschlag", "selfPayAmount", "subsidyAmount", "rabattAmount", "totalAfterRabatt", "bonusGross"];

describe.each(Object.entries(engines))("leftover-only floor: the unpriced plate line (%s engine)", (_name, engine: any) => {
  const run = async (dw: Record<string, unknown>) => engine.computePrices(payload(structuredClone(dw)));

  it("VIGOUR: one line „- 1 Stk Aluverbundplatte (Marmor weiß)“ before the Flächenkleber, in the document copy only", async () => {
    const r = await run(vigour);
    const doc = r.materialsDisplayDocx.lines as any[];
    expect(shownOnly(r)).toEqual([{
      productId: null, name: "Aluverbundplatte (Marmor weiß)", color: "Marmor weiß", qty: 1, unit: null, unitPrice: 0, lineTotal: 0,
      label: "- 1 Stk Aluverbundplatte (Marmor weiß)", labelLines: ["- 1 Stk Aluverbundplatte (Marmor weiß)"], source: null, finish: null,
      currentNet: null, hassmannArticle: null, hassmannQty: null, docxHide: false, category: "Fußboden", displayOnly: true, note: "aus Resten der Wandverkleidung",
    }]);
    const floor = doc.filter((l) => l.category === "Fußboden").map((l) => l.label);
    expect(floor).toEqual(["- 1 Stk Aluverbundplatte (Marmor weiß)", "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)"]);
    // nothing about leftovers in what the customer reads
    for (const l of doc) expect(`${l.label} ${l.name}`).not.toMatch(/rest/i);
    // the document copy is otherwise exactly what it was: the priced lines without the hidden ones
    expect(doc.filter((l) => !l.displayOnly)).toEqual((r.materials.lines as any[]).filter((l) => !l.docxHide));
  });

  it("money, priced lines, plate counts and supplier codes do not see it", async () => {
    const r = await run(vigour);
    expect(ids(r.materials.lines)).toEqual({ R_4260602: 7 }); // 4 m² / 0,6 → 7 Pkg, no panel
    expect(r.materials.sum).toBe(82.74); // 7 × 11,82 — the adhesive only, as before
    for (const l of [...r.materials.lines, ...r.materialsDisplayUI.lines]) { expect(l.displayOnly).toBeUndefined(); expect(l.productId).toBeTruthy(); }
    expect(r.materialsDisplayUI.lines).toEqual(r.materials.lines.map((l: any) => ({ ...l }))); // the screen copy is untouched
    expect(r.markupBase).toBe(82.74);
    // the same offer with the line taken out of the document copy: every amount is the same number
    const sumDoc = (r.materialsDisplayDocx.lines as any[]).reduce((s, l) => s + Number(l.lineTotal || 0), 0);
    expect(Math.round(sumDoc * 100) / 100).toBe(r.materials.sum);
    expect(r.supplierCodes).toEqual(supplierCodes(payload(vigour), r.materials.lines));
    expect(supplierCodes(payload(vigour), r.materialsDisplayDocx.lines)).toEqual(r.supplierCodes);
    for (const k of MONEY) expect(Number.isFinite(Number(r[k] ?? 0)), k).toBe(true);
  });

  it("winwall: the floor's Dekor in the wording of the bought plates, no format, no price", async () => {
    const r = await run(ww);
    expect(shownOnly(r).map((l) => [l.label, l.name, l.qty, l.lineTotal])).toEqual([[`- 1 Stk Aluverbundplatte — Dekor: ${ws229}`, `Aluverbundplatte — Dekor: ${ws229}`, 1, 0]]);
    expect(ids(r.materials.lines)).toEqual({ R_4260602: 6 }); // 3,5 m² / 0,6 → 6
    expect(r.supplierCodes).toMatchObject({ fb: "WV-WW" }); // the heading's Kürzel as before (from the adhesive)
    const floor = (r.materialsDisplayDocx.lines as any[]).filter((l) => l.category === "Fußboden").map((l) => l.label);
    expect(floor[0]).toBe(`- 1 Stk Aluverbundplatte — Dekor: ${ws229}`);
  });

  it("winwall: a typed Dekor-Nr.; no Dekor / no colour → just „1 Stk Aluverbundplatte“", async () => {
    expect(shownOnly(await run({ ...ww, wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: "nw 220" }))[0].label)
      .toBe(`- 1 Stk Aluverbundplatte — Dekor: ${WINWALL_CATALOG.NW220} (NW 220)`);
    expect(shownOnly(await run({ ...ww, wallCladdingWwDecor: "" }))[0].label).toBe("- 1 Stk Aluverbundplatte");
    expect(shownOnly(await run({ ...vigour, wallCladdingColor: "" }))[0].label).toBe("- 1 Stk Aluverbundplatte");
  });

  it("further Dekors (ADR 029) without plates: still leftover only; one with plates: no display line", async () => {
    const none = { ...ww, wallCladdingWwMore: JSON.stringify([{ decor: "NW220", qty: { 15: 0 } }, { decor: "custom", decorCustom: "abc", qty: { 15: 3 } }]) };
    expect(shownOnly(await run(none))).toHaveLength(1);
    const some = { ...ww, wallCladdingWwMore: JSON.stringify([{ decor: "NW220", qty: { 15: 1 } }]) };
    const r = await run(some);
    expect(shownOnly(r)).toEqual([]);
    expect(ids(r.materials.lines)).toEqual({ NW22015: 1, R_4260602: 6 });
  });

  it("plates bought (with or without the rest credited), no area, or the floor off: no display line", async () => {
    for (const dw of [
      { ...vigour, wallCladdingQty: "2", wallCladdingPanelSize: "997" },
      { ...vigour, wallCladdingQty: "1", wallCladdingPanelSize: "997", wallCladdingUseLeftover: undefined },
      { ...ww, wallCladdingWwQty: '{"15":1}' },
      { ...vigour, wallCladdingArea: "" },
      { ...vigour, addWallCladding: undefined },
      { ...vigour, wallCladdingUseLeftover: undefined },
    ]) {
      const r = await run(dw);
      expect(shownOnly(r)).toEqual([]);
      expect(r.materialsDisplayDocx.lines).toEqual((r.materials.lines as any[]).filter((l) => !l.docxHide));
    }
  });
});

describe("leftover-only floor: both engines answer the same", () => {
  it.each([["VIGOUR", vigour], ["winwall", ww], ["winwall typed", { ...ww, wallCladdingWwDecor: "custom", wallCladdingWwDecorCustom: "23013" }]])("%s", async (_n, dw) => {
    const [a, b] = await Promise.all([engines.ts.computePrices(payload(structuredClone(dw))), engines.legacy.computePrices(payload(structuredClone(dw)))]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("wallCladdingLeftoverOnly / floorLeftoverLine", () => {
  it("the rule of the priced floor block", () => {
    expect(wallCladdingLeftoverOnly(vigour)).toBe(true);
    expect(wallCladdingLeftoverOnly({ ...vigour, wallCladdingArea: "0" })).toBe(false);
    expect(wallCladdingLeftoverOnly({ ...vigour, wallCladdingQty: "1" })).toBe(false);
    expect(wallCladdingLeftoverOnly(undefined)).toBe(false);
    expect(floorLeftoverLine({})).toBeNull();
    expect(floorLeftoverLine(ww)).toMatchObject({ qty: 1, displayOnly: true, category: "Fußboden", productId: null });
  });
});
