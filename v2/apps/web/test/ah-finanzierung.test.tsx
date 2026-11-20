// Alltagshilfe · Finanzierung (UX-CHANGES U-050). The page is redesigned, but for the same choices it
// must store what today's page stores and — for a Kassenkunde — give today's Eigenanteil.
// Reference: fixtures/ah-finanzierung.json, recorded from today's UI by v2/scripts/capture-ah-finanzierung.cjs.
// New rules (owner 2026-11-20): Pflegegrad defaults and warnings (fin-rules.ts, funding.ts), one total
// (ADR 028: Selbstzahler net + 7 % MwSt, Servicepauschale as a note).
import { ahInputFromPayload, ahOfferTotals } from "@oc/pricing";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { euro } from "../src/shared/lib/format.js";
import { CHECKLIST, parseEuroInput, stepAmount, vpRest } from "../src/features/steps/ah/fin-rules.js";
import reference from "./fixtures/ah-finanzierung.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
const KEY = "t-0123456789abcdef01234568";
const CONFIG = { ENTLASTUNGSBETRAG_MONAT: 131, STEUERABSETZ_PCT: 20, STEUERABSETZ_CAP_JAHR: 4000, VERHINDERUNGSPFLEGE_JAHR: 2418 };
const CFG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000, verhinderungspflegeJahr: 2418 };
/** today's new offer: Finanzierung as its empty form stores it (Entlastungsbetrag ticked by default) */
const TODAY_NEW = { ahEntlastungsbetragNutzen: "on", ahVerhinderungspflegeMonat: "0", ahUmwidmungBetrag: "" };
const HND = (dauer = "2:00", r = "Wöchentlich") => ({ type: "Haushaltsnahedienstleistungen", schedules: [{ dauer, regelmaessigkeit: r }], tasks: [], combinedVisit: false });
const svc = (list: F[]) => ({ ahServicesJson: JSON.stringify(list), services: list });

const offer = () => useOfferStore.getState().offer as F;
const fin = () => (offer().Finanzierung ?? {}) as F;
const patch = (section: string, fields: F) => act(() => { (useOfferStore.getState().patch as any)(section, fields); });
const totals = () => ahOfferTotals(ahInputFromPayload(offer(), CFG));
const handlers = (draft?: F) => ({
  ...BASE, "GET /admin/api/config/public": { body: CONFIG },
  ...(draft ? { "GET /api/deals/*/draft": { body: { dealId: "4712", revision: 3, offerType: "ah", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}),
});
async function open(setup: F = {}, step = "Finanzierung") {
  const server = fakeServer(handlers());
  renderApp(`/deal/${KEY}/ah/${step}`);
  await screen.findByTestId(step === "Finanzierung" ? "ah-finanzierung" : "ah-leistungen");
  for (const [s, f] of Object.entries(setup)) patch(s, f as F);
  return server;
}
async function openStored(payload: F) {
  const server = fakeServer(handlers(payload));
  renderApp(`/deal/4712/ah/Finanzierung`);
  await screen.findByTestId("ah-finanzierung");
  return server;
}
const user = () => userEvent.setup();
const nb = (t: string | null | undefined) => (t ?? "").replace(/ /g, " ");
const tick = (name: RegExp) => screen.getByRole("checkbox", { name });
const EB = /^Entlastungsbetrag\s*\d/, VP = /^Verhinderungspflege/, UM = /^Umwidmung Pflegesachleistungen/;
const totalShown = () => { const t = screen.getAllByTestId("ah-total")[0]!; return [t.querySelector('[data-part="gesamt"]')?.textContent, t.querySelector('[data-part="eigenanteil"]')?.textContent ?? null]; };
const summaryText = (id: string) => nb(screen.getByTestId(id).textContent);
const navLink = (name: RegExp) => within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name });
const clean = (o: F) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function setVp(u: ReturnType<typeof user>, target: number) {
  if (!(tick(VP) as HTMLInputElement).checked) await u.click(tick(VP));
  const card = screen.getByTestId("ah-fin-vp");
  const chip = target === 50 ? "50 €" : target === 100 ? "100 €" : target >= 201.5 ? "Maximum" : null;
  if (chip) { await u.click(within(card).getByRole("button", { name: chip })); return; }
  for (let n = 0; n < 40; n++) {
    const now = Number(fin().ahVerhinderungspflegeMonat);
    if (now === target) return;
    await u.click(within(card).getByRole("button", { name: now < target ? "Verhinderungspflege pro Monat mehr" : "Verhinderungspflege pro Monat weniger" }));
  }
  throw new Error(`VP ${target} not reached`);
}
async function typeUm(u: ReturnType<typeof user>, text: string) {
  const input = screen.getByRole("textbox", { name: "Bewilligter Betrag in Euro" });
  await u.clear(input);
  if (text) await u.type(input, text);
}
async function openChecklist(u: ReturnType<typeof user>) {
  const b = screen.getByRole("button", { name: /^Beratung · / });
  if (b.getAttribute("aria-expanded") !== "true") await u.click(b);
}

