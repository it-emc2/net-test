// Domain rules checked against the anonymised REAL payloads of the pricing golden master
// (tests/golden/fixtures/pricing/cases.json) and against the legacy JS implementations.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isClientPricedOffer,
  isKassenkundeForDocuments,
  looseBool,
  looseNumber,
  offerTypeForDocuments,
  offerTypeForPricing,
  payerForLabourRate,
  readPayload,
} from "../src/index.js";

const FIXTURES = fileURLToPath(new URL("../../../../tests/golden/fixtures/pricing/cases.json", import.meta.url));
type Case = { id: string; offerType: string; payload: Record<string, unknown>; expected: Record<string, unknown> };
const cases: Case[] = JSON.parse(readFileSync(FIXTURES, "utf8"));

describe("real payloads (golden fixtures)", () => {
  it("has fixtures", () => expect(cases.length).toBeGreaterThan(100));

  it.each(cases.map((c) => [c.id, c] as const))("%s parses losslessly", (_id, c) => {
    const r = readPayload(c.payload);
    expect(r.success).toBe(true);
    // lossless: unknown keys survive, nothing coerced
    expect(r.success && r.data).toEqual(c.payload);
  });

  it("client-priced detection matches the engine's empty shell (ah/hms/wd)", () => {
    for (const c of cases) {
      const shell = c.expected.total === 0 && Array.isArray((c.expected.materials as { lines?: unknown[] })?.lines)
        && ((c.expected.materials as { lines: unknown[] }).lines.length === 0);
      if (isClientPricedOffer(c.payload)) expect(shell, c.id).toBe(true);
    }
  });

  it("pricing view equals the fixture's declared offer type for priced types", () => {
    for (const c of cases) {
      if (["bu", "bwt", "hl", "bl"].includes(c.offerType) && c.payload.activeOffer) {
        expect(offerTypeForPricing(c.payload), c.id).toBe(c.payload.activeOffer);
      }
    }
  });
});

describe("offer-type resolvers keep legacy differences", () => {
  it("pricing: only exact lowercase activeOffer, else bu", () => {
    expect(offerTypeForPricing({ activeOffer: "bwt" })).toBe("bwt");
    expect(offerTypeForPricing({ activeOffer: "BWT" })).toBe("bu");
    expect(offerTypeForPricing({ currentOfferKey: "hl" })).toBe("bu");
    expect(offerTypeForPricing(null)).toBe("bu");
  });

  it("client-priced: case-insensitive chain", () => {
    expect(isClientPricedOffer({ currentOfferKey: "AH" })).toBe(true);
    expect(isClientPricedOffer({ offerType: "wd" })).toBe(true);
    expect(isClientPricedOffer({ activeOffer: "bu", offerType: "ah" })).toBe(false);
  });

  it("documents: chain over body, payload, pricePreview; raw value", () => {
    expect(offerTypeForDocuments({ payload: { currentOfferKey: "hl" } })).toBe("hl");
    expect(offerTypeForDocuments({ pricePreview: { offerType: "BWT" } })).toBe("BWT");
    expect(offerTypeForDocuments({})).toBe("bu");
  });
});

describe("payer rules", () => {
  it("labour rate: exact German words only", () => {
    expect(payerForLabourRate({ payer: "Kassenkunde" })).toBe("KK");
    expect(payerForLabourRate({ payer: "Selbstzahler" })).toBe("SZ");
    expect(payerForLabourRate({ payer: "KK" })).toBe("");
  });
  it("documents: KK / KASSENKUNDE in services or Kundendaten", () => {
    expect(isKassenkundeForDocuments({ Kundendaten: { payer: "kk" } })).toBe(true);
    expect(isKassenkundeForDocuments({ services: { payer: "Kassenkunde" } })).toBe(true);
    expect(isKassenkundeForDocuments({ Kundendaten: { payer: "Selbstzahler" } })).toBe(false);
  });
});

