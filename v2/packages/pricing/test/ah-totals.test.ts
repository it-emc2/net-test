// ADR 028 — ahOfferTotals: the one AH total of screen, documents, signing page, send record and
// Bitrix. computeAhPricing (golden master, ah.test.ts) is untouched; these tests pin the new rules.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ahDocHours, ahDocumentInput, ahOfferTotals, computeAhPricing, isAhSelbstzahler, type AhPricingInput } from "../src/index.js";

const CONFIG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };
const HND = (dauer = "2:00", regelmaessigkeit = "Wöchentlich") => ({ type: "Haushaltsnahedienstleistungen", schedules: [{ dauer, regelmaessigkeit }], tasks: [] });
const AB = (dauer = "1:00", regelmaessigkeit = "14-tägig", combinedVisit = false) => ({ type: "Alltagsbegleitung", schedules: [{ dauer, regelmaessigkeit }], tasks: [], combinedVisit });
const input = (p: Partial<AhPricingInput> = {}): AhPricingInput => ({
  services: [HND()], zone: { zone: 2, billMin: 20 }, payer: "Kassenkunde", entlastungsbetragNutzen: false, zweiPersonen: false,
  verhinderungspflegeMonat: 0, umwidmungBeantragt: false, umwidmungBetrag: 0, config: CONFIG, ...p,
});
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe("ahOfferTotals — Selbstzahler (owner decision 3)", () => {
  it("net + 7 % MwSt = gross; the Servicepauschale is a note, not in the total", () => {
    const legacy = computeAhPricing(input({ payer: "Selbstzahler" }));
    const t = ahOfferTotals(input({ payer: "Selbstzahler" }));
    expect(legacy.gesamt).toBe(r2(legacy.allBase + 1.2)); // today's screen: + 1,20 €, no VAT
    expect(t.net).toBe(legacy.allBase);
    expect(t.vatRate).toBe(0.07);
    expect(t.vat).toBe(r2(t.net * 0.07));
    expect(t.gross).toBe(r2(t.net + t.vat));
    expect(t.amountToPay).toBe(t.gross);
    expect(t.customerAmount).toBe(t.gross);
    expect(t.eigenanteil).toBe(t.gross);
    expect(t.servicepauschaleNote).toEqual({ show: true, amount: 1.2 });
    expect(t.deductions).toEqual({ entlastungsbetrag: 0, verhinderungspflege: 0, umwidmung: 0, total: 0 });
    expect(t.steuerabsetzJahr).toBe(0);
  });
  it("funding ticks are ignored for a Selbstzahler", () => {
    const t = ahOfferTotals(input({ payer: "Selbstzahler", entlastungsbetragNutzen: true, verhinderungspflegeMonat: 100, umwidmungBeantragt: true, umwidmungBetrag: 50 }));
    expect(t.deductions.total).toBe(0);
    expect(t.amountToPay).toBe(t.gross);
  });
  it("only Alltagsbegleitung: no Servicepauschale note", () => {
    expect(ahOfferTotals(input({ payer: "Selbstzahler", services: [AB()] })).servicepauschaleNote.show).toBe(false);
  });
  it.each([["selbstzahler", true], [" SELBSTZAHLER ", true], ["Kassenkunde", false], ["", false], [undefined, false], ["Privat", false]])("isAhSelbstzahler(%j) = %s", (p, v) => expect(isAhSelbstzahler(p)).toBe(v));
  // rounding as the DOCX: vat = r2(net · 0.07), gross = r2(net + vat) — half-cent cases
  it.each([[0.5, 0.04, 0.54], [7.5, 0.53, 8.03], [12.5, 0.88, 13.38], [100.07, 7, 107.07], [163.72, 11.46, 175.18], [705.9, 49.41, 755.31]])("net %d → vat %d, gross %d", (net, vat, gross) => {
    expect(r2(net * 0.07)).toBe(vat);
    expect(r2(net + vat)).toBe(gross);
  });
  it("rounding of a real priced case", () => {
    const t = ahOfferTotals(input({ payer: "Selbstzahler", services: [HND("1:45", "14-tägig")], zone: { zone: 3, billMin: 30 } }));
    expect(t.vat).toBe(r2(t.net * 0.07));
    expect(t.gross).toBe(r2(t.net + t.vat));
  });
});