describe("Finanzierung stores what today's page stores; Kassenkunde: today's Eigenanteil", () => {
  it("the recording is there and varied", () => expect(reference.scenarios.length).toBeGreaterThanOrEqual(8));
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const sc = s as unknown as F;
    const server = await open({ ah: { ahServicesJson: sc.ah.ahServicesJson, services: sc.ah.services }, Arbeitszeit: sc.Arbeitszeit, Kundendaten: { ...sc.Kundendaten, ...(sc.Kundendaten.payer === "Kassenkunde" ? { hasPflegegrad: "Ja", pflegegrad: "3", p2Pflegegrad: "2" } : {}) }, Finanzierung: TODAY_NEW });
    const u = user();
    for (const [kind, a] of sc.steps as string[][]) {
      if (["travel", "payer", "zwei", "svc"].includes(kind)) continue; // set up above
      if (sc.Kundendaten.payer === "Selbstzahler") continue; // no funding cards for a Selbstzahler
      if (kind === "eb") await u.click(tick(EB));
      else if (kind === "vp") await setVp(u, Number(a));
      else if (kind === "um") await u.click(tick(UM));
      else if (kind === "umBetrag") await typeUm(u, a!);
      else if (kind === "cl") { await openChecklist(u); await u.click(screen.getByRole("checkbox", { name: CHECKLIST.find(([k]) => k === a)![1] })); }
      else throw new Error(kind);
    }
    // a Selbstzahler sees no funding: its stored ticks are set up as recorded
    if (sc.Kundendaten.payer === "Selbstzahler") patch("Finanzierung", sc.Finanzierung);
    const expected = { ...sc.Finanzierung };
    // U-050: the slider stopped at 201 €; „Maximum“ is the configured monthly maximum 201,50 €
    if (expected.ahVerhinderungspflegeMonat === "201") expected.ahVerhinderungspflegeMonat = "201.5";
    expect(clean(fin())).toEqual(expected);
    const t = totals();
    if (sc.Kundendaten.payer === "Selbstzahler") {
      expect(t.net).toBe(sc.price.allBase);
      expect(t.deductions.total).toBe(0);
    } else {
      expect(t.net).toBe(sc.price.gesamt);
      if (expected.ahVerhinderungspflegeMonat === sc.Finanzierung.ahVerhinderungspflegeMonat) {
        expect(t.eigenanteil).toBe(sc.price.eigenanteil);
        expect(t.steuerabsetzJahr).toBe(sc.price.steuerabsetzJahr);
      } else expect(t.eigenanteil).toBe(Math.max(0, Math.round((sc.price.eigenanteil - 0.5) * 100) / 100)); // 0,50 € more Verhinderungspflege
    }
    expect(totalShown()).toEqual([euro(t.gross), t.payer === "Kassenkunde" ? euro(t.eigenanteil) : null]);
    expect(server.count("POST /api/price")).toBe(0);
  });
});

