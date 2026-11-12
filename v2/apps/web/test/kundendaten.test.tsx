// Kundendaten must store exactly what today's UI stores for the same inputs. The reference
// (fixtures/kundendaten-contact.json) is recorded from today's UI by
// v2/scripts/capture-kundendaten.cjs; here the same inputs are typed into the React screen.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import reference from "./fixtures/kundendaten-contact.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

// field name → the label a user sees in the React screen
const LABEL: Record<string, string> = {
  firstName: "Vorname", lastName: "Nachname", phone: "Telefonnummer", email: "E-Mail", emailCc: "E-Mail (CC)", street: "Adresse",
  city: "Stadt", state: "Bundesland / Provinz", postalCode: "PLZ / Postleitzahl", deployment: "Abweichender Einsatzort",
  cp_name: "Abweichender Ansprechpartner", cp_phone: "Telefonnummer des Ansprechpartners", cp_email: "E-Mail des Ansprechpartners (CC)",
  cp_street: "Adresse des Ansprechpartners", cp_city: "Stadt des Ansprechpartners", cp_state: "Bundesland des Ansprechpartners",
  cp_postalCode: "PLZ des Ansprechpartners",
};
const GROUP: Record<string, string> = {
  salutation: "Anrede", customerType: "Neukunde oder Bestandskunde?", hasContactPerson: "Ansprechpartner vorhanden?", cp_salutation: "Anrede des Ansprechpartners",
};
const CONTEXT = ["date", "ansprechpartner", "emc2_contact"]; // the day and the user — not input

describe("Kundendaten stores what today's UI stores", () => {
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    fakeServer(BASE);
    renderApp("/deal/t-0123456789abcdef01234567/bu/Kundendaten");
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    const user = userEvent.setup();
    for (const [kind, field, value] of scenario.steps as [string, string, string][]) {
      if (kind === "radio") {
        const group = screen.getByRole("group", { name: GROUP[field]! });
        await user.click(Array.from(group.querySelectorAll("input")).find((i) => i.value === value)!);
      } else {
        const input = screen.getByLabelText(LABEL[field]!, { exact: true });
        await user.clear(input);
        await user.type(input, value);
      }
    }
    const got: Record<string, unknown> = { ...(useOfferStore.getState().offer as any).Kundendaten };
    for (const k of CONTEXT) got[k] = "";
    expect(got).toEqual(scenario.kundendaten);
  });

  it("the contact person's fields are on the page only when there is one", async () => {
    fakeServer(BASE);
    renderApp("/deal/t-0123456789abcdef01234567/bu/Kundendaten");
    await screen.findByRole("heading", { name: "Ansprechpartner" });
    expect(screen.queryByLabelText("Abweichender Ansprechpartner")).toBeNull();
    const group = screen.getByRole("group", { name: "Ansprechpartner vorhanden?" });
    await userEvent.click(Array.from(group.querySelectorAll("input")).find((i) => i.value === "Ja")!);
    expect(screen.getByLabelText("Abweichender Ansprechpartner")).toBeInTheDocument();
  });

  it("typing in one field does not re-render the other fields", async () => {
    fakeServer(BASE);
    renderApp("/deal/t-0123456789abcdef01234567/bu/Kundendaten");
    const last = await screen.findByLabelText("Nachname");
    const first = screen.getByLabelText("Vorname");
    await userEvent.type(first, "Erika");
    // same DOM node, value untouched; the store changed only Kundendaten
    expect(screen.getByLabelText("Nachname")).toBe(last);
    const o = useOfferStore.getState().offer as any;
    expect([o.Kundendaten.firstName, o.Kundendaten.lastName]).toEqual(["Erika", ""]);
  });
});
