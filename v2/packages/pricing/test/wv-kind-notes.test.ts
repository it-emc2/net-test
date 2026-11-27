// Wandverkleidung „Ausführung“ (`wvKind`) → the offer's work note under „Auszuführende Arbeiten“
// (computeWorkNotes). Owner 2026-11-27, ADR 032: two further values with their own sentence; the
// five values of today keep theirs. A work note has no amount — the totals do not move.
// TS engine AND the legacy copy (today's UI offline), which must answer identically.
import { describe, expect, it } from "vitest";
// @ts-expect-error — untyped legacy module from the current app
import legacyCore from "../../../../src/logic/pricing-core.js";
import { createPricingEngine } from "../src/index.js";

const ProductModel = { find: () => ({ lean: async () => [] }), findOne: () => ({ lean: async () => null }) };
const deps = { cfg: { get: (_k: string, def?: unknown) => def }, fetchVigourNetPrices: async () => new Map<string, number>() };
const engines = { ts: createPricingEngine(ProductModel as any, deps), legacy: legacyCore(ProductModel, deps) };
const payload = (wv: Record<string, unknown>) => ({ activeOffer: "bu", Kundendaten: { payer: "Selbstzahler" }, duschwanne: {}, wandverkleidung: { wvEnabled: true, ...wv }, optional: {}, rabatt: {}, Arbeitszeit: {} });
/** every work note of the result (key "worknote") */
const notes = (r: unknown): string[] => {
  const out: string[] = [];
  JSON.stringify(r, (_k, v) => { if (v && typeof v === "object" && v.key === "worknote") out.push(v.label); return v; });
  return [...new Set(out)];
};

describe.each(Object.entries(engines))("work note per Ausführung (%s engine)", (_name, engine: any) => {
  const run = (wv: Record<string, unknown>) => engine.computePrices(payload(wv));
  it.each([
    ["Fehlstellen", "- Schließen der Fehlstellen"],
    ["Fliesenspiegel", "- Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich"],
    ["Fliesenspiegel-Duschbereich", "- Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich"],
    ["Innenraum-der-Kabine", "- Verkleidung im Innenraum der Kabine"],
    ["Deckenhoch", "- Verkleidung deckenhoch im Dusch-/Wannenbereich"],
    ["alle-Bad-Wände-halbhoch", "- Verkleidung halbhoch aller Bad-Wände"],
    ["alle-Bad-Wände", "- Verkleidung deckenhoch aller Bad-Wände"],
  ])("%s → „%s“", async (kind, text) => {
    expect(notes(await run({ wvKind: kind }))).toEqual([text]);
  });
  it("halbhoch with a height: the height is printed", async () => {
    expect(notes(await run({ wvKind: "alle-Bad-Wände-halbhoch", wvKindHoehe: " 120 " }))).toEqual(["- Verkleidung aller Bad-Wände bis in einer Höhe von 120 cm"]);
  });
  it("the height of another Ausführung is not printed; Wandverkleidung off prints nothing", async () => {
    expect(notes(await run({ wvKind: "alle-Bad-Wände", wvKindHoehe: "120" }))).toEqual(["- Verkleidung deckenhoch aller Bad-Wände"]);
    expect(notes(await run({ wvKind: "alle-Bad-Wände-halbhoch", wvKindHoehe: "120", wvEnabled: false }))).toEqual([]);
  });
  it("no amount: the total is the same as without an Ausführung", async () => {
    const a = await run({ wvKind: "alle-Bad-Wände-halbhoch", wvKindHoehe: "120" }), b = await run({});
    expect(a.total).toBe(b.total);
  });
});