describe("controls", () => {
  const SETUP = { ah: svc([HND()]), Arbeitszeit: { travelTimeHHMM: "0:25", ahTravelZone: 3 }, Kundendaten: { payer: "Kassenkunde", hasPflegegrad: "Ja", pflegegrad: "3" }, Finanzierung: TODAY_NEW };

  it("summary on top: net, one minus line per source, Eigenanteil big, § 35a line; equals the shell and Leistungen", async () => {
    await open(SETUP);
    const u = user();
    await setVp(u, 100);
    await u.click(tick(UM)); await typeUm(u, "50");
    const t = totals();
    const sum = screen.getByTestId("ah-fin-summary");
    expect(Array.from(sum.querySelectorAll('[data-part="line"]')).map((l) => nb(l.textContent))).toEqual([
      `Leistungen und Anfahrt pro Monat${nb(euro(t.net))}`, `Entlastungsbetrag− ${nb(euro(131))}`, `Verhinderungspflege− ${nb(euro(100))}`, `Umwidmung− ${nb(euro(50))}`,
    ]);
    expect(nb(sum.querySelector('[data-part="total"]')?.textContent)).toBe(`Eigenanteil pro Monat${nb(euro(t.eigenanteil))}`);
    expect(nb(sum.querySelector('[data-part="note-steuer"]')?.textContent)).toBe(`Steuerlich absetzbar: etwa ${nb(euro(t.steuerabsetzJahr))} pro Jahr`);
    expect(t.steuerabsetzJahr).toBe(Math.round(Math.min(4000, t.eigenanteil * 12 * 0.2) * 100) / 100);
    expect(totalShown()).toEqual([euro(t.gross), euro(t.eigenanteil)]);
    const onFin = summaryText("ah-fin-summary");
    await u.click(navLink(/^Leistungen/));
    await screen.findByTestId("ah-leistungen");
    expect(summaryText("ah-summary")).toBe(onFin);
  });

  it("„Vollständig gedeckt“ when the Eigenanteil is 0", async () => {
    await open({ ...SETUP, ah: svc([HND("1:00", "Monatlich")]) });
    expect(totals().eigenanteil).toBe(0);
    expect(nb(screen.getByTestId("ah-fin-summary").querySelector('[data-part="note-gedeckt"]')?.textContent)).toBe("Vollständig gedeckt");
    // the minus lines are capped: they add up to the Eigenanteil (0)
    const lines = Array.from(screen.getByTestId("ah-fin-summary").querySelectorAll('[data-part="line"]')).map((l) => nb(l.textContent));
    expect(lines[1]).toBe(`Entlastungsbetrag− ${nb(euro(totals().net))}`);
  });

  it("Entlastungsbetrag: tick stores today's fields (whole form), sub line „131 € pro Monat · Pflegegrad 3“", async () => {
    await open({ ...SETUP, Finanzierung: {} }); // the Pflegegrad answer of the setup ticked it (decision 1)
    const u = user();
    expect(offer().Finanzierung).toEqual({ ahEntlastungsbetragNutzen: "on" });
    expect(tick(EB)).toBeChecked();
    expect(nb(screen.getByTestId("ah-fin-eb").querySelector('[data-part="sub"]')?.textContent)).toBe("131 € pro Monat · Pflegegrad 3");
    await u.click(tick(EB));
    expect(fin()).toEqual({ ahVerhinderungspflegeMonat: "0", ahUmwidmungBetrag: "" });
    await u.click(tick(EB));
    expect(fin()).toEqual({ ahEntlastungsbetragNutzen: "on", ahVerhinderungspflegeMonat: "0", ahUmwidmungBetrag: "" });
  });

  it("Verhinderungspflege: tick starts at „Rest decken“ (or 50 €); − / + in 10 € steps within 10 … 201,50 €; chips; untick stores \"0\"", async () => {
    await open({ ...SETUP, ah: svc([HND("1:30", "14-tägig")]) });
    const u = user();
    expect(nb(screen.getByTestId("ah-fin-vp").querySelector('[data-part="sub"]')?.textContent)).toBe("bis 201,50 € pro Monat");
    const rest = vpRest(totals(), CFG);
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThan(201.5);
    await u.click(tick(VP));
    expect(fin().ahVerhinderungspflegeMonat).toBe(String(rest));
    expect(totals().eigenanteil).toBe(0);
    const card = screen.getByTestId("ah-fin-vp");
    await u.click(within(card).getByRole("button", { name: "Verhinderungspflege pro Monat mehr" }));
    expect(fin().ahVerhinderungspflegeMonat).toBe(String(Math.floor(rest / 10) * 10 + 10));
    await u.click(within(card).getByRole("button", { name: "Maximum" }));
    expect(fin().ahVerhinderungspflegeMonat).toBe("201.5");
    expect(within(card).getByRole("button", { name: "Verhinderungspflege pro Monat mehr" })).toBeDisabled();
    await u.click(within(card).getByRole("button", { name: "Verhinderungspflege pro Monat weniger" }));
    expect(fin().ahVerhinderungspflegeMonat).toBe("200");
    await u.click(within(card).getByRole("button", { name: "50 €" }));
    expect(within(card).getByRole("button", { name: "50 €" })).toHaveAttribute("aria-pressed", "true");
    for (let i = 0; i < 4; i++) await u.click(within(card).getByRole("button", { name: "Verhinderungspflege pro Monat weniger" }));
    expect(fin().ahVerhinderungspflegeMonat).toBe("10");
    expect(within(card).getByRole("button", { name: "Verhinderungspflege pro Monat weniger" })).toBeDisabled();
    await u.click(within(card).getByRole("button", { name: "Rest decken" }));
    expect(fin().ahVerhinderungspflegeMonat).toBe(String(rest));
    await u.click(tick(VP));
    expect(fin().ahVerhinderungspflegeMonat).toBe("0");
    expect(screen.queryByRole("button", { name: "Rest decken" })).toBeNull();
  });

  it("Verhinderungspflege: nothing left after the Entlastungsbetrag → a fresh tick starts at 50 €, „Rest decken“ is off", async () => {
    await open({ ...SETUP, ah: svc([HND("1:00", "Monatlich")]) });
    const u = user();
    await u.click(tick(VP));
    expect(fin().ahVerhinderungspflegeMonat).toBe("50");
    expect(within(screen.getByTestId("ah-fin-vp")).getByRole("button", { name: "Rest decken" })).toBeDisabled();
  });

  it("Umwidmung: tick, − / +, typed value; a non-number is refused inline and nothing is stored; leaving the page is never blocked", async () => {
    await open(SETUP);
    const u = user();
    expect(nb(screen.getByTestId("ah-fin-um").querySelector('[data-part="sub"]')?.textContent)).toBe("bewilligter Betrag pro Monat");
    await u.click(tick(UM));
    expect(fin()).toMatchObject({ ahUmwidmungBeantragt: "on", ahUmwidmungBetrag: "" });
    const card = screen.getByTestId("ah-fin-um");
    await u.click(within(card).getByRole("button", { name: "Umwidmung pro Monat mehr" }));
    expect(fin().ahUmwidmungBetrag).toBe("10");
    await typeUm(u, "87,50");
    expect(fin().ahUmwidmungBetrag).toBe("87.5");
    expect(totals().deductions.umwidmung).toBe(87.5);
    await typeUm(u, "1.250");
    expect(fin().ahUmwidmungBetrag).toBe("1250"); // no upper cap (as today)
    await u.type(screen.getByRole("textbox", { name: "Bewilligter Betrag in Euro" }), " Euro");
    expect(screen.getByTestId("ah-fin-um-error")).toHaveTextContent("Bitte einen Betrag in Euro eingeben, z. B. 120 oder 87,50.");
    expect(screen.getByRole("textbox", { name: "Bewilligter Betrag in Euro" })).toHaveAttribute("aria-invalid", "true");
    expect(fin().ahUmwidmungBetrag).toBe("1250");
    await u.click(within(card).getByRole("button", { name: "Umwidmung pro Monat weniger" }));
    expect(fin().ahUmwidmungBetrag).toBe("1240");
    expect(screen.queryByTestId("ah-fin-um-error")).toBeNull();
    await u.type(screen.getByRole("textbox", { name: "Bewilligter Betrag in Euro" }), "abc");
    await u.click(tick(UM)); // unticked: the amount stays stored (as today)
    expect(fin()).toMatchObject({ ahUmwidmungBetrag: "1240" });
    expect(fin().ahUmwidmungBeantragt).toBeUndefined();
    await u.click(navLink(/^Leistungen/));
    expect(await screen.findByTestId("ah-leistungen")).toBeInTheDocument();
  });

  it("checklist: folded, „Beratung · n von 7 besprochen“, today's seven labels, stored as today", async () => {
    await open(SETUP);
    const u = user();
    expect(screen.getByRole("button", { name: "Beratung · 0 von 7 besprochen" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: CHECKLIST[0]![1] })).toBeNull();
    await openChecklist(u);
    expect(within(screen.getByTestId("ah-fin-checklist")).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(CHECKLIST.map(([, l]) => l));
    await u.click(screen.getByRole("checkbox", { name: CHECKLIST[1]![1] }));
    await u.click(screen.getByRole("checkbox", { name: CHECKLIST[6]![1] }));
    expect(screen.getByRole("button", { name: "Beratung · 2 von 7 besprochen" })).toBeInTheDocument();
    expect(clean(fin())).toEqual({ ...TODAY_NEW, clVerhinderungGenutzt: "on", clKostenvoranschlag: "on" });
    await u.click(screen.getByRole("checkbox", { name: CHECKLIST[1]![1] }));
    expect(fin().clVerhinderungGenutzt).toBeUndefined();
  });

  it("Selbstzahler: no funding cards, the total block (net, MwSt, gross, Servicepauschale note) and one sentence; stored ticks kept", async () => {
    const stored = { ...TODAY_NEW, ahVerhinderungspflegeMonat: "100", clSteuerhinweis: "on" };
    const server = await open({ ...SETUP, Kundendaten: { payer: "Selbstzahler" }, Finanzierung: stored });
    expect(screen.queryByRole("checkbox", { name: EB })).toBeNull();
    expect(screen.queryByTestId("ah-fin-checklist")).toBeNull();
    expect(screen.getByTestId("ah-fin-sz")).toHaveTextContent("Für Selbstzahler werden keine Zuschüsse der Pflegekasse angerechnet.");
    const t = totals();
    expect(t.payer).toBe("Selbstzahler");
    const sum = screen.getByTestId("ah-fin-summary");
    expect(Array.from(sum.querySelectorAll('[data-part="line"]')).map((l) => nb(l.textContent))).toEqual([`Leistungen und Anfahrt pro Monat${nb(euro(t.net))}`, `zzgl. 7 % MwSt.${nb(euro(t.vat))}`]);
    expect(nb(sum.querySelector('[data-part="total"]')?.textContent)).toBe(`Gesamt pro Monat${nb(euro(t.gross))}`);
    expect(t.gross).toBe(Math.round((t.net + Math.round(t.net * 7) / 100) * 100) / 100);
    expect(nb(sum.querySelector('[data-part="note-pauschale"]')?.textContent)).toBe("Separate Direktrechnung — nicht im Gesamtbetrag. Servicepauschale Reinigungsutensilien für HnD: 1,20 € / Monat · inkl. MwSt. Jährliche Abrechnung, direkt mit dem Kunden.");
    expect(sum.querySelector('[data-part="note-steuer"]')).toBeNull();
    expect(totalShown()).toEqual([euro(t.gross), null]);
    expect(clean(fin())).toEqual(stored);
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "none"));
    expect(server.count("POST /api/price")).toBe(0);
  });

  it("no payer chosen = Kassenkunde: funding deducted", async () => {
    await open({ ...SETUP, Kundendaten: { payer: "" } });
    expect(totals().payer).toBe("Kassenkunde");
    expect(screen.getByRole("checkbox", { name: EB })).toBeChecked();
    expect(totals().deductions.entlastungsbetrag).toBe(131);
  });
});


