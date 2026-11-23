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
 *  (not sent before): [id, payer, old net, old gross, new net, new gross] — all real offers whose
 *  saved zone does not match their travel time, or whose zone was never saved (ah-offer-4cfe26f6:
 *  travel 0:14 billed unrounded by the old reading, zone 2 = 20 min by the screen) */
const OLD_VS_NEW: [string, string, number, number, number, number][] = [
  ["ah-offer-1a777cfd", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-offer-1a777cf3", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-offer-1a72ba4c", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-offer-d626eb5f", "Kassenkunde", 163.72, 163.72, 134.42, 134.42],
  ["ah-offer-d626aa66", "Kassenkunde", 141.75, 141.75, 127.1, 127.1],
  ["ah-offer-d6267cc6", "Kassenkunde", 149.07, 149.07, 134.42, 134.42],
  ["ah-offer-114edbbf", "Selbstzahler", 178.36, 190.85, 163.72, 175.18],
  ["ah-offer-114edbbe", "Selbstzahler", 178.36, 190.85, 163.72, 175.18],
  ["ah-offer-114d7198", "Selbstzahler", 788.14, 843.31, 705.9, 755.31],
  ["ah-offer-4cff44ff", "Selbstzahler", 178.36, 190.85, 163.72, 175.18],
  ["ah-offer-4cfe26f6", "Selbstzahler", 192.23, 205.69, 197.64, 211.47],
  ["ah-draft-35f7f748", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-b0df503c", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-35f7f73c", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-b0df4edc", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-35f7f6ac", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-3d03430b", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-1b447064", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-1b44704a", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-3d034302", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-3d0342fe", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-3d0342f9", "Kassenkunde", 127.1, 127.1, 112.45, 112.45],
  ["ah-draft-545af54b", "Kassenkunde", 141.75, 141.75, 127.1, 127.1],
];
/** offers whose screen total differs from the documents' for reasons OTHER than the zone (the
 *  services: ah.services vs ahServicesJson, older nested schedules, synthetic shapes) — 84
 *  controlled cases + one real draft (ah-draft-91fcd12b: schedules nested in tasks; the documents
 *  print 0, the screen lifts them, ADR 014). Unchanged by the zone decision. */
const SERVICES_READING_DIFFERS = 85;

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

  it("NEW: the document's net, gross and Eigenanteil equal the screen's (all 543 but the services-reading cases)", () => {
    const other: string[] = [];
    for (const c of cases) {
      const screen = ahOfferTotals(ahInputFromPayload(c.payload, c.config));
      const doc = totals(c, "screen");
      if (JSON.stringify(fig(doc)) !== JSON.stringify(fig(screen))) { other.push(c.id); continue; }
      // the DOCX fields print the same figures
      const d = mine.buildAhOfferData(structuredClone(c.payload), H(), "screen");
      expect(d.AhGesamtNum, c.id).toBe(screen.net);
      expect(d.AhBetragNum, c.id).toBe(screen.customerAmount);
      if (screen.payer === "Selbstzahler" && screen.net > 0) expect(d.AhBrutto, c.id).toBe(tpl.fmtCurrency(screen.gross));
      if (d.AhHasEigenanteil) expect(d.AhEigenanteilNum, c.id).toBe(screen.eigenanteil);
    }
    expect(other.length).toBe(SERVICES_READING_DIFFERS);
    expect(other.filter((id) => !id.startsWith("ah-ctl"))).toEqual(["ah-draft-91fcd12b"]);
    // ... and for those the zone is not the reason: with the old and the new zone they differ alike
    for (const id of other) expect(OLD_VS_NEW.some((r) => r[0] === id), id).toBe(false);
  });

  it("offers whose printed figures differ between the two readings: exactly the listed ones, with both numbers", () => {
    const differ: [string, string, number, number, number, number][] = [];
    for (const c of cases) {
      const o = totals(c, "document"), n = totals(c, "screen");
      if (JSON.stringify(fig(o)) === JSON.stringify(fig(n))) continue;
      differ.push([c.id, o.payer, o.net, o.gross, n.net, n.gross]);
    }
    expect(differ).toEqual(OLD_VS_NEW);
    expect(differ.length).toBe(23);
    expect(differ.filter((r) => r[1] === "Kassenkunde").length).toBe(18);
    expect(differ.filter((r) => r[1] === "Selbstzahler").length).toBe(5);
    // the DOCX prints them so
    for (const [id, payer, , oldGross, newNet, newGross] of OLD_VS_NEW) {
      const c = cases.find((x) => x.id === id)!;
      setConfig(c.config);
      const sent = mine.buildAhOfferData(structuredClone(c.payload), H(), "document"), fresh = mine.buildAhOfferData(structuredClone(c.payload), H(), "screen");
      expect(fresh.AhGesamtbetrag, id).toBe(tpl.fmtCurrency(newNet));
      expect(sent.AhGesamtbetrag, id).not.toBe(fresh.AhGesamtbetrag);
      if (payer === "Selbstzahler") { expect(sent.AhBrutto).toBe(tpl.fmtCurrency(oldGross)); expect(fresh.AhBrutto).toBe(tpl.fmtCurrency(newGross)); }
      expect(fresh.AhBitrix.zoneNum, id).toBe(ahScreenZone(c.payload)?.zone ?? 0);
    }
  });
});