describe("loose scalars", () => {
  it.each([["on", true], ["ja", true], ["", false], ["off", false], [1, true], [false, false]])("bool %j", (v, b) =>
    expect(looseBool(v)).toBe(b));
  it.each([["8", 8], ["12,5", 12.5], ["", 0], ["abc", 0], [3, 3], [null, 0]])("number %j", (v, n) =>
    expect(looseNumber(v)).toBe(n));
});

// ---- the typed offer (ADR 026) ----
import { NEW_OFFER_TYPES, emptyOffer, isNewOfferType, withSection, type BuOffer } from "../src/index.js";

describe("emptyOffer — what today's UI stores for a new offer", () => {
  const ctx = { date: "2026-11-12", ansprechpartner: "ap@example.test", contactName: "AP", signatureUser: "ap", pricingRules: { bonusNeuGross: 250 } };

  it.each(NEW_OFFER_TYPES.map((t) => [t] as const))("%s: has its own type, the context values, and parses losslessly", (type) => {
    const o = emptyOffer(type, ctx);
    expect(o.activeOffer).toBe(type);
    expect(offerTypeForPricing(o)).toBe(type);
    expect(o.Kundendaten.date).toBe("2026-11-12");
    expect(o.Kundendaten.ansprechpartner).toBe("ap@example.test");
    expect(o.Kundendaten.emc2_contact).toBe("AP");
    expect(o.ourSignatureUser).toBe("ap");
    expect(o.pricingRules).toEqual({ bonusNeuGross: 250 });
    const r = readPayload(o);
    expect(r.success && r.data).toEqual(o);
  });

  it("the stored defaults carry nothing that depends on the day, the user or the settings", () => {
    for (const type of NEW_OFFER_TYPES) {
      const o: any = emptyOffer(type, { date: "" });
      expect([o.Kundendaten.date, o.Kundendaten.ansprechpartner, o.Kundendaten.emc2_contact, o.ourSignatureUser, o.offerNumber, o.auftragId]).toEqual(["", "", "", "", "", ""]);
      expect(o.pricingRules).toEqual({});
      expect([o.mail.body, o.mail.subject]).toEqual(["", ""]);
      expect(JSON.stringify(o)).not.toMatch(/@|ANG20\d\d/); // no address, no offer number
    }
  });

  it("every call returns its own copy — a new offer is one assignment, nothing leaks from the last one", () => {
    const a = emptyOffer("bu", ctx);
    a.Kundendaten.firstName = "Erika";
    a.optional.qty_TEST = "3";
    (a.Arbeitszeit.autoSuggestedTasks as unknown[]).push({ key: "x" });
    const b = emptyOffer("bu", ctx);
    expect(b.Kundendaten.firstName).toBe("");
    expect(b.optional.qty_TEST).toBeUndefined();
    expect(b.Arbeitszeit.autoSuggestedTasks).toEqual([]);
  });

  it("withSection replaces fields of one section and leaves the original untouched", () => {
    const a: BuOffer = emptyOffer("bu", ctx);
    const b = withSection(a, "Kundendaten", { firstName: "Erika", payer: "Selbstzahler" });
    expect([b.Kundendaten.firstName, b.Kundendaten.payer, b.Kundendaten.date]).toEqual(["Erika", "Selbstzahler", "2026-11-12"]);
    expect(a.Kundendaten.firstName).toBe("");
    expect(b.duschwanne).toBe(a.duschwanne); // untouched sections are shared, not copied
  });

  it("isNewOfferType: the five types of the new UI, not HMS/WD", () => {
    expect(NEW_OFFER_TYPES.every(isNewOfferType)).toBe(true);
    expect([isNewOfferType("hms"), isNewOfferType("wd"), isNewOfferType("BU"), isNewOfferType(null)]).toEqual([false, false, false, false]);
  });
});

