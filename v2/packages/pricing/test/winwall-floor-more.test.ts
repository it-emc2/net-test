// Further Dekors on the winwall floor (duschwanne.wallCladdingWwMore, owner 2026-11-25, ADR 029):
// one line per Dekor and format, sums and the Flächenkleber count every Dekor's plates, an
// absent/empty field prices exactly as before. TS engine AND the legacy copy (offline / today's UI).
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore from "../../../../src/logic/pricing-core.js";
import { computeFingerprint, createPricingEngine, supplierCodes, WINWALL_CATALOG, WINWALL_FORMATS, winwallFloorMore } from "../src/index.js";

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
const ww = { addWallCladding: true, wallCladdingSupplier: "ww", wallCladdingKind: "Gesamtes-Bad", wallCladdingWwDecor: "WS203" };
const more = (...rows: unknown[]) => JSON.stringify(rows);
const ids = (ls: any[]) => Object.fromEntries(ls.map((l) => [l.productId || l.id, l.qty]));
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe.each(Object.entries(engines))("winwall floor, further Dekors (%s engine)", (_name, engine: any) => {
  const run = async (dw: Record<string, unknown>) => engine.computePrices(payload(structuredClone(dw)));
  const floor = async (dw: Record<string, unknown>) => (await run(dw)).materials.lines.filter((l: any) => l.category === "Fußboden");

  it("absent, empty text, [] and an empty list price byte-identically, with the same fingerprint", async () => {
    const base = { ...ww, wallCladdingWwQty: '{"15":2}', wallCladdingQty: "2", wallCladdingPanelSize: "15", wallCladdingArea: "5" };
    const a = await run(base);
    for (const empty of ["", "[]", [], null]) {
      const b = await run({ ...base, wallCladdingWwMore: empty });
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(computeFingerprint(payload({ ...base, wallCladdingWwMore: empty }))).toBe(computeFingerprint(payload(base)));
    }
    expect(computeFingerprint(payload({ ...base, wallCladdingWwMore: more({ decor: "WS229", qty: { 15: 1 } }) }))).not.toBe(computeFingerprint(payload(base)));
  });

  it("two Dekors: one line per Dekor and format, the sum grows by exactly the further plates", async () => {
    const one = { ...ww, wallCladdingWwQty: '{"13":0,"15":2,"16":0,"17":0}', wallCladdingQty: "2", wallCladdingPanelSize: "15", wallCladdingArea: "8" };
    const two = { ...one, wallCladdingWwMore: more({ decor: "WS229", decorCustom: "", qty: { 13: 1, 15: 0, 16: 0, 17: 1 } }) };
    const [a, b] = [await run(one), await run(two)];
    const l = b.materials.lines.filter((x: any) => x.category === "Fußboden");
    expect(ids(l)).toEqual({ WS20315: 2, WS22913: 1, WS22917: 1, R_4260602: 14 }); // area typed: 8 / 0,6 → 14 either way
    expect(l.map((x: any) => x.productId)).toEqual(["WS20315", "WS22913", "WS22917", "R_4260602"]); // first Dekor first
    const ws229 = `${WINWALL_CATALOG.WS229} (WS 229)`;
    expect(l.find((x: any) => x.productId === "WS22913")).toMatchObject({
      unitPrice: 111.47, name: `Aluverbundplatte 1000×2050 mm — Dekor: ${ws229}`, label: `- 1 Stk Aluverbundplatte 1000×2050 mm — Dekor: ${ws229}`,
    });
    expect(l.find((x: any) => x.productId === "WS22917")).toMatchObject({ unitPrice: 217.5, name: `Aluverbundplatte 1500×2500 mm — Dekor: ${ws229}` });
    expect(r2(b.materials.sum - a.materials.sum)).toBe(r2(111.47 + 217.5));
    const sumLines = (r: any) => r2(r.materials.lines.reduce((s: number, x: any) => s + Number(x.lineTotal ?? x.total ?? 0), 0));
    expect(sumLines(b)).toBe(r2(b.materials.sum));
    expect(supplierCodes(payload(two), b.materials.lines)).toMatchObject({ fb: "WV-WW" });
  });

  it("three Dekors without an area: the Flächenkleber counts every Dekor's plates", async () => {
    const first = { ...ww, wallCladdingWwQty: '{"15":1}', wallCladdingQty: "1", wallCladdingPanelSize: "15" };
    expect(ids(await floor(first))).toEqual({ WS20315: 1, R_4260602: 5 }); // 2,5 m² / 0,6 → 5
    const three = { ...first, wallCladdingWwMore: more(
      { decor: "WS229", qty: { 16: 1 } },
      { decor: "custom", decorCustom: "nw 220", qty: '{"17":1}' },
    ) };
    // 2,5 + 3,125 + 3,75 = 9,375 m² / 0,6 = 15,6 → 16
    expect(ids(await floor(three))).toEqual({ WS20315: 1, WS22916: 1, NW22017: 1, R_4260602: 16 });
    expect((await floor(three)).find((x: any) => x.productId === "NW22017").name).toBe(`Aluverbundplatte 1500×2500 mm — Dekor: ${WINWALL_CATALOG.NW220} (NW 220)`);
  });

  it("the same Dekor twice is one line per format; the array form works like the JSON text", async () => {
    const dw = { ...ww, wallCladdingWwQty: '{"15":1}', wallCladdingArea: "3", wallCladdingWwMore: [{ decor: "custom", decorCustom: "ws 203", qty: { 15: 2, 13: 1 } }] };
    expect(ids(await floor(dw))).toEqual({ WS20315: 3, WS20313: 1, R_4260602: 5 });
    expect(ids(await floor({ ...dw, wallCladdingWwMore: JSON.stringify(dw.wallCladdingWwMore) }))).toEqual(ids(await floor(dw)));
  });

  it("first Dekor without plates: the further Dekors alone are priced", async () => {
    const dw = { ...ww, wallCladdingWwQty: "", wallCladdingQty: "0", wallCladdingPanelSize: "", wallCladdingWwMore: more({ decor: "WS229", qty: { 15: 2 } }) };
    expect(ids(await floor(dw))).toEqual({ WS22915: 2, R_4260602: 9 }); // 5 m² / 0,6 → 9
    // with "Reste anrechnen" the further plates still count (not "leftover only")
    expect(ids(await floor({ ...dw, wallCladdingUseLeftover: true, wallCladdingArea: "3" }))).toEqual({ WS22915: 2, R_4260602: 5 });
  });

  it("an entry without a valid Dekor-Nr. or without plates is left out; VIGOUR ignores the field", async () => {
    const dw = { ...ww, wallCladdingWwQty: '{"15":1}', wallCladdingArea: "3", wallCladdingWwMore: more(
      { decor: "custom", decorCustom: "abc", qty: { 15: 4 } }, { decor: "WS229", qty: { 15: 0 } }, { decor: "WS229" }, "x", null) };
    expect(ids(await floor(dw))).toEqual({ WS20315: 1, R_4260602: 5 });
    expect(ids(await floor({ ...dw, wallCladdingWwMore: "not json" }))).toEqual({ WS20315: 1, R_4260602: 5 });
    const vigour = { addWallCladding: true, wallCladdingPanelSize: "997", wallCladdingQty: "2", wallCladdingColor: "Marmor weiß", wallCladdingArea: "4" };
    expect(ids(await floor({ ...vigour, wallCladdingWwMore: more({ decor: "WS229", qty: { 15: 3 } }) }))).toEqual(ids(await floor(vigour)));
  });
});

describe("winwallFloorMore", () => {
  it("reads JSON text or a list, keeps entries with a Dekor-Nr. and plates", () => {
    expect(winwallFloorMore(undefined)).toEqual([]);
    expect(winwallFloorMore("")).toEqual([]);
    expect(winwallFloorMore('[{"decor":"229","qty":{"15":"2"}}]')).toEqual([{ code: "WS229", name: WINWALL_CATALOG.WS229, qty: { 13: 0, 15: 2, 16: 0, 17: 0 } }]);
    expect(winwallFloorMore([{ decor: "custom", decorCustom: "23013", qty: { 13: 1 } }])).toEqual([{ code: "NW230", name: (WINWALL_CATALOG as any).NW230 ?? null, qty: { 13: 1, 15: 0, 16: 0, 17: 0 } }]);
  });
});
