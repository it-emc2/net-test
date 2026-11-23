// ADR 028 — the AH offer document data now reads every amount from ONE function (@oc/pricing
// ahOfferTotals). Golden comparison against the legacy builder (docx-template buildAhData, kept in
// the ported file as the reference) over 543 stored offers (143 real anonymised + 400 controlled):
//  - payer Kassenkunde and Selbstzahler: every DOCX field and the AH Bitrix numbers byte-identical
//  - empty payer (owner decision 2: = Kassenkunde): only the funding lines change (listed below)
// Addendum 2026-11-23 (owner): the zone reading. An offer ALREADY SENT keeps the documents' reading
// ("document" — every guarantee above holds unchanged); a NEW offer reads the zone as the screen
// does ("screen"). Which one applies is decided per offer number by sends/zone-reading.ts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ahDocTravel, ahInputFromPayload, ahOfferTotals, ahScreenZone } from "@oc/pricing";
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
  // treated as ALREADY SENT: the documents' own reading of the zone
  const now = mine.buildAhOfferData(structuredClone(c.payload), { fmtCurrency: tpl.fmtCurrency, haushaltTasks: tpl.AH_GENERIC_HAUSHALT_TASKS, begleitungTasks: tpl.AH_GENERIC_BEGLEITUNG_TASKS }, "document");
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
  it("covers the real offers with a consistent zone (the others: ADR 028 addendum 2026-11-23)", () => expect(consistent.length).toBe(CONSISTENT_REAL));
  it.each(consistent.map((c) => [c.id, c] as const))("%s", (_id, c) => {
    setConfig(c.config);
    const screen = ahOfferTotals(ahInputFromPayload(c.payload, c.config));
    const doc = mine.ahTotalsOfPayload(c.payload, c.config);
    for (const k of ["net", "vat", "gross", "eigenanteil", "amountToPay", "customerAmount", "payer"] as const) expect(doc[k], k).toEqual(screen[k]);
    expect(doc.deductions).toEqual(screen.deductions);
  });
});

