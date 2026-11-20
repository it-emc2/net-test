// B3 (UX-CHANGES U-047): Kundendaten asks first and shows the follow-up fields only when the answer
// makes them necessary. Display only — what is stored never depends on what is shown.
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const group = (name: string) => screen.getByRole("group", { name });
const pick = async (name: string, value: string) => userEvent.click(Array.from(group(name).querySelectorAll("input")).find((i) => i.value === value)!);
const typeInto = async (label: string, text: string) => { const el = screen.getByLabelText(label, { exact: true }); await userEvent.clear(el); await userEvent.type(el, text); };
const has = (label: string) => !!screen.queryByLabelText(label, { exact: true });
const hasGroup = (name: string) => !!screen.queryByRole("group", { name });
const snapshot = () => JSON.stringify(offer());

async function open(type: string, change?: (kd: Record<string, any>) => void) {
  const o = emptyOffer(type as never, { date: "2026-11-12" }) as Record<string, any>;
  change?.(o.Kundendaten);
  fakeServer({ ...BASE, [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: type, payload: o, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } } });
  renderApp(`/deal/${KEY}/${type}/Kundendaten`);
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
}
/** the same answers given straight to the store, without the page: what the page must end up storing */
const direct = (fn: (patch: (fields: Record<string, unknown>) => void) => void) => fn((fields) => useOfferStore.getState().patch("Kundendaten" as never, fields as never));

const CARE = "Kunde hat Pflegegrad?";
const INSURANCE = ["Name der Krankenkasse", "Adresse der Krankenkasse", "Pflegegrad seit", "Geburtsdatum", "Versicherungsnummer"];

describe("B3 — Pflegegrad: the insurance block", () => {
  it("is on the page after Ja only; the Rechnungskopie question stays with the payer", async () => {
    await open("bwt");
    expect(INSURANCE.some(has)).toBe(false);
    expect(hasGroup("Kassen-Rechnungskopie gewünscht?")).toBe(true);
    await pick(CARE, "Ja");
    expect(INSURANCE.every(has)).toBe(true);
    await pick(CARE, "Nein");
    expect(INSURANCE.some(has)).toBe(false);
  });
  it("Badumbau asks neither birth date nor insurance number (as before)", async () => {
    await open("bu");
    await pick(CARE, "Ja");
    expect(["Name der Krankenkasse", "Geburtsdatum", "Versicherungsnummer"].map(has)).toEqual([true, false, false]);
  });
  it("yes → type → no → yes: the value is still there, and the stored offer is what the same answers give without the page", async () => {
    await open("bwt");
    await pick(CARE, "Ja");
    await typeInto("Name der Krankenkasse", "AOK Test");
    await pick(CARE, "Nein");
    expect(offer().Kundendaten.kassenkundeName).toBe("AOK Test");
    await pick(CARE, "Ja");
    expect((screen.getByLabelText("Name der Krankenkasse") as HTMLInputElement).value).toBe("AOK Test");
    const viaPage = snapshot();
    cleanup();
    await open("bwt");
    const { chooseHasCareLevel } = await import("../src/features/steps/kundendaten/care.js");
    direct((p) => { p({ ...chooseHasCareLevel(offer().Kundendaten, "Ja") }); p({ kassenkundeName: "AOK Test" }); p({ ...chooseHasCareLevel(offer().Kundendaten, "Nein") }); p({ ...chooseHasCareLevel(offer().Kundendaten, "Ja") }); });
    expect(snapshot()).toBe(viaPage);
  });
  it("an offer that holds insurance entries shows the block although the answer says no — until the user answers", async () => {
    await open("bwt", (kd) => { kd.hasPflegegrad = "Nein"; kd.kassenkundeName = "AOK Alt"; });
    expect((screen.getByLabelText("Name der Krankenkasse") as HTMLInputElement).value).toBe("AOK Alt");
    await pick(CARE, "Ja");
    await pick(CARE, "Nein"); // answered by hand on this page: hidden again, entries kept
    expect(has("Name der Krankenkasse")).toBe(false);
    expect(offer().Kundendaten.kassenkundeName).toBe("AOK Alt");
  });
  it("a Selbstzahler gets none of it (the care question is not asked either)", async () => {
    await open("bwt");
    await pick("Ist der Kunde Selbstzahler oder Kassenkunde?", "Selbstzahler");
    expect(hasGroup(CARE) || INSURANCE.some(has)).toBe(false);
  });
});

