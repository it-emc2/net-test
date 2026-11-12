// Kundendaten must store exactly what today's UI stores for the same inputs. The references
// (fixtures/kundendaten-*.json) are recorded from today's UI by
// v2/scripts/capture-kundendaten.cjs; here the same inputs are made in the React screen.
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import contact from "./fixtures/kundendaten-contact.json" with { type: "json" };
import care from "./fixtures/kundendaten-care.json" with { type: "json" };
import object from "./fixtures/kundendaten-object.json" with { type: "json" };
import partner from "./fixtures/kundendaten-partner.json" with { type: "json" };
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
  copayAmount: "Zuzahlung in €",
  partnerSalutation: "Anrede Partner", partnerFirstName: "Vorname Partner", partnerLastName: "Nachname Partner", partnerKassenkundeName: "Name der Krankenkasse Partner",
  partnerGeburtsdatum: "Geburtsdatum Partner", partnerKvnr: "KVNR Partner", partnerPflegegradSeit: "Pflegegrad seit (Partner)",
  partnerKrankenkasseAdresse: "Adresse der Krankenkasse (Partner)", parkDetails: "Weitere Angaben zur Parksituation", notes: "Notizen",
  stockwerkBadSonst: "Bitte Stockwerk angeben",
};
const TICK: Record<string, string> = {
  budgetMax: "4.180 € MAXIMAL", budgetCopay: "Mögliche Zuzahlung durch Kunden", twoPersons: "2 Personen mit Pflegegrad (+ 4.180 €)", premium: "Premium",
};
const GROUP: Record<string, string> = {
  salutation: "Anrede", customerType: "Neukunde oder Bestandskunde?", hasContactPerson: "Ansprechpartner vorhanden?", cp_salutation: "Anrede des Ansprechpartners",
  payer: "Ist der Kunde Selbstzahler oder Kassenkunde?", kk_rechnungskopie: "Kassen-Rechnungskopie gewünscht?", kk_rechnungskopie_art: "Rechnungskopie per Post oder per E-Mail?",
  hasPflegegrad: "Kunde hat Pflegegrad?", pflegegrad: "Welchen Pflegegrad?", partnerPflegegrad: "Pflegegrad Partner",
  pflegekasseAntrag: "Antrag auf Zuschuss bei Pflegekasse gestellt?", pflegekasseGenehmigung: "Genehmigung von Pflegekasse ist vorhanden?",
  pflegekasseEmc2Antrag: "Darf EmC2 für Sie diesen Antrag stellen?", wohnsituation: "Angabe zur Wohnsituation",
  vermieterGenehmigungErforderlich: "Genehmigung des Vermieters erforderlich?", vermieterGenehmigung: "Genehmigung des Vermieters liegt vor?",
  parkenMoeglich: "Parken vor dem Objekt möglich?", zugangWohnung: "Zugang zur Wohnung", badStockwerk: "In welchem Stockwerk befindet sich das Bad?",
};
/** is the question of this field on the React page? */
const onPage = (field: string) => (GROUP[field] ? !!screen.queryByRole("group", { name: GROUP[field] }) : !!screen.queryByLabelText(LABEL[field]!, { exact: true }));
const CONTEXT = ["date", "ansprechpartner", "emc2_contact"]; // the day and the user — not input
const KEY = "t-0123456789abcdef01234567";
const offer = () => useOfferStore.getState().offer as Record<string, any>;

async function open(type: string) {
  fakeServer(BASE);
  renderApp(`/deal/${KEY}/${type}/Kundendaten`);
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
}
/** `skipped`: fields whose control today's UI does not show for this offer type — the step is
 *  not made, and the React page must not offer that control either. */