describe("Pflegegrad (owner decision 1): defaults and warnings — nothing blocks", () => {
  const BASE_OFFER = { ah: svc([HND()]), Arbeitszeit: { travelTimeHHMM: "0:25", ahTravelZone: 3 }, Kundendaten: { payer: "Kassenkunde" } };

  it("a new offer starts untouched: nothing ticked, empty Finanzierung", async () => {
    await open({}, "Finanzierung");
    expect(offer().Finanzierung).toEqual({});
    expect(tick(EB)).not.toBeChecked();
  });

  it("answering the Pflegegrad ticks the Entlastungsbetrag of an untouched Finanzierung (only that key); „Nein“ unticks; „beantragt“ ticks", async () => {
    await open(BASE_OFFER);
    patch("Kundendaten", { hasPflegegrad: "Ja" });
    expect(offer().Finanzierung).toEqual({}); // a level is not chosen yet
    patch("Kundendaten", { pflegegrad: "2" });
    expect(offer().Finanzierung).toEqual({ ahEntlastungsbetragNutzen: "on" });
    expect(tick(EB)).toBeChecked();
    patch("Kundendaten", { hasPflegegrad: "Nein", pflegegrad: undefined });
    expect(offer().Finanzierung).toEqual({});
    patch("Kundendaten", { hasPflegegrad: "Ja", pflegegrad: "beantragt" });
    expect(offer().Finanzierung).toEqual({ ahEntlastungsbetragNutzen: "on" });
    expect(nb(screen.getByTestId("ah-fin-eb").querySelector('[data-part="sub"]')?.textContent)).toBe("131 € pro Monat · Pflegegrad beantragt");
    expect(screen.queryByTestId("ah-fin-eb-warn")).toBeNull();
  });

  it("a touched Finanzierung (any change on the page) is never changed by a Pflegegrad answer", async () => {
    await open(BASE_OFFER);
    const u = user();
    await openChecklist(u);
    await u.click(screen.getByRole("checkbox", { name: CHECKLIST[0]![1] }));
    expect(fin().ahVerhinderungspflegeMonat).toBe("0"); // touched
    patch("Kundendaten", { hasPflegegrad: "Ja", pflegegrad: "3" });
    expect(fin().ahEntlastungsbetragNutzen).toBeUndefined();
    await u.click(tick(EB));
    patch("Kundendaten", { hasPflegegrad: "Nein", pflegegrad: undefined });
    expect(fin().ahEntlastungsbetragNutzen).toBe("on");
  });

  it.each([
    ["untouched, with a Pflegegrad", { payer: "Kassenkunde", date: "2026-11-01", hasPflegegrad: "Ja", pflegegrad: "3" }, {}],
    ["ticked without a Pflegegrad (today's default)", { payer: "Kassenkunde", date: "2026-11-01", hasPflegegrad: "Nein" }, TODAY_NEW],
    ["no Finanzierung at all", { payer: "Kassenkunde", date: "2026-11-01", hasPflegegrad: "Ja", pflegegrad: "2" }, undefined],
  ] as const)("stored offer %s: opening writes nothing", async (_n, kd, f) => {
    const payload: F = { activeOffer: "ah", ...BASE_OFFER, Kundendaten: kd, ...(f ? { Finanzierung: f } : {}) };
    await openStored(structuredClone(payload));
    await new Promise((r) => setTimeout(r, 200));
    expect(useOfferStore.getState().version).toBe(0);
    expect(offer().Finanzierung).toEqual(payload.Finanzierung);
  });

  it("warnings: „Kein Pflegegrad hinterlegt“ / „Erst ab Pflegegrad 2“ in warning colours; the ticks still work and deduct; step list warns", async () => {
    await open({ ...BASE_OFFER, Kundendaten: { payer: "Kassenkunde", hasPflegegrad: "Nein" } });
    const u = user();
    await u.click(tick(EB));
    const ebWarn = screen.getByTestId("ah-fin-eb-warn");
    expect(ebWarn).toHaveTextContent("Kein Pflegegrad hinterlegt");
    expect(ebWarn.querySelector('[data-part="warning"]')!.className).toMatch(/text-warning-strong/);
    expect(totals().deductions.entlastungsbetrag).toBe(131); // the price follows the tick
    await setVp(u, 100);
    expect(screen.getByTestId("ah-fin-vp-warn")).toHaveTextContent("Kein Pflegegrad hinterlegt");
    expect(totals().deductions.verhinderungspflege).toBe(100);
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "warn"));
    patch("Kundendaten", { hasPflegegrad: "Ja", pflegegrad: "1" });
    expect(screen.queryByTestId("ah-fin-eb-warn")).toBeNull();
    expect(screen.getByTestId("ah-fin-vp-warn")).toHaveTextContent("Erst ab Pflegegrad 2");
    patch("Kundendaten", { pflegegrad: "2" });
    expect(screen.queryByTestId("ah-fin-vp-warn")).toBeNull();
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "done"));
  });

  it("two persons: × 2 as today; without the second person's Pflegegrad a warning, the amount unchanged", async () => {
    await open({ ...BASE_OFFER, Kundendaten: { payer: "Kassenkunde", hasPflegegrad: "Ja", pflegegrad: "3", ahZweiPersonen: "on" }, Finanzierung: TODAY_NEW });
    expect(nb(screen.getByTestId("ah-fin-eb").querySelector('[data-part="sub"]')?.textContent)).toBe("262 € pro Monat · 2 Personen · Pflegegrad 3");
    expect(screen.getByTestId("ah-fin-eb-warn")).toHaveTextContent("Pflegegrad der 2. Person fehlt");
    expect(totals().deductions.entlastungsbetrag).toBe(262);
    patch("Kundendaten", { p2Pflegegrad: "2" });
    expect(screen.queryByTestId("ah-fin-eb-warn")).toBeNull();
  });
});