describe("B3 — Wohnsituation: the landlord", () => {
  const LIVING = "Angabe zur Wohnsituation", NEEDED = "Genehmigung des Vermieters erforderlich?", HERE = "Genehmigung des Vermieters liegt vor?";
  it("Miete: both questions; Eigentum: none (the answer „erforderlich“ is Nein by itself)", async () => {
    await open("bu");
    expect([hasGroup(NEEDED), hasGroup(HERE)]).toEqual([true, false]); // not answered yet: "Weiter" asks for it
    await pick(LIVING, "Miete");
    expect([hasGroup(NEEDED), hasGroup(HERE)]).toEqual([true, true]);
    await pick(LIVING, "Eigentum");
    expect([hasGroup(NEEDED), hasGroup(HERE), offer().Kundendaten.vermieterGenehmigungErforderlich]).toEqual([false, false, "Nein"]);
  });
  it("a manual „Ja“ for an own home keeps the question on the page", async () => {
    await open("bu", (kd) => { kd.wohnsituation = "Eigentum"; kd.vermieterGenehmigungErforderlich = "Ja"; });
    expect(hasGroup(NEEDED)).toBe(true);
  });
  it("Miete → answer → Eigentum → Miete stores what it stored before", async () => {
    await open("bu");
    await pick(LIVING, "Miete"); await pick(HERE, "Ja"); await pick(LIVING, "Eigentum"); await pick(LIVING, "Miete");
    const viaPage = snapshot();
    cleanup();
    await open("bu");
    const { chooseLivingSituation } = await import("../src/features/steps/kundendaten/object.js");
    direct((p) => { p(chooseLivingSituation("Miete")); p({ vermieterGenehmigung: "Ja" }); p(chooseLivingSituation("Eigentum")); p(chooseLivingSituation("Miete")); });
    expect(snapshot()).toBe(viaPage);
  });
  it("a stored answer of the landlord is shown although the home is not marked as rented", async () => {
    await open("bwt", (kd) => { kd.wohnsituation = "Eigentum"; kd.vermieterGenehmigung = "Ja"; });
    expect(hasGroup(HERE)).toBe(true);
  });
});

describe("B3 — Ansprechpartner", () => {
  const ASK = "Ansprechpartner vorhanden?";
  it("no → no fields; yes → fields; yes → type → no → yes: still there; stored as the rules say", async () => {
    await open("bu");
    expect(has("Telefonnummer des Ansprechpartners")).toBe(false);
    await pick(ASK, "Ja");
    await typeInto("Telefonnummer des Ansprechpartners", "0123");
    await pick(ASK, "Nein");
    expect(has("Telefonnummer des Ansprechpartners")).toBe(false);
    expect(offer().Kundendaten.cp_phone).toBe("0123");
    await pick(ASK, "Ja");
    expect((screen.getByLabelText("Telefonnummer des Ansprechpartners") as HTMLInputElement).value).toBe("0123");
    const viaPage = snapshot();
    cleanup();
    await open("bu");
    direct((p) => { p({ hasContactPerson: "Ja" }); p({ cp_phone: "0123" }); p({ hasContactPerson: "Nein", cp_name: "" }); p({ hasContactPerson: "Ja" }); });
    expect(snapshot()).toBe(viaPage);
  });
  it("an offer that holds a contact person shows the fields although the answer says no", async () => {
    await open("bu", (kd) => { kd.hasContactPerson = "Nein"; kd.cp_phone = "0999"; });
    expect((screen.getByLabelText("Telefonnummer des Ansprechpartners") as HTMLInputElement).value).toBe("0999");
    await pick(ASK, "Ja"); await pick(ASK, "Nein"); // answered by hand: hidden again, entries kept
    expect(has("Telefonnummer des Ansprechpartners")).toBe(false);
    expect(offer().Kundendaten.cp_phone).toBe("0999");
  });
});

describe("B3 — Abweichender Einsatzort", () => {
  const ASK = "Abweichender Einsatzort vorhanden?";
  it("the text field is on the page after Ja only; the answer itself is stored nowhere and nothing is saved or priced", async () => {
    await open("bu");
    expect(has("Abweichender Einsatzort")).toBe(false);
    const before = snapshot(), version = useOfferStore.getState().version;
    await pick(ASK, "Ja");
    expect(has("Abweichender Einsatzort")).toBe(true);
    await typeInto("Abweichender Einsatzort", "Gartenweg 2");
    await pick(ASK, "Nein");
    expect(has("Abweichender Einsatzort")).toBe(false);
    expect(offer().Kundendaten.deployment).toBe("Gartenweg 2");
    await pick(ASK, "Ja");
    expect((screen.getByLabelText("Abweichender Einsatzort") as HTMLInputElement).value).toBe("Gartenweg 2");
    expect(snapshot()).toBe(before.replace('"deployment":""', '"deployment":"Gartenweg 2"'));
    expect(useOfferStore.getState().version).toBeGreaterThan(version); // typing is a change …
    const v = useOfferStore.getState().version;
    await pick(ASK, "Nein"); await pick(ASK, "Ja");
    expect(useOfferStore.getState().version).toBe(v); // … the pure show / hide is not
  });
  it("an offer with an other place shows it, and the answer reads Ja", async () => {
    await open("bu", (kd) => { kd.deployment = "Hinterhaus"; });
    expect((screen.getByLabelText("Abweichender Einsatzort") as HTMLInputElement).value).toBe("Hinterhaus");
    expect((Array.from(group(ASK).querySelectorAll("input")).find((i) => i.value === "Ja") as HTMLInputElement).checked).toBe(true);
  });
});