async function play(steps: [string, string, string][], skipped: string[] = []) {
  const user = userEvent.setup();
  for (const [kind, field, value] of steps) {
    if (skipped.includes(field)) {
      const option = kind === "radio" && GROUP[field] ? screen.queryByRole("group", { name: GROUP[field] })?.querySelector(`input[value="${value}"]`) : null;
      expect(kind === "radio" ? option ?? null : onPage(field) ? "on page" : null, `${field} must not be offered`).toBeNull();
      continue;
    }
    if (kind === "select") {
      await user.selectOptions(screen.getByLabelText(LABEL[field]!, { exact: true }), value);
    } else if (kind === "radio") {
      const group = screen.getByRole("group", { name: GROUP[field]! });
      await user.click(Array.from(group.querySelectorAll("input")).find((i) => i.value === value)!);
    } else if (kind === "check") {
      const box = screen.getByRole("checkbox", { name: TICK[field]! }) as HTMLInputElement;
      if (box.checked !== (value === "on")) await user.click(box);
    } else {
      const input = screen.getByLabelText(LABEL[field]!, { exact: true }) as HTMLInputElement;
      if (input.type === "month" || input.type === "date" || input.type === "number") { fireEvent.change(input, { target: { value } }); fireEvent.blur(input); }
      else { await user.clear(input); await user.type(input, value); }
    }
  }
  await user.tab(); // the user goes on: the last field is left
}
/** what differs from a new offer outside Kundendaten, as dotted paths — like the recorder */
function outsideChanges(type: string): Record<string, unknown> {
  const fresh = emptyOffer(type as NewOfferType, { date: "" }) as Record<string, any>;
  const out: Record<string, unknown> = {};
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const walk = (a: any, b: any, p: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (isObj(a) && isObj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  const now = offer();
  for (const k of new Set([...Object.keys(fresh), ...Object.keys(now)])) if (k !== "Kundendaten") walk(fresh[k], now[k], k);
  return out;
}
const stored = () => { const kd: Record<string, unknown> = { ...offer().Kundendaten }; for (const k of CONTEXT) kd[k] = ""; return kd; };

describe("Kundendaten stores what today's UI stores — contact, address, contact person", () => {
  it.each(contact.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, scenario) => {
    await open("bu");
    await play(scenario.steps as [string, string, string][]);
    expect(stored()).toEqual(scenario.kundendaten);
    expect(outsideChanges("bu")).toEqual(scenario.outside); // mail recipient and letter recipient
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
    expect(outsideChanges(scenario.type)).toEqual(scenario.outside);

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

describe("Kundendaten stores what today's UI stores — care level and budget, every offer type", () => {
  it.each(care.scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, scenario) => {
    await open(scenario.type);
    await play(scenario.steps as [string, string, string][]);
    expect(stored()).toEqual(scenario.kundendaten);

    expect(outsideChanges(scenario.type)).toEqual(scenario.outside);

    // the same parts are on the page, and the budget readout says the same
    expect(!!screen.queryByRole("group", { name: "Welchen Pflegegrad?" })).toBe(scenario.shown.pflegegradLevelRow);
    expect(!!screen.queryByRole("group", { name: "Budget" })).toBe(scenario.shown.budgetOptionsPanel);
    if (scenario.shown.budgetOptionsPanel) expect(screen.getByText(/^Anrechenbares Budget/).textContent).toBe(scenario.budgetText);
  });

  it("the second person is unticked by hand: its fields are no longer stored", async () => {
    await open("bu");
    await play([["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"]]);
    expect("partnerFirstName" in offer().Kundendaten).toBe(true);
    await play([["check", "twoPersons", "off"]]);
    expect(["partnerFirstName" in offer().Kundendaten, offer().Kundendaten.kundenName, offer().Kundendaten.greetingLine, offer().Kundendaten.budgetOptionsPanel]).toEqual([false, "", "", ""]);
  });

  it("a greeting changed by hand (in today's UI) is not overwritten when the name changes", async () => {
    await open("bu");
    await play([["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "3"], ["check", "twoPersons", "on"]]);
    useOfferStore.getState().patch("Kundendaten" as never, { greetingLine: "Liebe Familie Probe" } as never);
    await play([["text", "lastName", "Probe"]]);
    expect([offer().Kundendaten.greetingLine, offer().Kundendaten.kundenName]).toEqual(["Liebe Familie Probe", "Probe und"]);
  });

  it("co-payment needs a main option; the amount field appears only with the tick", async () => {
    await open("bwt");
    await play([["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "2"]]);
    expect(screen.getByRole("checkbox", { name: TICK.budgetCopay! })).toBeDisabled();
    expect(screen.queryByLabelText("Zuzahlung in €")).toBeNull();
    await play([["check", "budgetMax", "on"], ["check", "budgetCopay", "on"]]);
    expect(screen.getByLabelText("Zuzahlung in €")).toBeInTheDocument();
  });

  it("Alltagshilfe: care level without budget options; „beantragt“ only for Badumbau and Alltagshilfe", async () => {
    await open("ah");
    await play([["radio", "hasPflegegrad", "Ja"], ["radio", "pflegegrad", "beantragt"]]);
    expect(screen.queryByRole("group", { name: "Budget" })).toBeNull();
  });
});

describe.each([
  ["the second person", partner.scenarios],
  ["funding, property and notes", object.scenarios],
] as const)("Kundendaten stores what today's UI stores — %s, every offer type", (_part, scenarios) => {
  it.each(scenarios.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_name, scenario) => {
    await open(scenario.type);
    await play(scenario.steps as [string, string, string][], scenario.skipped);
    expect(stored()).toEqual(scenario.kundendaten);
    expect(outsideChanges(scenario.type)).toEqual(scenario.outside);
    // the same questions are on the page. (Left out: after Selbstzahler → Kassenkunde today's UI
    // shows the Pflegekasse question in Alltagshilfe although it never offers it there otherwise.)
    for (const [field, shown] of Object.entries(scenario.questions)) {
      if (scenario.type === "ah" && field === "pflegekasseAntrag") continue;
      // Also left out: after that switch today's UI stores the approval answer but hides its
      // question until the application answer is touched again; the React page shows it.
      if (scenario.name.includes("back to Kassenkunde") && field === "pflegekasseGenehmigung") continue;
      expect([field, onPage(field)]).toEqual([field, shown]);
    }
  });
});
