// Alltagshilfe-only blocks of Kundendaten (UX-CHANGES U-052): „Vorbereitung vor dem Termin“,
// „2 Personen mit Pflegegrad im Haushalt“, „Besondere Hinweise“, „Lebenssituation“. For the same
// choices the React page must store what today's page stores (fixtures/kundendaten-ah.json, recorded
// by v2/scripts/capture-kundendaten-ah.cjs) — except the one deliberate difference: the details
// field opens on „Ja“ too.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyOffer, restoreChanges, applyChanges } from "@oc/domain";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { HINTS, LIFE, hintChoice } from "../src/features/steps/kundendaten/ah.js";
import reference from "./fixtures/kundendaten-ah.json" with { type: "json" };
import oldOffers from "./fixtures/ah-old-offers.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
type Step = [string, string, unknown];
type View = (typeof reference.scenarios)[number]["view"];
const KEY = "t-0123456789abcdef01234569";
const CONFIG = { ENTLASTUNGSBETRAG_MONAT: 131, STEUERABSETZ_PCT: 20, STEUERABSETZ_CAP_JAHR: 4000, VERHINDERUNGSPFLEGE_JAHR: 2418 };
const CONTEXT = ["date", "ansprechpartner", "emc2_contact"]; // the day and the user — not input
const SCENARIOS = reference.scenarios as unknown as { name: string; steps: Step[]; kundendaten: F; outside: F; view: View; requests: string[] }[];
const REPLAY = SCENARIOS.filter((s) => !s.steps.some(([k]) => k === "open"));
const REOPENED = SCENARIOS.filter((s) => s.steps.some(([k]) => k === "open"));
/** the fields of the four blocks (and what „2 Personen“ writes besides) */
const BLOCK = (k: string) => /^(prep_|ah_|p2|ahZweiPersonen$|kundenName$|greetingLine$)/.test(k);
const blockOf = (kd: F) => Object.fromEntries(Object.entries(kd).filter(([k, v]) => BLOCK(k) && v !== undefined));

