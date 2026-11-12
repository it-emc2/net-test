// Kundendaten must store exactly what today's UI stores for the same inputs. The references
// (fixtures/kundendaten-*.json) are recorded from today's UI by
// v2/scripts/capture-kundendaten.cjs; here the same inputs are made in the React screen.
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import contact from "./fixtures/kundendaten-contact.json" with { type: "json" };
import payer from "./fixtures/kundendaten-payer.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

// field name → the label a user sees in the React screen
const LABEL: Record<string, string> = {
  firstName: "Vorname", lastName: "Nachname", phone: "Telefonnummer", email: "E-Mail", emailCc: "E-Mail (CC)", street: "Adresse",
  city: "Stadt", state: "Bundesland / Provinz", postalCode: "PLZ / Postleitzahl", deployment: "Abweichender Einsatzort",
  cp_name: "Abweichender Ansprechpartner", cp_phone: "Telefonnummer des Ansprechpartners", cp_email: "E-Mail des Ansprechpartners (CC)",
  cp_street: "Adresse des Ansprechpartners", cp_city: "Stadt des Ansprechpartners", cp_state: "Bundesland des Ansprechpartners",
  cp_postalCode: "PLZ des Ansprechpartners",
  kassenkundeName: "Name der Krankenkasse", kk_krankenkasseAdresse: "Adresse der Krankenkasse", kk_pflegegradSeit: "Pflegegrad seit",
};
const GROUP: Record<string, string> = {
  salutation: "Anrede", customerType: "Neukunde oder Bestandskunde?", hasContactPerson: "Ansprechpartner vorhanden?", cp_salutation: "Anrede des Ansprechpartners",
  payer: "Ist der Kunde Selbstzahler oder Kassenkunde?", kk_rechnungskopie: "Kassen-Rechnungskopie gewünscht?", kk_rechnungskopie_art: "Rechnungskopie per Post oder per E-Mail?",
};
const CONTEXT = ["date", "ansprechpartner", "emc2_contact"]; // the day and the user — not input
const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;

async function open(type: string) {
  fakeServer(BASE);
  renderApp(`/deal/${KEY}/${type}/Kundendaten`);
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
}
async function play(steps: [string, string, string][]) {
  const user = userEvent.setup();
  for (const [kind, field, value] of steps) {
    if (kind === "radio") {
      const group = screen.getByRole("group", { name: GROUP[field]! });
      await user.click(Array.from(group.querySelectorAll("input")).find((i) => i.value === value)!);
    } else {
      const input = screen.getByLabelText(LABEL[field]!, { exact: true }) as HTMLInputElement;
      if (input.type === "month" || input.type === "date") fireEvent.change(input, { target: { value } });
      else { await user.clear(input); await user.type(input, value); }
    }
  }
}
const stored = () => { const kd: Record<string, unknown> = { ...offer().Kundendaten }; for (const k of CONTEXT) kd[k] = ""; return kd; };

describe("Kundendaten stores what today's UI stores — contact, address, contact person", () => {
  it.each(contact.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    await open("bu");
    await play(scenario.steps as [string, string, string][]);
    expect(stored()).toEqual(scenario.kundendaten);
  });

  it("the contact person's fields are on the page only when there is one", async () => {
    await open("bu");
    expect(screen.queryByLabelText("Abweichender Ansprechpartner")).toBeNull();
    await play([["radio", "hasContactPerson", "Ja"]]);
    expect(screen.getByLabelText("Abweichender Ansprechpartner")).toBeInTheDocument();
  });

  it("typing in one field leaves the other fields alone", async () => {
    await open("bu");
    const last = screen.getByLabelText("Nachname");
    await userEvent.type(screen.getByLabelText("Vorname"), "Erika");
    expect(screen.getByLabelText("Nachname")).toBe(last);
    expect([offer().Kundendaten.firstName, offer().Kundendaten.lastName]).toEqual(["Erika", ""]);
  });
});

describe("Kundendaten stores what today's UI stores — payer and insurance details, every offer type", () => {
  it.each(payer.scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, scenario) => {
    await open(scenario.type);
    await play(scenario.steps as [string, string, string][]);
    expect(stored()).toEqual(scenario.kundendaten);

    // what the payer changes outside Kundendaten: the selected documents and the letter's attachments
    const fresh = emptyOffer(scenario.type as NewOfferType, { date: "" }) as Record<string, any>;
    const outside: Record<string, unknown> = {};
    for (const k of ["abtretung", "vollmacht"]) if (offer().docSelection[k] !== fresh.docSelection[k]) outside[`docSelection.${k}`] = offer().docSelection[k];
    if (JSON.stringify(offer().postal.attachments) !== JSON.stringify(fresh.postal.attachments)) outside["postal.attachments"] = offer().postal.attachments;
    expect(outside).toEqual(scenario.outside);

    // the same parts are on the page
    expect(!!screen.queryByLabelText("Name der Krankenkasse")).toBe(scenario.shown.kassenkundeDetails);
    expect(!!screen.queryByLabelText("Geburtsdatum")).toBe(scenario.shown.kk_geburtsdatum);
    expect(!!screen.queryByLabelText("Versicherungsnummer")).toBe(scenario.shown.kk_versichertennr);
  });

  it("the whole payer change is ONE change of the offer (one save, one price request)", async () => {
    await open("bu");
    const before = useOfferStore.getState().version;
    await play([["radio", "payer", "Selbstzahler"]]);
    expect(useOfferStore.getState().version).toBe(before + 1);
  });

  it("an offer opened as Selbstzahler and switched to Kassenkunde gets today's defaults", async () => {
    const o = emptyOffer("bu", { date: "2026-11-12" }) as Record<string, any>;
    for (const k of ["kassenkundeName", "kk_geburtsdatum", "kk_krankenkasseAdresse", "kk_pflegegradSeit", "kk_rechnungskopie", "kk_versichertennr"]) delete o.Kundendaten[k];
    o.Kundendaten.payer = "Selbstzahler"; o.docSelection.abtretung = false; o.docSelection.vollmacht = false; o.postal.attachments = [];
    fakeServer({ ...BASE, [`GET /api/deals/${KEY}/draft`]: { body: { dealId: KEY, offerType: "bu", payload: o, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } } });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kostenträger" });
    expect(screen.queryByLabelText("Name der Krankenkasse")).toBeNull();
    await play([["radio", "payer", "Kassenkunde"]]);
    const fresh = emptyOffer("bu", { date: "" }) as Record<string, any>;
    expect([offer().Kundendaten.kk_rechnungskopie, offer().Kundendaten.kassenkundeName, offer().docSelection.abtretung, offer().docSelection.vollmacht]).toEqual(["nein", "", true, true]);
    expect(offer().postal.attachments).toEqual(fresh.postal.attachments);
  });

  it("invoice copy: ja → post by default; the chosen kind comes back after nein → ja", async () => {
    await open("bwt");
    await play([["radio", "kk_rechnungskopie", "ja"]]);
    expect(offer().Kundendaten.kk_rechnungskopie_art).toBe("post");
    await play([["radio", "kk_rechnungskopie_art", "email"], ["radio", "kk_rechnungskopie", "nein"]]);
    expect("kk_rechnungskopie_art" in offer().Kundendaten).toBe(false);
    await play([["radio", "kk_rechnungskopie", "ja"]]);
    expect(offer().Kundendaten.kk_rechnungskopie_art).toBe("email");
  });
});