describe("one total: screen = DOCX data = signing page = send-record amount (table)", () => {
  const CFG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };
  const HND = (dauer: string, r: string) => ({ type: "Haushaltsnahedienstleistungen", schedules: [{ dauer, regelmaessigkeit: r }], tasks: ["wohnungsreinigung"], combinedVisit: false });
  const AB = (dauer: string, r: string, combinedVisit = false) => ({ type: "Alltagsbegleitung", schedules: [{ dauer, regelmaessigkeit: r }], tasks: ["arzttermine"], combinedVisit });
  const offer = (payer: string, services: any[], fin: Record<string, string>, kd: Record<string, string> = {}) => ({
    activeOffer: "ah", ah: { services, ahServicesJson: JSON.stringify(services) }, Arbeitszeit: { travelTimeHHMM: "0:25", ahTravelZone: "3" },
    Kundendaten: { payer, ...kd }, Finanzierung: { ahVerhinderungspflegeMonat: "0", ahUmwidmungBetrag: "", ...fin },
  });
  const EB = { ahEntlastungsbetragNutzen: "on" };
  const TABLE: [string, any][] = [
    ["Kasse, HnD, no source", offer("Kassenkunde", [HND("2:00", "Wöchentlich")], {})],
    ["Kasse, HnD, Entlastungsbetrag", offer("Kassenkunde", [HND("2:00", "Wöchentlich")], EB)],
    ["Kasse, HnD, Verhinderungspflege 100", offer("Kassenkunde", [HND("2:00", "Wöchentlich")], { ahVerhinderungspflegeMonat: "100" })],
    ["Kasse, HnD, Umwidmung 80", offer("Kassenkunde", [HND("2:00", "Wöchentlich")], { ahUmwidmungBeantragt: "on", ahUmwidmungBetrag: "80" })],
    ["Kasse, all three", offer("Kassenkunde", [HND("2:00", "Wöchentlich")], { ...EB, ahVerhinderungspflegeMonat: "50", ahUmwidmungBeantragt: "on", ahUmwidmungBetrag: "30" })],
    ["Kasse, two persons", offer("Kassenkunde", [HND("3:00", "Wöchentlich")], EB, { ahZweiPersonen: "on" })],
    ["Kasse, covered completely", offer("Kassenkunde", [HND("1:00", "Monatlich")], { ...EB, ahVerhinderungspflegeMonat: "201.5" })],
    ["Kasse, two services, separate visits", offer("Kassenkunde", [HND("2:00", "14-tägig"), AB("1:30", "Wöchentlich")], EB)],
    ["Kasse, two services, combined visit", offer("Kassenkunde", [HND("2:00", "Wöchentlich"), AB("1:00", "Wöchentlich", true)], EB)],
    ["no payer, Entlastungsbetrag (= Kasse)", offer("", [HND("2:00", "Wöchentlich")], EB)],
    ["no payer, no source", offer("", [AB("2:00", "14-tägig")], {})],
    ["Selbstzahler, HnD", offer("Selbstzahler", [HND("2:00", "Wöchentlich")], {})],
    ["Selbstzahler, ticks stored (not deducted)", offer("Selbstzahler", [HND("2:00", "Wöchentlich")], { ...EB, ahVerhinderungspflegeMonat: "100" })],
    ["Selbstzahler, AB only", offer("Selbstzahler", [AB("3:00", "Monatlich")], {})],
    ["Selbstzahler, two services, combined visit", offer("Selbstzahler", [HND("1:30", "Wöchentlich"), AB("1:00", "Wöchentlich", true)], {})],
  ];
  it.each(TABLE)("%s", async (_n, payload) => {
    setConfig(CFG);
    const sign = await import("../src/modules/documents/ported/signing-docs.js");
    const screen = ahOfferTotals(ahInputFromPayload(payload, CFG));
    const data = mine.buildAhOfferData(structuredClone(payload), { fmtCurrency: tpl.fmtCurrency, haushaltTasks: tpl.AH_GENERIC_HAUSHALT_TASKS, begleitungTasks: tpl.AH_GENERIC_BEGLEITUNG_TASKS });
    const html: string = sign.buildAhAngebotHtml(data, { mode: "pdf" });
    const totalsBlock = html.slice(html.indexOf('<table class="totals">'), html.indexOf("</table>", html.indexOf('<table class="totals">')));
    const rows = [...totalsBlock.matchAll(/<tr[^>]*><td>([^<]*)<\/td><td class="num">([^<]*)<\/td><\/tr>/g)].map((m) => [m[1]!.replace(/&amp;/g, "&"), m[2]!.replace(/ /g, " ")]);
    const f = (n: number) => tpl.fmtCurrency(n).replace(/ /g, " ");
    expect(screen.net).toBeGreaterThan(0);
    expect(data.AhGesamtbetrag).toBe(tpl.fmtCurrency(screen.net));
    // the send record's total and the Bitrix deal amount (email route: AhBetragNum; move/signature: ahTotalsOfPayload)
    expect(data.AhBetragNum).toBe(screen.customerAmount);
    expect(mine.ahTotalsOfPayload(payload, CFG).customerAmount).toBe(screen.customerAmount);
    if (screen.payer === "Selbstzahler") {
      expect(data.AhIsSZ).toBe(true);
      expect(data.AhBrutto).toBe(tpl.fmtCurrency(screen.gross));
      expect(data.AhMwst).toBe(tpl.fmtCurrency(screen.vat));
      expect(rows).toEqual([["Nettobetrag", f(screen.net)], ["zzgl. 7 % MwSt.", f(screen.vat)], ["Gesamtbetrag brutto", f(screen.gross)]]);
      expect(screen.customerAmount).toBe(screen.gross);
    } else {
      expect(data.AhIsSZ).toBe(false);
      expect(screen.customerAmount).toBe(screen.net);
      if (screen.deductions.total > 0) {
        expect(data.AhEigenanteil).toBe(tpl.fmtCurrency(screen.eigenanteil));
        expect(data.AhEigenanteilNum).toBe(screen.eigenanteil);
        expect(rows).toEqual([["Gesamtbetrag", f(screen.net)], [data.AhAbzugLabel, `–${f(screen.deductions.total)}`], ["Ihr Eigenanteil", f(screen.eigenanteil)]]);
      } else {
        expect(data.AhHasEigenanteil).toBe(false);
        expect(rows).toEqual([["Gesamtbetrag", f(screen.net)]]);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Addendum 2026-11-23: NEW offers read the zone as the screen does (travel time + Hof rule)
const H = () => ({ fmtCurrency: tpl.fmtCurrency, haushaltTasks: tpl.AH_GENERIC_HAUSHALT_TASKS, begleitungTasks: tpl.AH_GENERIC_BEGLEITUNG_TASKS });
/** the offers whose printed figures differ between the old reading (already sent) and the new one
 *  (not sent before): [id, payer, old net, old gross, old Eigenanteil, new net, new gross, new Eigenanteil].
 *  Real offers (24): 22 with a saved zone that does not match their travel time, ah-offer-4cfe26f6 (no
 *  saved zone: 0:14 billed unrounded vs zone 2), ah-draft-91fcd12b (time rows nested in the tasks:
 *  0 € vs the real amount). Controlled cases (84): services read from ahServicesJson / older formats /
 *  "H:MM" durations by the screen, from ah.services by the old reading (synthetic shapes). */
const OLD_VS_NEW: [string, string, number, number, number, number, number, number][] = [
  ["ah-offer-1a777cfd", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-offer-1a777cf3", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-offer-1a72ba4c", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-offer-d626eb5f", "Kassenkunde", 163.72, 163.72, 32.72, 134.42, 134.42, 3.42],
  ["ah-offer-d626aa66", "Kassenkunde", 141.75, 141.75, 141.75, 127.1, 127.1, 127.1],
  ["ah-offer-d6267cc6", "Kassenkunde", 149.07, 149.07, 18.07, 134.42, 134.42, 3.42],
  ["ah-offer-114edbbf", "Selbstzahler", 178.36, 190.85, 190.85, 163.72, 175.18, 175.18],
  ["ah-offer-114edbbe", "Selbstzahler", 178.36, 190.85, 190.85, 163.72, 175.18, 175.18],
  ["ah-offer-114d7198", "Selbstzahler", 788.14, 843.31, 843.31, 705.9, 755.31, 755.31],
  ["ah-offer-4cff44ff", "Selbstzahler", 178.36, 190.85, 190.85, 163.72, 175.18, 175.18],
  ["ah-offer-4cfe26f6", "Selbstzahler", 192.23, 205.69, 205.69, 197.64, 211.47, 211.47],
  ["ah-draft-35f7f748", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-b0df503c", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-35f7f73c", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-b0df4edc", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-35f7f6ac", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-3d03430b", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-1b447064", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-1b44704a", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-3d034302", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-3d0342fe", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-3d0342f9", "Kassenkunde", 127.1, 127.1, 0, 112.45, 112.45, 0],
  ["ah-draft-545af54b", "Kassenkunde", 141.75, 141.75, 141.75, 127.1, 127.1, 127.1],
  ["ah-draft-91fcd12b", "Selbstzahler", 0, 0, 0, 183.72, 196.58, 196.58],
  ["ah-ctl-0009", "Kassenkunde", 331.93, 331.93, 0, 0, 0, 0],
  ["ah-ctl-0013", "Kassenkunde", 431.68, 431.68, 331.68, 352.74, 352.74, 252.74],
  ["ah-ctl-0017", "Selbstzahler", 414.54, 443.56, 443.56, 16.13, 17.26, 17.26],
  ["ah-ctl-0018", "Kassenkunde", 69.84, 69.84, 0, 353.94, 353.94, 103.94],
  ["ah-ctl-0019", "Kassenkunde", 367.26, 367.26, 236.26, 25.18, 25.18, 0],
  ["ah-ctl-0023", "Kassenkunde", 282.85, 282.85, 57.85, 258.79, 258.79, 33.79],
  ["ah-ctl-0030", "Selbstzahler", 169.2, 181.04, 181.04, 74.71, 79.94, 79.94],
  ["ah-ctl-0039", "Kassenkunde", 0, 0, 0, 193.01, 193.01, 0],
  ["ah-ctl-0041", "Kassenkunde", 330.46, 330.46, 0, 159.43, 159.43, 0],
  ["ah-ctl-0042", "Selbstzahler", 70.81, 75.77, 75.77, 51.66, 55.28, 55.28],
  ["ah-ctl-0047", "Selbstzahler", 277.79, 297.24, 297.24, 266.88, 285.56, 285.56],
  ["ah-ctl-0059", "Kassenkunde", 78.58, 78.58, 0, 316.38, 316.38, 0],
  ["ah-ctl-0061", "Kassenkunde", 428.46, 428.46, 297.46, 30.06, 30.06, 0],
  ["ah-ctl-0062", "Kassenkunde", 0, 0, 0, 561.77, 561.77, 0],
  ["ah-ctl-0076", "Kassenkunde", 360.73, 360.73, 229.73, 464.99, 464.99, 333.99],
  ["ah-ctl-0080", "Kassenkunde", 363.19, 363.19, 238.19, 350.81, 350.81, 225.81],
  ["ah-ctl-0090", "Kassenkunde", 384.88, 384.88, 209.88, 327.42, 327.42, 152.42],
  ["ah-ctl-0092", "Kassenkunde", 1252.68, 1252.68, 1051.68, 1638.69, 1638.69, 1437.69],
  ["ah-ctl-0102", "Kassenkunde", 58.66, 58.66, 0, 0, 0, 0],
  ["ah-ctl-0115", "Selbstzahler", 136.29, 145.83, 145.83, 152.73, 163.42, 163.42],
  ["ah-ctl-0116", "Kassenkunde", 1230.04, 1230.04, 904.04, 1225.25, 1225.25, 899.25],
  ["ah-ctl-0119", "Kassenkunde", 27.64, 27.64, 0, 49.6, 49.6, 0],
  ["ah-ctl-0120", "Kassenkunde", 0, 0, 0, 122.59, 122.59, 0],
  ["ah-ctl-0140", "Kassenkunde", 0, 0, 0, 157.97, 157.97, 107.97],
  ["ah-ctl-0151", "Kassenkunde", 17.3, 17.3, 0, 0, 0, 0],
  ["ah-ctl-0153", "Selbstzahler", 93.23, 99.76, 99.76, 82.32, 88.08, 88.08],
  ["ah-ctl-0155", "Kassenkunde", 0, 0, 0, 314.2, 314.2, 113.2],
  ["ah-ctl-0162", "Kassenkunde", 743.16, 743.16, 743.16, 975.83, 975.83, 975.83],
  ["ah-ctl-0164", "Kassenkunde", 0, 0, 0, 743.95, 743.95, 542.95],
  ["ah-ctl-0170", "Kassenkunde", 0, 0, 0, 128.67, 128.67, 0],
  ["ah-ctl-0177", "Kassenkunde", 0, 0, 0, 245.85, 245.85, 0],
  ["ah-ctl-0178", "Kassenkunde", 0, 0, 0, 64.53, 64.53, 0],
  ["ah-ctl-0179", "Kassenkunde", 0, 0, 0, 479.43, 479.43, 479.43],
  ["ah-ctl-0183", "Kassenkunde", 0, 0, 0, 151.32, 151.32, 0],
  ["ah-ctl-0189", "Kassenkunde", 0, 0, 0, 75.56, 75.56, 0],
  ["ah-ctl-0191", "Kassenkunde", 20.55, 20.55, 0, 51.64, 51.64, 0],
  ["ah-ctl-0193", "Kassenkunde", 885.75, 885.75, 635.75, 879.56, 879.56, 629.56],
  ["ah-ctl-0196", "Kassenkunde", 32.88, 32.88, 0, 73.84, 73.84, 0],
  ["ah-ctl-0200", "Kassenkunde", 88.55, 88.55, 88.55, 5.45, 5.45, 5.45],
  ["ah-ctl-0202", "Kassenkunde", 51.9, 51.9, 0, 58.45, 58.45, 0],
  ["ah-ctl-0206", "Selbstzahler", 145.57, 155.76, 155.76, 295.49, 316.17, 316.17],
  ["ah-ctl-0207", "Kassenkunde", 9.5, 9.5, 0, 15.22, 15.22, 0],
  ["ah-ctl-0211", "Kassenkunde", 7.66, 7.66, 0, 0, 0, 0],
  ["ah-ctl-0215", "Kassenkunde", 0, 0, 0, 109.36, 109.36, 0],
  ["ah-ctl-0216", "Kassenkunde", 124.65, 124.65, 124.65, 772.05, 772.05, 772.05],
  ["ah-ctl-0219", "Selbstzahler", 0, 0, 0, 273.26, 292.39, 292.39],
  ["ah-ctl-0222", "Kassenkunde", 122.88, 122.88, 0, 305.88, 305.88, 124.88],
  ["ah-ctl-0232", "Kassenkunde", 0, 0, 0, 2.91, 2.91, 0],
  ["ah-ctl-0238", "Kassenkunde", 0, 0, 0, 5.17, 5.17, 0],
  ["ah-ctl-0239", "Selbstzahler", 368.87, 394.69, 394.69, 8.76, 9.37, 9.37],
  ["ah-ctl-0242", "Kassenkunde", 192.42, 192.42, 11.42, 85.16, 85.16, 0],
  ["ah-ctl-0247", "Kassenkunde", 753.67, 753.67, 703.67, 42.49, 42.49, 0],
  ["ah-ctl-0248", "Kassenkunde", 74.97, 74.97, 0, 220.83, 220.83, 19.83],
  ["ah-ctl-0254", "Kassenkunde", 157.06, 157.06, 0, 153.74, 153.74, 0],
  ["ah-ctl-0256", "Kassenkunde", 87.52, 87.52, 0, 270.04, 270.04, 0],
  ["ah-ctl-0259", "Selbstzahler", 532.62, 569.9, 569.9, 589.3, 630.55, 630.55],
  ["ah-ctl-0279", "Selbstzahler", 0, 0, 0, 255.48, 273.36, 273.36],
  ["ah-ctl-0281", "Kassenkunde", 298.13, 298.13, 0, 731, 731, 405],
  ["ah-ctl-0284", "Kassenkunde", 0, 0, 0, 5.45, 5.45, 0],
  ["ah-ctl-0285", "Selbstzahler", 152.85, 163.55, 163.55, 68.12, 72.89, 72.89],
  ["ah-ctl-0288", "Selbstzahler", 0, 0, 0, 27.85, 29.8, 29.8],
  ["ah-ctl-0292", "Selbstzahler", 0, 0, 0, 124.33, 133.03, 133.03],
  ["ah-ctl-0300", "Kassenkunde", 107.27, 107.27, 27.27, 0, 0, 0],
  ["ah-ctl-0302", "Kassenkunde", 0, 0, 0, 310.18, 310.18, 0],
  ["ah-ctl-0311", "Kassenkunde", 0, 0, 0, 23.5, 23.5, 0],
  ["ah-ctl-0314", "Kassenkunde", 0, 0, 0, 327.42, 327.42, 277.42],
  ["ah-ctl-0316", "Kassenkunde", 560, 560, 229, 508.1, 508.1, 177.1],
  ["ah-ctl-0321", "Kassenkunde", 254.19, 254.19, 0, 533.84, 533.84, 252.84],
  ["ah-ctl-0323", "Kassenkunde", 78.94, 78.94, 0, 0, 0, 0],
  ["ah-ctl-0325", "Selbstzahler", 75.52, 80.81, 80.81, 73.77, 78.93, 78.93],
  ["ah-ctl-0337", "Selbstzahler", 179.28, 191.83, 191.83, 174.49, 186.7, 186.7],
  ["ah-ctl-0345", "Kassenkunde", 100.78, 100.78, 0, 0, 0, 0],
  ["ah-ctl-0347", "Kassenkunde", 6.92, 6.92, 0, 23.35, 23.35, 0],
  ["ah-ctl-0350", "Kassenkunde", 254.19, 254.19, 254.19, 0, 0, 0],
  ["ah-ctl-0351", "Selbstzahler", 177.5, 189.93, 189.93, 1032.2, 1104.45, 1104.45],
  ["ah-ctl-0355", "Selbstzahler", 0, 0, 0, 427.36, 457.28, 457.28],
  ["ah-ctl-0359", "Kassenkunde", 48.16, 48.16, 48.16, 107.83, 107.83, 107.83],
  ["ah-ctl-0360", "Selbstzahler", 350.36, 374.89, 374.89, 345.48, 369.66, 369.66],
  ["ah-ctl-0361", "Selbstzahler", 0, 0, 0, 208.78, 223.39, 223.39],
  ["ah-ctl-0367", "Kassenkunde", 195.8, 195.8, 195.8, 160.18, 160.18, 160.18],
  ["ah-ctl-0372", "Selbstzahler", 263.5, 281.95, 281.95, 136.4, 145.95, 145.95],
  ["ah-ctl-0376", "Selbstzahler", 34.48, 36.89, 36.89, 29.69, 31.77, 31.77],
  ["ah-ctl-0382", "Kassenkunde", 449.12, 449.12, 319.12, 436.74, 436.74, 306.74],
  ["ah-ctl-0383", "Kassenkunde", 0, 0, 0, 360.1, 360.1, 159.1],
];
/** the real draft whose time rows are nested inside the task objects (older format): the old
 *  reading prints 0 €, the screen (ADR 014) and now the new reading the real amount */
const NESTED_DRAFT = "ah-draft-91fcd12b";

describe("zone reading (ADR 028 addendum 2026-11-23)", () => {
  const totals = (c: (typeof cases)[number], reading: "document" | "screen") => { setConfig(c.config); return mine.ahTotalsOfPayload(c.payload, c.config, reading); };
  const fig = (t: any) => [t.net, t.gross, t.eigenanteil, t.payer];

  it("the default reading is the old one (already sent)", () => {
    for (const c of cases) {
      setConfig(c.config);
      expect(JSON.stringify(mine.buildAhOfferData(structuredClone(c.payload), H())), c.id).toBe(JSON.stringify(mine.buildAhOfferData(structuredClone(c.payload), H(), "document")));
    }
  });

  it("NEW: the documents' zone is the screen's zone for all 543", () => {
    for (const c of cases) {
      const z = ahScreenZone(c.payload);
      expect(ahDocTravel(c.payload, "screen"), c.id).toEqual({ zoneNum: z?.zone ?? 0, travelTimeH: z ? z.billMin / 60 : 0 });
      expect(ahInputFromPayload(c.payload, c.config).zone, c.id).toEqual(z);
    }
  });

  it("NEW: the document's net, gross and Eigenanteil equal the screen's for all 543", () => {
    const other: string[] = [];
    for (const c of cases) {
      const screen = ahOfferTotals(ahInputFromPayload(c.payload, c.config));
      const doc = totals(c, "screen");
      if (JSON.stringify(fig(doc)) !== JSON.stringify(fig(screen))) { other.push(c.id); continue; }
      expect(doc.detail, c.id).toEqual(screen.detail); // every row of the screen, too
      // the DOCX fields print the same figures
      const d = mine.buildAhOfferData(structuredClone(c.payload), H(), "screen");
      expect(d.AhGesamtNum, c.id).toBe(screen.net);
      expect(d.AhBetragNum, c.id).toBe(screen.customerAmount);
      if (screen.net > 0) expect(d.AhGesamtbetrag, c.id).toBe(tpl.fmtCurrency(screen.net));
      if (screen.payer === "Selbstzahler" && screen.net > 0) expect(d.AhBrutto, c.id).toBe(tpl.fmtCurrency(screen.gross));
      if (d.AhHasEigenanteil) expect(d.AhEigenanteilNum, c.id).toBe(screen.eigenanteil);
      expect(d.AhBitrix.gesamtpreisHnD, c.id).toBe(screen.detail.leistungenTotal);
      expect(d.AhBitrix.gesamtpreisAB, c.id).toBe(screen.detail.abLeistungenTotal);
    }
    expect(other).toEqual([]);
  });

  it("NEW: the nested-schedules draft prints its real amount", () => {
    const c = cases.find((x) => x.id === NESTED_DRAFT)!;
    setConfig(c.config);
    const sent = mine.buildAhOfferData(structuredClone(c.payload), H(), "document"), fresh = mine.buildAhOfferData(structuredClone(c.payload), H(), "screen");
    expect(sent.AhGesamtNum).toBe(0);
    expect(fresh.AhGesamtNum).toBe(183.72);
    expect(fresh.AhKondRows.length).toBeGreaterThan(1);
    expect(fresh.AhBitrix.monatlicherStundenumfang).toBeGreaterThan(0);
  });

  it("offers whose printed figures differ between the two readings: exactly the listed ones, with both numbers", () => {
    const differ: typeof OLD_VS_NEW = [];
    for (const c of cases) {
      const o = totals(c, "document"), n = totals(c, "screen");
      if (JSON.stringify(fig(o)) === JSON.stringify(fig(n))) continue;
      differ.push([c.id, o.payer, o.net, o.gross, o.eigenanteil, n.net, n.gross, n.eigenanteil]);
    }
    expect(differ).toEqual(OLD_VS_NEW);
    const real = differ.filter((r) => !r[0].startsWith("ah-ctl"));
    expect([differ.length, real.length]).toEqual([108, 24]);
    expect(real.filter((r) => r[1] === "Kassenkunde").length).toBe(18);
    expect(real.filter((r) => r[1] === "Selbstzahler").length).toBe(6);
    // the DOCX prints them so
    for (const [id, payer, , oldGross, , newNet, newGross] of OLD_VS_NEW) {
      const c = cases.find((x) => x.id === id)!;
      setConfig(c.config);
      const sent = mine.buildAhOfferData(structuredClone(c.payload), H(), "document"), fresh = mine.buildAhOfferData(structuredClone(c.payload), H(), "screen");
      expect(fresh.AhGesamtNum, id).toBe(newNet);
      if (payer === "Selbstzahler" && newNet > 0) expect(fresh.AhBrutto, id).toBe(tpl.fmtCurrency(newGross));
      if (payer === "Selbstzahler" && sent.AhGesamtNum > 0) expect(sent.AhBrutto, id).toBe(tpl.fmtCurrency(oldGross));
      expect(fresh.AhBitrix.zoneNum, id).toBe(ahScreenZone(c.payload)?.zone ?? 0);
    }
  });

});
