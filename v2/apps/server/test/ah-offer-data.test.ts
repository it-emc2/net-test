// ADR 028 — the AH offer document data now reads every amount from ONE function (@oc/pricing
// ahOfferTotals). Golden comparison against the legacy builder (docx-template buildAhData, kept in
// the ported file as the reference) over 543 stored offers (143 real anonymised + 400 controlled):
//  - payer Kassenkunde and Selbstzahler: every DOCX field and the AH Bitrix numbers byte-identical
//  - empty payer (owner decision 2: = Kassenkunde): only the funding lines change (listed below)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ahInputFromPayload, ahOfferTotals } from "@oc/pricing";
import { configureDocuments } from "../src/modules/documents/context.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const FIX = fileURLToPath(new URL("./fixtures/ah-golden-offers.json", import.meta.url));
const cases: Array<{ id: string; config: { entlastungsbetragMonat: number; steuerabsetzPct: number; steuerabsetzCapJahr: number }; payload: any }> = JSON.parse(readFileSync(FIX, "utf8")).cases;
const quiet = () => {};
let current: Record<string, unknown> = {};
let tpl: any, mine: any;

beforeAll(async () => {
  configureDocuments({
    businessConfig: { get: (k: string, f?: unknown) => (k in current ? current[k] : f) }, fetchVigourNetPrices: async () => new Map(), vigorUri: "mongodb://127.0.0.1:9/none", root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet }, pdf: { docxToPdf: async () => Buffer.alloc(0), htmlToPdf: async () => Buffer.alloc(0) },
  });
  tpl = await import("../src/modules/documents/ported/docx-template.js");
  mine = await import("../src/modules/documents/ah-offer-data.js");
});

const setConfig = (c: (typeof cases)[number]["config"]) => {
  current = { ENTLASTUNGSBETRAG_MONAT: c.entlastungsbetragMonat, STEUERABSETZ_PCT: c.steuerabsetzPct, STEUERABSETZ_CAP_JAHR: c.steuerabsetzCapJahr };
};
const both = (c: (typeof cases)[number]) => {
  setConfig(c);
  const legacy = tpl.buildAhData(structuredClone(c.payload));
  const now = mine.buildAhOfferData(structuredClone(c.payload), { fmtCurrency: tpl.fmtCurrency, haushaltTasks: tpl.AH_GENERIC_HAUSHALT_TASKS, begleitungTasks: tpl.AH_GENERIC_BEGLEITUNG_TASKS });
  const { AhBetragNum, ...rest } = now;
  return { legacy, now: rest, betrag: AhBetragNum as number };
};
const payerOf = (c: (typeof cases)[number]) => String(c.payload.Kundendaten?.payer || "");
const isSZ = (c: (typeof cases)[number]) => payerOf(c).toUpperCase() === "SELBSTZAHLER";

describe("AH offer document data — golden comparison with the legacy builder", () => {
  it("has the cases", () => {
    expect(cases.length).toBe(543);
    expect(cases.filter((c) => payerOf(c) === "Kassenkunde").length).toBe(302);
    expect(cases.filter(isSZ).length).toBe(133);
    expect(cases.filter((c) => !payerOf(c)).length).toBe(108);
  });

  it.each(cases.filter((c) => payerOf(c) === "Kassenkunde").map((c) => [c.id, c] as const))("Kassenkunde unchanged: %s", (_id, c) => {
    const { legacy, now, betrag } = both(c);
    expect(now).toEqual(legacy);
    expect(JSON.stringify(now)).toBe(JSON.stringify(legacy)); // byte-identical, key order included
    expect(betrag).toBe(legacy.AhGesamtNum); // Kasse: the deal amount is the net total
  });

  it.each(cases.filter(isSZ).map((c) => [c.id, c] as const))("Selbstzahler unchanged: %s", (_id, c) => {
    const { legacy, now, betrag } = both(c);
    expect(JSON.stringify(now)).toBe(JSON.stringify(legacy));
    // the deal amount of a Selbstzahler is the gross the DOCX prints (AhBrutto)
    expect(tpl.fmtCurrency(betrag)).toBe(legacy.AhGesamtNum > 0 ? legacy.AhBrutto : tpl.fmtCurrency(0));
  });

  it("empty payer = Kassenkunde: only the funding lines change, and exactly as for the same offer with payer Kassenkunde", () => {
    const changed: string[] = [];
    for (const c of cases.filter((x) => !payerOf(x))) {
      const { legacy, now } = both(c);
      const asKasse = both({ ...c, payload: { ...c.payload, Kundendaten: { ...c.payload.Kundendaten, payer: "Kassenkunde" } } });
      expect(now, c.id).toEqual(asKasse.legacy);
      const keys = Object.keys(legacy).filter((k) => JSON.stringify(legacy[k]) !== JSON.stringify((now as any)[k]));
      for (const k of keys) expect(["AhHasEigenanteil", "AhAbzugLabel", "AhEntlastungsbetrag", "AhEigenanteil", "AhEigenanteilNum"], `${c.id} ${k}`).toContain(k);
      if (keys.length) changed.push(c.id);
    }
    // the cases with funding ticked change (written to the ADR); the others print as before
    expect(changed.length).toBe(EMPTY_PAYER_CHANGED);
  });
});

/** real offers whose saved zone differs from their travel time (Hof postcodes, old zones) — ADR 028 */
const CONSISTENT_REAL = 117;
/** offers without a payer that have a funding source ticked and a total > 0 */
const EMPTY_PAYER_CHANGED = 72;

describe("one total: documents = screen for the real offers", () => {
  // real offers whose saved zone agrees with their travel time (v2 always writes both together):
  // the screen's reading and the documents' give the same totals. (The 400 controlled cases hold
  // synthetic shapes — untyped services, "schedule" rows, several cards per kind — that the two
  // readings take differently on purpose; their DOCX numbers are pinned above.)
  const consistent = cases.filter((c) => {
    if (c.id.startsWith("ah-ctl")) return false;
    const s = ahInputFromPayload(c.payload, c.config), z = c.payload.Arbeitszeit?.ahTravelZone;
    return (s.zone?.zone ?? 0) === (Number(z) || 0);
  });
  it("covers the real offers with a consistent zone (the others: ADR 028 open question)", () => expect(consistent.length).toBe(CONSISTENT_REAL));
  it.each(consistent.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    setConfig(c.config);
    const screen = ahOfferTotals(ahInputFromPayload(c.payload, c.config));
    const doc = mine.ahTotalsOfPayload(c.payload, c.config);
    for (const k of ["net", "vat", "gross", "eigenanteil", "amountToPay", "customerAmount", "payer"] as const) expect(doc[k], k).toEqual(screen[k]);
    expect(doc.deductions).toEqual(screen.deductions);
  });
});