describe("budget mode and step status", () => {
  it("budget mode on Leistungen re-fits when the Entlastungsbetrag tick changes here", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:15", ahTravelZone: 2 }, Kundendaten: { payer: "Kassenkunde" } }, "ah");
    patch("Kundendaten", { hasPflegegrad: "Ja", pflegegrad: "2" }); // → Entlastungsbetrag ticked (decision 1)
    const u = user();
    expect(screen.getByRole("checkbox", { name: /Im Budget bleiben/ })).toBeChecked();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const dauer = () => (offer().ah.services as F[])[0]!.schedules[0].dauer as string;
    const fitted = dauer();
    expect(fitted).not.toBe("1:00");
    expect(totals().net).toBeLessThanOrEqual(131);
    await u.click(navLink(/^Finanzierung/));
    await screen.findByTestId("ah-finanzierung");
    await u.click(tick(EB));
    expect(dauer()).toBe("1:00"); // no budget → the own duration back
    await u.click(tick(EB));
    expect(dauer()).toBe(fitted);
  });

  it("step list: open for an untouched offer, done once a source is ticked or the page used, none for a Selbstzahler", async () => {
    await open({ ah: svc([HND()]), Kundendaten: { payer: "Kassenkunde" } });
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "open"));
    patch("Kundendaten", { hasPflegegrad: "Ja", pflegegrad: "3" });
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "done"));
    const u = user();
    await u.click(tick(EB));
    expect(fin().ahEntlastungsbetragNutzen).toBeUndefined();
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "done")); // touched
    patch("Kundendaten", { payer: "Selbstzahler" });
    await waitFor(() => expect(navLink(/^Finanzierung/)).toHaveAttribute("data-state", "none"));
  });
});

describe("rules", () => {
  it.each([["120", 120], ["87,50", 87.5], ["87.5", 87.5], ["1.250,50", 1250.5], ["1250", 1250], ["", 0], [" 40 € ", 40], ["abc", null], ["12,345", null], ["-5", null], ["1,2,3", null]] as const)("parseEuroInput(%j) = %j", (s, n) => expect(parseEuroInput(s)).toBe(n));
  it.each([[0, 1, 10], [37.42, 1, 40], [37.42, -1, 30], [200, 1, 201.5], [201.5, -1, 200], [10, -1, 10]] as const)("stepAmount(%d, %d) = %d", (v, d, r) => expect(stepAmount(v, d as 1 | -1, 201.5)).toBe(r));
});