describe("a new offer from this one (Neue Version / Variante, ADR 027 A)", () => {
  it("one rule: date and contact anew, not sent; a variant also drops the number; nothing else changes", async () => {
    const { newOfferPatch, variantCopyPayload } = await import("../src/index.js");
    expect(newOfferPatch("2026-11-19", { ansprechpartner: "ao@test.local" })).toEqual({ Kundendaten: { date: "2026-11-19", ansprechpartner: "ao@test.local" }, zusammenfassung: { versand: undefined } });
    const src = { offerNumber: "ANG2026-1119-100000", auftragId: "4711", Kundendaten: { lastName: "Muster", date: "2026-01-01" }, zusammenfassung: { versand: "x", a: 1 }, b: [1] };
    expect(variantCopyPayload(src, "2026-11-19")).toEqual({ auftragId: "4711", Kundendaten: { lastName: "Muster", date: "2026-11-19" }, zusammenfassung: { a: 1 }, b: [1] });
    expect(src.offerNumber).toBe("ANG2026-1119-100000");
  });
});


describe("customer data (ADR 027 B: one rule for web and server)", () => {
  it("applyChanges merges per section like the web store's patchAll; dealNumberTop sets all three places", async () => {
    const { applyChanges, dealNumberTop, emptyOffer, restoreChanges } = await import("../src/index.js");
    const o = { Kundendaten: { a: 1, b: 2 }, mail: { to: "x" } } as Record<string, any>;
    expect(applyChanges(o, { Kundendaten: { b: undefined, c: 3 }, postal: { z: 1 } })).toEqual({ Kundendaten: { a: 1, c: 3 }, mail: { to: "x" }, postal: { z: 1 } });
    expect(o).toEqual({ Kundendaten: { a: 1, b: 2 }, mail: { to: "x" } }); // not changed
    expect(dealNumberTop(o, "4711")).toEqual({ auftragId: "4711", mail: { to: "x", auftragId: "4711" }, postal: { auftragId: "4711" } });
    const e = emptyOffer("ah", { date: "2026-11-20" }) as Record<string, any>;
    const ch = restoreChanges(e, { firstName: "Erika", lastName: "Muster", email: "kunde@example.test", wohnumfeldDone: "Ja" }, "ah");
    expect(ch.Kundendaten).toMatchObject({ firstName: "Erika", lastName: "Muster", email: "kunde@example.test", wohnumfeldDone: undefined });
    expect(ch.mail).toEqual({ to: "kunde@example.test" });
  });

  it("Alltagshilfe: second person and note chips are restored, the preparation ticks are not (U-052)", async () => {
    const { applyChanges, emptyOffer, hintChoice, restoreChanges } = await import("../src/index.js");
    const src = { ahZweiPersonen: "on", p2Salutation: "Herr", p2FirstName: "Max", p2LastName: "Muster", p2Pflegegrad: "beantragt", prep_visitenkarten: "Ja",
      ah_mobilitaet_choice: "Ja", ah_mobilitaet: "Rollator", ah_demenz: "Nein", ah_sprache: "Polnisch", ah_haustiere: "Ja" };
    const e = emptyOffer("ah", { date: "2026-11-23" }) as Record<string, any>;
    const kd = applyChanges(e, restoreChanges(e, src, "ah")).Kundendaten as Record<string, unknown>;
    expect(kd).toMatchObject({ ahZweiPersonen: "on", p2Salutation: "Herr", p2FirstName: "Max", p2LastName: "Muster", p2Pflegegrad: "beantragt",
      ah_mobilitaet_choice: "Ja", ah_mobilitaet: "Rollator", ah_demenz_choice: "Nein", ah_sprache_choice: "Sonstiges", ah_haustiere: "Ja" });
    expect("prep_visitenkarten" in kd).toBe(false);
    const bu = emptyOffer("bu", { date: "2026-11-23" }) as Record<string, any>;
    expect("ahZweiPersonen" in restoreChanges(bu, src, "bu").Kundendaten!).toBe(false);
    // the chip: today's rule from the text, the stored chip where the text cannot say it
    const c = (choice: string | undefined, text: string) => hintChoice({ x_choice: choice, x: text }, "x");
    expect([c(undefined, "Ja"), c(undefined, "Nein"), c(undefined, "Gehstock"), c(undefined, ""), c("Ja", "Rollator"), c("Sonstiges", "Ja"), c("Sonstiges", ""), c("Nein", ""), c("x", "")])
      .toEqual(["Ja", "Nein", "Sonstiges", "", "Ja", "Sonstiges", "Sonstiges", "Nein", ""]);
  });
});