const offer = () => useOfferStore.getState().offer as F;
const stored = () => { const kd: F = { ...offer().Kundendaten }; for (const k of CONTEXT) kd[k] = ""; return kd; };
const handlers = (draft?: F, config: F = CONFIG) => ({
  ...BASE, "GET /admin/api/config/public": { body: config },
  ...(draft ? { "GET /api/deals/*/draft": { body: { dealId: "4713", revision: 3, offerType: "ah", payload: draft, updatedAt: "2026-11-23T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}),
});
async function open(type = "ah", config: F = CONFIG) {
  const server = fakeServer(handlers(undefined, config));
  renderApp(`/deal/${KEY}/${type}/Kundendaten`);
  await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
  return server;
}
async function openStored(payload: F, step = "Kundendaten") {
  const server = fakeServer(handlers(payload));
  const router = renderApp(`/deal/4713/ah/${step}`);
  if (step === "Kundendaten") await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
  return { server, router };
}
const draftWith = (kd: F, more: F = {}) => { const o = emptyOffer("ah", { date: "2026-11-23" }) as F; return { ...o, ...more, Kundendaten: { ...o.Kundendaten, ...kd } }; };

const LABEL = Object.fromEntries([...HINTS, ...LIFE.map(([f, l]) => [f, l] as const)]) as Record<string, string>;
const p2 = () => screen.getByTestId("ah-kd-p2");
const group = (name: string, inside?: HTMLElement) => (inside ? within(inside) : screen).getAllByRole("group", { name })[0]!;
const chipIn = (g: HTMLElement, value: string) => Array.from(g.querySelectorAll("input")).find((i) => i.value === value)!;
async function openPrep(u: ReturnType<typeof userEvent.setup>) {
  const b = screen.getByRole("button", { name: /^Vorbereitung · / });
  if (b.getAttribute("aria-expanded") !== "true") await u.click(b);
}
/** the recorded steps, made in the React page like a user */
async function play(steps: Step[]) {
  const u = userEvent.setup();
  for (const [kind, field, value] of steps) {
    const v = String(value);
    if (kind === "check") {
      if (field.startsWith("prep_")) await openPrep(u);
      const box = field === "ahZweiPersonen" ? screen.getByRole("checkbox", { name: /^2 Personen mit Pflegegrad im Haushalt/ }) : (document.getElementById(`ah-kd-${field}`) as HTMLInputElement);
      if ((box as HTMLInputElement).checked !== (v === "on")) await u.click(box);
    } else if (kind === "radio") {
      const g = field === "p2Salutation" ? group("Anrede", p2()) : field === "p2Pflegegrad" ? group("Pflegegrad", p2())
        : field === "salutation" ? group("Anrede") : field === "payer" ? group("Ist der Kunde Selbstzahler oder Kassenkunde?")
        : group(LABEL[field.replace(/_choice$/, "")]!);
      await u.click(chipIn(g, v));
    } else if (kind === "text") {
      const input = document.getElementById(`Kundendaten-${field}`) as HTMLInputElement;
      expect(input, `${field} on the page`).not.toBeNull();
      await u.clear(input);
      if (v) await u.type(input, v);
    } else throw new Error(`step ${kind}`);
  }
  await u.tab(); // the last field is left
}
/** what differs from a new offer outside Kundendaten, as dotted paths — like the recorder */
function outsideChanges(): F {
  const fresh = emptyOffer("ah", { date: "" }) as F;
  const out: F = {};
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  const walk = (a: any, b: any, p: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (isObj(a) && isObj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  const now = offer();
  for (const k of new Set([...Object.keys(fresh), ...Object.keys(now)])) if (k !== "Kundendaten") walk(fresh[k], now[k], k);
  for (const k of Object.keys(out)) if (k.startsWith("pricingRules.")) delete out[k]; // the business settings this test serves, taken into a new offer
  return out;
}
/** the page shows what today's page shows — the details field after „Ja“ too (U-052), and the details
 *  without the chip's own word that today's page writes into the text */
function expectView(view: View) {
  expect(!!screen.queryByTestId("ah-kd-p2")).toBe(view.twoPersons.fields);
  if (view.twoPersons.fields) {
    const s = (n: string) => Array.from(group(n, p2()).querySelectorAll("input")).find((i) => i.checked)?.value ?? "";
    expect([s("Anrede"), (document.getElementById("Kundendaten-p2FirstName") as HTMLInputElement).value, (document.getElementById("Kundendaten-p2LastName") as HTMLInputElement).value, s("Pflegegrad")])
      .toEqual([view.twoPersons.salutation, view.twoPersons.firstName, view.twoPersons.lastName, view.twoPersons.level]);
  }
  expect((screen.getByRole("checkbox", { name: /^2 Personen mit Pflegegrad im Haushalt/ }) as HTMLInputElement).checked).toBe(view.twoPersons.ticked);
  for (const q of view.hints.questions) {
    const g = group(q.label);
    expect([q.name, Array.from(g.querySelectorAll("input")).find((i) => i.checked)?.value ?? ""]).toEqual([q.name, q.choice]);
    const details = document.getElementById(`Kundendaten-${q.name}`) as HTMLInputElement | null;
    expect([q.name, !!details]).toEqual([q.name, q.detailsShown || q.choice === "Ja"]);
    if (details) expect(details.value).toBe(q.details === "Ja" || q.details === "Nein" ? "" : q.details);
  }
  expect((document.getElementById("Kundendaten-ah_sonstiges") as HTMLInputElement).value).toBe(view.hints.other.value);
  for (const q of view.living.questions) expect([q.name, Array.from(group(q.label).querySelectorAll("input")).find((i) => i.checked)?.value ?? ""]).toEqual([q.name, q.choice]);
  expect(screen.getByRole("button", { name: /^Vorbereitung · / })).toHaveTextContent(`Vorbereitung · ${view.prep.ticked.length} von 5 erledigt`);
}

describe("Alltagshilfe blocks store what today's UI stores", () => {
  it.each(REPLAY.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    await open();
    await play(s.steps);
    expect(stored()).toEqual(s.kundendaten); // the whole Kundendaten, byte for byte (same values, same keys)
    expect(outsideChanges()).toEqual(s.outside);
    expectView(s.view);
  }, 20000);

  it("the recordings cover every option of every question and each Pflegegrad of the second person", () => {
    const chosen = new Set(REPLAY.flatMap((s) => s.steps.filter(([k]) => k === "radio" || k === "check").map(([, f, v]) => `${f}=${v}`)));
    for (const [f, , answers] of LIFE) for (const a of answers) expect(chosen).toContain(`${f}=${a}`);
    for (const [f] of HINTS) for (const a of ["Ja", "Nein", "Sonstiges"]) expect(chosen).toContain(`${f}_choice=${a}`);
    for (const l of ["1", "2", "3", "4", "5", "beantragt"]) expect(chosen).toContain(`p2Pflegegrad=${l}`);
    for (const a of ["Frau", "Herr"]) expect(chosen).toContain(`p2Salutation=${a}`);
    for (const p of ["prep_terminBestaetigt", "prep_erstberatungsbogen", "prep_visitenkarten", "prep_leistungsuebersicht", "prep_mustervertrag"]) { expect(chosen).toContain(`${p}=on`); }
    expect(chosen).toContain("prep_terminBestaetigt=off");
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(14);
  });

  it("texts as today's page; the Entlastungsbetrag of the sub line comes from the business settings", async () => {
    const v = SCENARIOS[0]!.view;
    await open("ah", { ...CONFIG, ENTLASTUNGSBETRAG_MONAT: 125 });
    const u = userEvent.setup();
    await openPrep(u);
    for (const [k, label] of v.prep.items) expect(document.querySelector(`label[for="ah-kd-${k}"]`)).toHaveTextContent(label as string);
    expect(screen.getByTestId("ah-kd-prep-tip")).toHaveTextContent(/^Tipp: Vor dem Termin kurz googeln/);
    for (const q of [...v.hints.questions, ...v.living.questions]) expect(Array.from(group(q.label).querySelectorAll("input")).map((i) => i.value)).toEqual(q.options);
    await waitFor(() => expect(screen.getByTestId("ah-kd-two").querySelector('[data-part="sub"]')).toHaveTextContent("Entlastungsbetrag 2 × 125 €/Monat = 250 €/Monat"));
    await u.click(screen.getByRole("checkbox", { name: /^2 Personen mit Pflegegrad im Haushalt/ }));
    expect(Array.from(group("Pflegegrad", p2()).querySelectorAll("input")).map((i) => i.value)).toEqual(v.twoPersons.levels);
    expect(Array.from(group("Anrede", p2()).querySelectorAll("input")).map((i) => i.value)).toEqual(["Frau", "Herr"]);
    expect(screen.getByRole("textbox", { name: "Sonstiges (Wünsche, Abneigungen, Gewohnheiten)" })).toBeInTheDocument();
  });

  it("page order mirrors today's (Vorbereitung on top, Hinweise before Förderung und Objekt, Lebenssituation last); nothing of it is required for „Weiter“", async () => {
    await open();
    const ids = ["ah-kd-prep", "ah-kd-two", "ah-kd-hints", "ah-kd-living"].map((id) => screen.getByTestId(id));
    const contact = screen.getByRole("heading", { name: "Kontaktdaten des Kunden" });
    const property = screen.getByRole("heading", { name: "Förderung und Objekt" });
    const internal = screen.getByRole("heading", { name: /^Interne Liste/ });
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([before(ids[0]!, contact), before(ids[2]!, property), before(internal, ids[3]!), before(contact, ids[1]!)]).toEqual([true, true, true, true]);
    expect(reference.scenarios[0]!.view.order).toEqual(["Vorbereitung", "Kontaktdaten", "2 Personen", "Kostenträger", "Pflegegrad", "Besondere Hinweise", "Objekt", "Interne Liste", "Lebenssituation"]);
  });

  it("no extra request: ticks and chips of these blocks ask for no price (today: none either)", async () => {
    const server = await open();
    const before = server.count("POST /api/price");
    await play([["check", "prep_visitenkarten", "on"], ["radio", "ah_haustiere", "Ja"], ["radio", "ah_demenz_choice", "Nein"], ["text", "ah_sonstiges", "x"]]);
    expect(server.count("POST /api/price")).toBe(before);
    for (const s of REPLAY) expect(s.requests.filter((r) => r.includes("/api/price"))).toEqual([]);
  });
});

describe("only for Alltagshilfe", () => {
  it.each(["bu", "bwt", "hl", "bl"])("%s: none of the four blocks", async (type) => {
    await open(type);
    for (const id of ["ah-kd-prep", "ah-kd-two", "ah-kd-hints", "ah-kd-living"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /^2 Personen mit Pflegegrad im Haushalt/ })).toBeNull();
  });
  it("Alltagshilfe does not show the Badumbau second person (twoPersons / partner*)", async () => {
    await open();
    expect(screen.queryByRole("heading", { name: "Zweite Person" })).toBeNull();
  });
});

describe("deliberate difference (U-052): details also after „Ja“", () => {
  it("„Ja“ opens the details field; typed details are stored in ah_*; emptied, „Ja“ is stored as today", async () => {
    await open();
    const u = userEvent.setup();
    await u.click(chipIn(group("Mobilitätseinschränkungen"), "Ja"));
    expect([offer().Kundendaten.ah_mobilitaet_choice, offer().Kundendaten.ah_mobilitaet]).toEqual(["Ja", "Ja"]); // today's „Ja“
    const details = screen.getByRole("textbox", { name: "Details zu „Mobilitätseinschränkungen“" }) as HTMLInputElement;
    expect(details.value).toBe("");
    await u.type(details, "Rollator");
    expect([offer().Kundendaten.ah_mobilitaet_choice, offer().Kundendaten.ah_mobilitaet]).toEqual(["Ja", "Rollator"]);
    expect(group("Mobilitätseinschränkungen").querySelector("input:checked")).toHaveAttribute("value", "Ja");
    await u.clear(details);
    expect([offer().Kundendaten.ah_mobilitaet_choice, offer().Kundendaten.ah_mobilitaet]).toEqual(["Ja", "Ja"]);
  });

  it("„Nein“ has no details field and writes „Nein“ (as today); „Sonstiges“ keeps the details", async () => {
    await open();
    const u = userEvent.setup();
    await u.click(chipIn(group("Allergien / Unverträglichkeiten"), "Sonstiges"));
    await u.type(screen.getByRole("textbox", { name: "Details zu „Allergien / Unverträglichkeiten“" }), "Nüsse");
    await u.click(chipIn(group("Allergien / Unverträglichkeiten"), "Nein"));
    expect(screen.queryByRole("textbox", { name: "Details zu „Allergien / Unverträglichkeiten“" })).toBeNull();
    expect([offer().Kundendaten.ah_allergien_choice, offer().Kundendaten.ah_allergien]).toEqual(["Nein", "Nein"]);
  });

  it("an offer stored with „Ja“ + details opens with „Ja“ and the details; today's UI shows it as „Sonstiges“ with the details and keeps the text", async () => {
    const s = SCENARIOS.find((x) => x.name === "reopened: Ja with details (React's shape)")!;
    // today's UI, recorded: the text is kept, the chip becomes „Sonstiges“ (it derives the chip from the text alone)
    expect([s.kundendaten.ah_mobilitaet, s.kundendaten.ah_mobilitaet_choice, s.view.hints.questions[0]!.choice]).toEqual(["Rollator, Treppe nur mit Hilfe", "Sonstiges", "Sonstiges"]);
    expect([s.kundendaten.ah_allergien, s.kundendaten.ah_allergien_choice]).toEqual(["Ja", "Ja"]);
    // the React page
    const draft = draftWith({ ah_mobilitaet_choice: "Ja", ah_mobilitaet: "Rollator, Treppe nur mit Hilfe" });
    await openStored(draft);
    expect(group("Mobilitätseinschränkungen").querySelector("input:checked")).toHaveAttribute("value", "Ja");
    expect((screen.getByRole("textbox", { name: "Details zu „Mobilitätseinschränkungen“" }) as HTMLInputElement).value).toBe("Rollator, Treppe nur mit Hilfe");
    expect(offer().Kundendaten).toEqual(draft.Kundendaten);
  });
});

describe("follow-up fields (B3, U-047): hidden fields keep their values; a block with data stays open", () => {
  it("unticked: the second person's fields go from the page, their entries stay stored and come back", async () => {
    await open();
    await play([["check", "ahZweiPersonen", "on"], ["text", "p2FirstName", "Max"], ["radio", "p2Pflegegrad", "2"], ["check", "ahZweiPersonen", "off"]]);
    expect(screen.queryByTestId("ah-kd-p2")).toBeNull();
    expect([offer().Kundendaten.p2FirstName, offer().Kundendaten.p2Pflegegrad, "ahZweiPersonen" in offer().Kundendaten]).toEqual(["Max", "2", false]);
    await play([["check", "ahZweiPersonen", "on"]]);
    expect((document.getElementById("Kundendaten-p2FirstName") as HTMLInputElement).value).toBe("Max");
  });

  it("an offer with the second person's entries but no tick shows them until the tick is answered here", async () => {
    await openStored(draftWith({ p2FirstName: "Max", p2LastName: "Muster" }));
    expect(screen.getByTestId("ah-kd-p2")).toBeInTheDocument();
    await play([["check", "ahZweiPersonen", "on"], ["check", "ahZweiPersonen", "off"]]);
    expect(screen.queryByTestId("ah-kd-p2")).toBeNull();
    expect(offer().Kundendaten.p2FirstName).toBe("Max");
  });

  it("„Vorbereitung“ is one row until opened; its count follows the ticks", async () => {
    await open();
    expect(screen.queryByRole("checkbox", { name: /^Termin bestätigt/ })).toBeNull();
    await play([["check", "prep_terminBestaetigt", "on"], ["check", "prep_mustervertrag", "on"]]);
    expect(screen.getByRole("button", { name: /^Vorbereitung · / })).toHaveTextContent("Vorbereitung · 2 von 5 erledigt");
  });
});

describe("reopened offers: shown as today, stored unchanged", () => {
  it.each(REOPENED.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    // what today's UI stored after the reopen, opened in the React page
    const draft = draftWith(s.kundendaten);
    await openStored(draft);
    expectView(s.view);
    expect(offer().Kundendaten).toEqual(draft.Kundendaten);
  });

  it("reopen and save unchanged in today's UI keeps every field of the blocks", () => {
    for (const name of ["everything answered", "two persons, Pflegegrad beantragt"]) {
      const was = SCENARIOS.find((x) => x.name === name)!, again = SCENARIOS.find((x) => x.name === (name === "everything answered" ? "everything answered, reopened unchanged" : "two persons with Pflegegrad, reopened unchanged"))!;
      if (name === "everything answered") expect(blockOf(again.kundendaten)).toEqual(blockOf(was.kundendaten));
      else expect(Object.keys(blockOf(again.kundendaten)).sort()).toEqual(Object.keys(blockOf(was.kundendaten)).sort());
    }
  });

  it.each((oldOffers.payloads as unknown as { id: string; payload: F }[]).filter((p) => p.payload.Kundendaten).map((p) => [p.id, p] as const))("old stored offer %s: its ah_* / p2* values on the page, nothing written", async (_id, p) => {
    const payload = structuredClone(p.payload);
    await openStored(payload);
    const kd = payload.Kundendaten as F;
    for (const [f, label] of HINTS) {
      const c = hintChoice(kd, f);
      expect([f, group(label).querySelector("input:checked")?.getAttribute("value") ?? ""]).toEqual([f, c]);
      const t = String(kd[f] ?? "");
      if (t && t !== "Ja" && t !== "Nein") expect((document.getElementById(`Kundendaten-${f}`) as HTMLInputElement).value).toBe(t);
    }
    expect((document.getElementById("Kundendaten-ah_sonstiges") as HTMLInputElement).value).toBe(String(kd.ah_sonstiges ?? ""));
    for (const [f, label, answers] of LIFE) expect([f, group(label).querySelector("input:checked")?.getAttribute("value") ?? ""]).toEqual([f, (answers as readonly string[]).includes(kd[f]) ? kd[f] : ""]);
    if (String(kd.p2FirstName ?? "")) expect((document.getElementById("Kundendaten-p2FirstName") as HTMLInputElement).value).toBe(kd.p2FirstName);
    await new Promise((r) => setTimeout(r, 50));
    expect(offer().Kundendaten).toEqual(kd);
  });
});

describe("what depends on „2 Personen“", () => {
  const KASSE = { payer: "Kassenkunde", hasPflegegrad: "Ja", pflegegrad: "3" };
  const navLink = (name: RegExp) => within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name });

  it("ticked on Kundendaten: the budget on Leistungen is 2 × the Entlastungsbetrag at once, and budget mode re-fits", async () => {
    const u = userEvent.setup();
    await openStored(draftWith(KASSE, { Finanzierung: { ahEntlastungsbetragNutzen: "on" }, Arbeitszeit: { travelTimeHHMM: "0:15", ahTravelZone: 2 } }), "ah");
    await screen.findByTestId("ah-leistungen");
    await waitFor(() => expect(screen.getByTestId("ah-budget")).toHaveTextContent("von 131,00 €"));
    expect(screen.getByRole("checkbox", { name: /Im Budget bleiben/ })).toBeChecked();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const minutes = () => { const [h, m] = String(offer().ah.services[0].schedules[0].dauer).split(":").map(Number); return h! * 60 + m!; };
    await waitFor(() => expect(minutes()).not.toBe(60));
    const single = minutes();
    await u.click(navLink(/^Kundendaten/));
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await u.click(screen.getByRole("checkbox", { name: /^2 Personen mit Pflegegrad im Haushalt/ }));
    expect(offer().Kundendaten.ahZweiPersonen).toBe("on");
    await u.click(navLink(/^Leistungen/));
    await waitFor(() => expect(screen.getByTestId("ah-budget")).toHaveTextContent("von 262,00 €"));
    await waitFor(() => expect(minutes()).toBeGreaterThan(single));
  });

  it("the warning „Pflegegrad der 2. Person fehlt“ goes once the Pflegegrad is chosen on Kundendaten", async () => {
    const u = userEvent.setup();
    await openStored(draftWith({ ...KASSE, ahZweiPersonen: "on" }, { Finanzierung: { ahEntlastungsbetragNutzen: "on" } }), "Finanzierung");
    await screen.findByTestId("ah-finanzierung");
    expect(screen.getByTestId("ah-fin-eb-warn")).toHaveTextContent("Pflegegrad der 2. Person fehlt");
    await u.click(navLink(/^Kundendaten/));
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await u.click(chipIn(group("Pflegegrad", p2()), "2"));
    await u.click(navLink(/^Finanzierung/));
    await screen.findByTestId("ah-finanzierung");
    expect(screen.queryByTestId("ah-fin-eb-warn")).toBeNull();
    expect(screen.getByTestId("ah-fin-eb").querySelector('[data-part="sub"]')?.textContent?.replace(/\u00a0/g, " ")).toContain("262 € pro Monat · 2 Personen");
  });

  it("name and greeting of both follow the names while ticked; Selbstzahler empties them (as today)", async () => {
    await open();
    await play([["radio", "salutation", "Frau"], ["text", "firstName", "Erika"], ["text", "lastName", "Muster"], ["check", "ahZweiPersonen", "on"], ["radio", "p2Salutation", "Herr"], ["text", "p2FirstName", "Max"], ["text", "p2LastName", "Muster"]]);
    expect([offer().Kundendaten.kundenName, offer().Kundendaten.greetingLine]).toEqual(["Frau Erika Muster und Herr Max Muster", "Sehr geehrte Frau Muster, sehr geehrter Herr Muster"]);
    act(() => { (useOfferStore.getState().patch as any)("Kundendaten", { greetingLine: "Liebe Familie Muster" }); });
    await play([["text", "p2FirstName", "Moritz"]]);
    expect([offer().Kundendaten.kundenName, offer().Kundendaten.greetingLine]).toEqual(["Frau Erika Muster und Herr Moritz Muster", "Liebe Familie Muster"]);
    await play([["radio", "payer", "Selbstzahler"]]);
    expect([offer().Kundendaten.kundenName, offer().Kundendaten.greetingLine]).toEqual(["", ""]);
  });
});

describe("copy to another offer (restore rule, „Kunde suchen“ / „Weiteres Angebot für diesen Kunden“)", () => {
  const SOURCE: F = {
    ...SCENARIOS.find((x) => x.name === "everything answered")!.kundendaten,
    ah_mobilitaet_choice: "Ja", ah_mobilitaet: "Rollator",
  };
  const into = (type: string, kd: F = {}) => { const o = emptyOffer(type as never, { date: "2026-11-23" }) as F; o.Kundendaten = { ...o.Kundendaten, ...kd }; return applyChanges(o, restoreChanges(o, structuredClone(SOURCE), type)).Kundendaten as F; };

  it("Alltagshilfe → Alltagshilfe: second person, notes (chip and text), Lebenssituation and the free text are taken over; the preparation ticks are not", () => {
    const kd = into("ah");
    expect(blockOf(kd)).toEqual(Object.fromEntries(Object.entries(blockOf(SOURCE)).filter(([k]) => !k.startsWith("prep_"))));
    for (const k of Object.keys(SOURCE).filter((x) => x.startsWith("prep_"))) expect(k in kd).toBe(false);
  });
  it("the preparation ticks of the open offer stay as they are (they belong to the appointment)", () => {
    expect(into("ah", { prep_visitenkarten: "Ja" }).prep_visitenkarten).toBe("Ja");
  });
  it("a source without the second person (e.g. a Bitrix contact) leaves the open offer's second person alone", () => {
    const o = emptyOffer("ah", { date: "2026-11-23" }) as F;
    o.Kundendaten = { ...o.Kundendaten, ahZweiPersonen: "on", p2FirstName: "Max" };
    const ch = restoreChanges(o, { firstName: "Erika", lastName: "Muster" }, "ah");
    expect(["ahZweiPersonen" in ch.Kundendaten!, "p2FirstName" in ch.Kundendaten!]).toEqual([false, false]);
  });
  it("into another offer type: the Alltagshilfe second person is not taken over", () => {
    const kd = into("bu");
    expect(["ahZweiPersonen" in kd, kd.p2FirstName, kd.p2Pflegegrad]).toEqual([false, "", undefined]);
  });
  it("an older customer with only the note texts gets the chips today's page would show", () => {
    const o = emptyOffer("ah", { date: "2026-11-23" }) as F;
    const ch = restoreChanges(o, { ah_mobilitaet: "Gehstock", ah_demenz: "Nein", ah_sprache: "" }, "ah").Kundendaten!;
    expect([ch.ah_mobilitaet_choice, ch.ah_demenz_choice, "ah_sprache_choice" in ch]).toEqual(["Sonstiges", "Nein", false]);
  });
});