describe("ahOfferTotals — Kassenkunde and no payer (owner decision 2)", () => {
  it("empty payer = Kassenkunde", () => {
    const a = ahOfferTotals(input({ payer: "", entlastungsbetragNutzen: true }));
    const b = ahOfferTotals(input({ payer: "Kassenkunde", entlastungsbetragNutzen: true }));
    expect(a).toEqual(b);
    expect(a.payer).toBe("Kassenkunde");
  });
  it("no VAT; customer amount = net; amount to pay = Eigenanteil", () => {
    const t = ahOfferTotals(input({ entlastungsbetragNutzen: true }));
    expect(t.vat).toBe(0);
    expect(t.gross).toBe(t.net);
    expect(t.customerAmount).toBe(t.net);
    expect(t.amountToPay).toBe(t.eigenanteil);
    expect(t.eigenanteil).toBe(r2(Math.max(0, t.net - 131)));
    expect(t.servicepauschaleNote.show).toBe(true);
  });
  it.each([
    ["Entlastungsbetrag", { entlastungsbetragNutzen: true }, { entlastungsbetrag: 131, verhinderungspflege: 0, umwidmung: 0, total: 131 }],
    ["2 Personen", { entlastungsbetragNutzen: true, zweiPersonen: true }, { entlastungsbetrag: 262, verhinderungspflege: 0, umwidmung: 0, total: 262 }],
    ["2 Personen without the tick", { zweiPersonen: true }, { entlastungsbetrag: 0, verhinderungspflege: 0, umwidmung: 0, total: 0 }],
    ["Verhinderungspflege", { verhinderungspflegeMonat: 201.5 }, { entlastungsbetrag: 0, verhinderungspflege: 201.5, umwidmung: 0, total: 201.5 }],
    ["Umwidmung", { umwidmungBeantragt: true, umwidmungBetrag: 87.35 }, { entlastungsbetrag: 0, verhinderungspflege: 0, umwidmung: 87.35, total: 87.35 }],
    ["Umwidmung amount without the tick", { umwidmungBetrag: 87.35 }, { entlastungsbetrag: 0, verhinderungspflege: 0, umwidmung: 0, total: 0 }],
    ["all three", { entlastungsbetragNutzen: true, verhinderungspflegeMonat: 50, umwidmungBeantragt: true, umwidmungBetrag: 30 }, { entlastungsbetrag: 131, verhinderungspflege: 50, umwidmung: 30, total: 211 }],
  ] as const)("%s", (_n, p, ded) => {
    const t = ahOfferTotals(input({ services: [HND("4:00")], ...p }));
    expect(t.deductions).toEqual(ded);
    expect(t.eigenanteil).toBe(r2(Math.max(0, t.net - ded.total)));
    expect(t.steuerabsetzJahr).toBe(r2(Math.min(4000, t.eigenanteil * 12 * 0.2)));
  });
  it("deductions above the total: Eigenanteil 0, deductions not capped (the DOCX prints them so)", () => {
    const t = ahOfferTotals(input({ services: [HND("0:30", "Monatlich")], entlastungsbetragNutzen: true, verhinderungspflegeMonat: 200 }));
    expect(t.net).toBeLessThan(331);
    expect(t.deductions.total).toBe(331);
    expect(t.eigenanteil).toBe(0);
    expect(t.amountToPay).toBe(0);
  });
  it("two services and a combined visit", () => {
    const sep = ahOfferTotals(input({ services: [HND(), AB("1:00", "Wöchentlich")] }));
    const comb = ahOfferTotals(input({ services: [HND(), AB("1:00", "Wöchentlich", true)] }));
    expect(comb.net).toBeLessThan(sep.net);
    expect(comb.detail.abSharedEinsaetze).toBeGreaterThan(0);
  });
});

describe("screen unchanged for a Kassenkunde: golden master cases", () => {
  const file = fileURLToPath(new URL("../../../../tests/golden/fixtures/ah/controlled.json", import.meta.url));
  const cases: Array<{ id: string; input: AhPricingInput }> = JSON.parse(readFileSync(file, "utf8"));
  const notSz = cases.filter((c) => !isAhSelbstzahler(c.input.payer));
  it("covers the non-Selbstzahler cases", () => expect(notSz.length).toBe(293));
  it.each(notSz.map((c) => [c.id, c] as const))("%s: total and Eigenanteil as computeAhPricing", (_id, c) => {
    const legacy = computeAhPricing(structuredClone(c.input));
    const t = ahOfferTotals(structuredClone(c.input));
    expect(t.net).toBe(legacy.gesamt);
    expect(t.eigenanteil).toBe(legacy.eigenanteil);
    expect(t.steuerabsetzJahr).toBe(legacy.steuerabsetzJahr);
  });
  it.each(cases.filter((c) => isAhSelbstzahler(c.input.payer)).map((c) => [c.id, c] as const))("%s: Selbstzahler net = legacy allBase", (_id, c) => {
    expect(ahOfferTotals(structuredClone(c.input)).net).toBe(computeAhPricing(structuredClone(c.input)).allBase);
  });
});

describe("ahDocumentInput — the documents' reading of a stored offer", () => {
  it.each([["1:30", 1.5], ["1:5", 1 + 5 / 60], ["1.5", 1.5], ["", 0], ["abc", 0]] as const)("hours(%j) = %d", (s, h) => expect(ahDocHours(s)).toBe(h));
  it("saved zone first; travel time only without one; services HnD first; Kassenkunde without payer", () => {
    const payload = {
      ah: { services: [AB(), HND()] }, Arbeitszeit: { ahTravelZone: "3", travelTimeHHMM: "0:11" }, Kundendaten: { payer: "" },
      Finanzierung: { ahEntlastungsbetragNutzen: "on", ahVerhinderungspflegeMonat: "20", ahUmwidmungBetrag: "" },
    };
    const i = ahDocumentInput(payload, CONFIG);
    expect(i.zone).toEqual({ zone: 3, billMin: 30 });
    expect(i.services.map((s) => s.type)).toEqual(["Haushaltsnahedienstleistungen", "Alltagsbegleitung"]);
    expect(i.entlastungsbetragNutzen).toBe(true);
    expect(i.verhinderungspflegeMonat).toBe(20);
    expect(ahOfferTotals(i).payer).toBe("Kassenkunde");
    const noZone = ahDocumentInput({ ...payload, Arbeitszeit: { travelTimeHHMM: "0:14" } }, CONFIG);
    expect(noZone.zone!.billMin).toBeCloseTo(14, 10);
  });
});
