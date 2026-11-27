// The rules of the question about the deal's main contact (features/steps/kundendaten/main-contact.ts):
// when it is asked, how names are compared, what goes into the Ansprechpartner fields, what is sent.
import type { DealCustomer, DealCustomerResponse } from "@oc/api-contract";
import { describe, expect, it } from "vitest";
import { contactPersonChanges, isKept, keptOf, mainContactQuestion, normName, personOf, sameName } from "../src/features/steps/kundendaten/main-contact.js";

const CUSTOMER: DealCustomer = {
  bitrixContactId: "7001", customerNumber: "7001", salutation: "Herr", firstName: "Max", lastName: "Muster", company: "",
  email: "max@example.test", phone: "+49 9281 000001", street: "Probeweg 3", city: "Teststadt", postalCode: "95000", state: "Bayern", country: "",
};
const deal = (customer: DealCustomer | null = CUSTOMER, dealId = "4711"): DealCustomerResponse =>
  ({ dealId, dealTitle: "Badumbau Test", customer, vermieter: { erforderlich: null, liegtVor: null }, source: "batch", loadedAt: "2026-11-27T10:00:00.000Z" });
const KD = { firstName: "Erika", lastName: "Muster", bitrixContactId: "7001" };
const ask = (over: Partial<Parameters<typeof mainContactQuestion>[0]> = {}) => mainContactQuestion({ dealId: "4711", deal: deal(), kd: KD, kept: undefined, ...over });

describe("names: trim, case-fold, collapsed spaces; first and last name swapped count as the same", () => {
  it.each([
    [["Max", "Muster"], [" max ", "MUSTER"], true],
    [["Anna  Lena", "Muster"], ["anna lena", "muster"], true],
    [["Max", "Muster"], ["Muster", "Max"], true],
    [["Max", "Muster"], ["Erika", "Muster"], false],
    [["Max", "Muster"], ["Max", "Mustermann"], false],
    [["Max", "Muster"], ["Max Muster", ""], false],
  ] as const)("%j vs %j → %s", (a, b, same) => {
    expect(sameName({ firstName: a[0], lastName: a[1] }, { firstName: b[0], lastName: b[1] })).toBe(same);
  });
  it("normName", () => expect(normName("  Ännchen \t Müller ")).toBe("ännchen müller"));
});

describe("when the question is asked", () => {
  it("all conditions hold: both names, the contact id", () => {
    expect(ask()).toEqual({ contactId: "7001", bitrix: "Max Muster", offer: "Erika Muster", customer: CUSTOMER });
    expect(ask({ kd: { ...KD, bitrixContactId: "" } })?.contactId).toBe("7001"); // the offer names no contact
  });
  it.each([
    ["no deal number", { dealId: "" }],
    ["a temporary key", { dealId: "t-0123456789abcdef01234567" }],
    ["the deal's customer is not loaded", { deal: undefined }],
    ["the answer is of another deal", { deal: deal(CUSTOMER, "4712") }],
    ["the deal has no contact", { deal: deal(null) }],
    ["the offer names another contact", { kd: { ...KD, bitrixContactId: "7002" } }],
    ["first name empty", { kd: { ...KD, firstName: " " } }],
    ["last name empty", { kd: { ...KD, lastName: "" } }],
    ["the same name", { kd: { ...KD, firstName: "max", lastName: " Muster " } }],
    ["the same name, swapped", { kd: { ...KD, firstName: "Muster", lastName: "Max" } }],
    ["„Nicht ändern“ for this contact and name", { kept: { contactId: "7001", firstName: "erika", lastName: "Muster" } }],
  ] as const)("not asked: %s", (_n, over) => {
    expect(ask(over as never)).toBeNull();
  });
  it("„Nicht ändern“ counts for the same contact and the same typed name only", () => {
    const kept = keptOf("7001", { firstName: " Erika ", lastName: "Muster" });
    expect(kept).toEqual({ contactId: "7001", firstName: "Erika", lastName: "Muster" });
    expect(isKept(kept, "7001", { firstName: "Erika", lastName: "Muster" })).toBe(true);
    expect(ask({ kept, kd: { ...KD, firstName: "Erika Maria" } })).not.toBeNull(); // another name typed
    expect(ask({ kept: { ...kept, contactId: "7009" } })).not.toBeNull(); // another contact
    expect(isKept(null, "7001", KD)).toBe(false);
  });
});

describe("„Andere Person“: the Bitrix contact goes into the EMPTY Ansprechpartner fields", () => {
  it("all empty: every field", () => {
    expect(contactPersonChanges({}, CUSTOMER)).toEqual({
      hasContactPerson: "Ja", cp_salutation: "Herr", cp_name: "Max Muster", cp_phone: "+49 9281 000001", cp_email: "max@example.test",
      cp_street: "Probeweg 3", cp_postalCode: "95000", cp_city: "Teststadt", cp_state: "Bayern",
    });
  });
  it("typed fields stay; empty values of the contact are not written; Familie is no contact person salutation", () => {
    expect(contactPersonChanges({ hasContactPerson: "Ja", cp_name: "Max M.", cp_phone: "0170 1", cp_city: " " }, { ...CUSTOMER, salutation: "Familie", email: "", state: "" }))
      .toEqual({ cp_street: "Probeweg 3", cp_postalCode: "95000", cp_city: "Teststadt" });
  });
  it("the person sent: the insured person as typed, empty fields left out", () => {
    expect(personOf({ salutation: "Frau", firstName: " Erika ", lastName: "Muster", street: "Probeweg 3", postalCode: "95000", city: "", phone: "+49 9281 000001", email: "", cp_name: "x" }))
      .toEqual({ salutation: "Frau", firstName: "Erika", lastName: "Muster", street: "Probeweg 3", postalCode: "95000", phone: "+49 9281 000001" });
  });
});
