// Alltagshilfe · Leistungen (UX-CHANGES U-048). The page is redesigned, but for the same choices it
// must store what today's page stores and price what today's computeAHGesamt prices.
// Reference: fixtures/ah-leistungen.json, recorded from today's UI by v2/scripts/capture-ah-leistungen.cjs.
// Old offers: real (anonymised) AH payloads, tests/golden/fixtures/ah/{payloads,restore}.json.
import { ahInputFromPayload, ahOfferTotals, computeAhPricing } from "@oc/pricing";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openVariantPanel, useOfferStore } from "../src/features/offer/index.js";
import { BUILT_STEPS } from "../src/features/offer/steps.js";
import { euro } from "../src/shared/lib/format.js";
import { TASKS, summaryOf } from "../src/features/steps/ah/rules.js";
import oldOffers from "./fixtures/ah-old-offers.json" with { type: "json" };
import reference from "./fixtures/ah-leistungen.json" with { type: "json" };
import { BASE, fakeServer, renderApp } from "./helpers.js";

type F = Record<string, any>;
const KEY = "t-0123456789abcdef01234567";
const CONFIG = { ENTLASTUNGSBETRAG_MONAT: 131, STEUERABSETZ_PCT: 20, STEUERABSETZ_CAP_JAHR: 4000 };
const CFG = { entlastungsbetragMonat: 131, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };
const PAYLOADS = oldOffers.payloads as unknown as { id: string; payload: F }[];
const RESTORED = oldOffers.restored as unknown as { id: string; expected: F }[];

const offer = () => useOfferStore.getState().offer as F;
const ah = () => offer().ah as F;
const patch = (section: string, fields: F) => act(() => { (useOfferStore.getState().patch as any)(section, fields); });
const card = (k: "hnd" | "ab") => screen.getByTestId(`ah-svc-${k}`);
const handlers = (draft?: F) => ({
  ...BASE, "GET /admin/api/config/public": { body: CONFIG },
  ...(draft ? { "GET /api/deals/*/draft": { body: { dealId: "4711", revision: 3, offerType: "ah", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "ap@example.test" } } } : {}),
});
async function open(setup: F = {}) {
  const server = fakeServer(handlers());
  renderApp(`/deal/${KEY}/ah/ah`);
  await screen.findByTestId("ah-leistungen");
  // today's new offer has the Entlastungsbetrag ticked; since U-050 (owner 2026-11-20) a new offer
  // starts unticked and the tick follows the Pflegegrad — these tests start from today's state
  patch("Finanzierung", { ahEntlastungsbetragNutzen: "on" });
  for (const [s, f] of Object.entries(setup)) patch(s, f as F);
  return server;
}
async function openStored(payload: F, step = "ah") {
  const server = fakeServer(handlers(payload));
  renderApp(`/deal/4711/ah/${step}`);
  await screen.findByTestId(step === "ah" ? "ah-leistungen" : "ah-total");
  return server;
}
const user = () => userEvent.setup();
const durationOf = (k: "hnd" | "ab", j = 0) => {
  const box = within(card(k)).getByTestId(`ah-${k}-row-${j}`);
  return (box.querySelector('[data-part="value"]') ?? box.querySelector(`[data-testid="ah-${k}-auto-${j}"] span`))?.textContent ?? "";
};
async function setDuration(u: ReturnType<typeof user>, k: "hnd" | "ab", target: string) {
  const [h, m] = target.split(":").map(Number);
  const want = h! * 60 + m!;
  for (let n = 0; n < 40; n++) {
    const [ch, cm] = durationOf(k).replace(" Std.", "").split(":").map(Number);
    const now = ch! * 60 + cm!;
    if (now === want) return;
    await u.click(within(card(k)).getByRole("button", { name: now < want ? "Dauer pro Einsatz länger" : "Dauer pro Einsatz kürzer" }));
  }
  throw new Error(`duration ${target} not reached`);
}
const LABEL: Record<string, string> = { "alle drei Wochen": "Alle drei Wochen" };
async function setRhythm(u: ReturnType<typeof user>, k: "hnd" | "ab", value: string) {
  const more = within(card(k)).queryByRole("button", { name: "Weitere" });
  if (more && ["Vierteljährlich", "Halbjährlich", "Jährlich"].includes(value)) await u.click(more);
  await u.click(within(card(k)).getByRole("radio", { name: LABEL[value] ?? value }));
}
const nb = (t: string) => t.replace(/\u00a0/g, " ");
const totalShown = () => { const t = screen.getAllByTestId("ah-total")[0]!; return [t.querySelector('[data-part="gesamt"]')?.textContent, t.querySelector('[data-part="eigenanteil"]')?.textContent ?? null]; };

describe("Leistungen stores and prices what today's page does for the same choices", () => {
  it("the recording is there and varied", () => {
    expect(reference.scenarios.length).toBeGreaterThanOrEqual(8);
  });
  it.each(reference.scenarios.map((s) => [s.name, s] as const))("%s", async (_name, s) => {
    const sc = s as unknown as F;
    const server = await open({ Arbeitszeit: { travelTimeHHMM: sc.Arbeitszeit.travelTimeHHMM, ahTravelZone: sc.Arbeitszeit.ahTravelZone }, Kundendaten: { payer: sc.Kundendaten.payer } });
    const u = user();
    // today's page starts without budget mode; the new page starts with it (U-048) → off first
    const auto = screen.queryByRole("checkbox", { name: /Im Budget bleiben/ });
    if (auto && (auto as HTMLInputElement).checked) await u.click(auto);
    for (const [kind, a, b] of sc.steps as string[][]) {
      if (kind === "travel" || kind === "payer") continue; // set up above
      if (kind === "add" || kind === "remove") await u.click(screen.getByRole("checkbox", { name: new RegExp(a === "hnd" ? "^Haushaltsnahe Dienstleistungen" : "^Alltagsbegleitung") }));
      else if (kind === "dauer") await setDuration(u, a as "hnd", b!);
      else if (kind === "rh") await setRhythm(u, a as "hnd", b!);
      else if (kind === "task") await u.click(within(card(a as "hnd")).getByRole("checkbox", { name: TASKS[a as "hnd"].find((t) => t.id === b)!.label }));
      else if (kind === "combined") await u.click(screen.getByRole("checkbox", { name: /Beides im selben Termin/ }));
      else throw new Error(kind);
    }
    const { ahEntlastungAuto: _a, sketch: _s, ...stored } = ah();
    expect(stored).toEqual(sc.ah);
    expect(stored.ahServicesJson).toBe(sc.ah.ahServicesJson); // byte for byte
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect([p.gesamt, p.eigenanteil, p.allBase]).toEqual([sc.price.gesamt, sc.price.eigenanteil, sc.price.allBase]);
    // ADR 028 (owner 2026-11-20): one total — a Selbstzahler sees net + 7 % MwSt, the Servicepauschale
    // only as a note (today: net + 1,20 €); a Kassenkunde exactly today's numbers
    const t = ahOfferTotals(ahInputFromPayload(offer(), CFG));
    if (sc.Kundendaten.payer === "Selbstzahler") expect(t.net).toBe(sc.price.allBase);
    else expect([t.gross, t.eigenanteil]).toEqual([sc.price.gesamt, sc.price.eigenanteil]);
    expect(totalShown()).toEqual([euro(t.gross), sc.Kundendaten.payer === "Selbstzahler" ? null : euro(sc.price.eigenanteil)]);
    expect(server.count("POST /api/price")).toBe(0);
  });
});

describe("controls", () => {
  it("ticking a service: Wöchentlich, 1:00, no task; unticking keeps its settings for a re-tick", async () => {
    await open({ Kundendaten: { payer: "Selbstzahler" } });
    const u = user();
    expect(screen.queryByTestId("ah-hnd-row-0")).toBeNull();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    expect(within(card("hnd")).getByRole("radio", { name: "Wöchentlich" })).toBeChecked();
    expect(durationOf("hnd")).toBe("1:00 Std.");
    await setRhythm(u, "hnd", "Monatlich");
    await setDuration(u, "hnd", "2:30");
    await u.click(within(card("hnd")).getByRole("checkbox", { name: "Fenster putzen" }));
    const before = ah().ahServicesJson;
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    expect(ah().services).toEqual([]);
    expect(ah().ahServicesJson).toBe("[]");
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    expect(ah().ahServicesJson).toBe(before);
    expect(within(card("hnd")).getByText("Aufgaben · 1 gewählt")).toBeInTheDocument();
  });

  it("rhythm chips: four, „Weitere“ shows three more; a stored „Einmalig“ shows as its own chip", async () => {
    await open();
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Alltagsbegleitung/ }));
    const names = () => within(card("ab")).getAllByRole("radio").map((r) => r.getAttribute("value"));
    expect(names()).toEqual(["Wöchentlich", "14-tägig", "alle drei Wochen", "Monatlich"]);
    expect(within(card("ab")).getByRole("radio", { name: "Alle drei Wochen" })).toBeInTheDocument();
    await u.click(within(card("ab")).getByRole("button", { name: "Weitere" }));
    expect(names()).toEqual(["Wöchentlich", "14-tägig", "alle drei Wochen", "Monatlich", "Vierteljährlich", "Halbjährlich", "Jährlich"]);
    expect(names()).not.toContain("Einmalig");
    const json = JSON.stringify([{ type: "Alltagsbegleitung", schedules: [{ dauer: "2:00", regelmaessigkeit: "Einmalig" }], tasks: [], combinedVisit: false }]);
    patch("ah", { ahServicesJson: json, services: JSON.parse(json) });
    expect(within(card("ab")).getByRole("radio", { name: "Einmalig" })).toBeChecked();
  });

  it("stepper: 15-minute steps within 0:15–8:00; a value off the grid goes to the next grid value", async () => {
    await open({ Kundendaten: { payer: "Selbstzahler" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const down = () => within(card("hnd")).getByRole("button", { name: "Dauer pro Einsatz kürzer" });
    const up = () => within(card("hnd")).getByRole("button", { name: "Dauer pro Einsatz länger" });
    await u.click(down()); await u.click(down()); await u.click(down());
    expect(durationOf("hnd")).toBe("0:15 Std.");
    expect(down()).toBeDisabled();
    await setDuration(u, "hnd", "8:00");
    expect(up()).toBeDisabled();
    expect(ah().services[0].schedules[0].dauer).toBe("8:00");
    const json = JSON.stringify([{ type: "Haushaltsnahedienstleistungen", schedules: [{ dauer: "1:25", regelmaessigkeit: "Monatlich" }], tasks: [], combinedVisit: false }]);
    patch("ah", { ahServicesJson: json, services: JSON.parse(json) });
    await u.click(up());
    expect(durationOf("hnd")).toBe("1:30 Std.");
    await u.click(down()); await u.click(down());
    expect(durationOf("hnd")).toBe("1:00 Std.");
  });

  it("task lists: today's ids and labels, stored in list order", async () => {
    await open({ Kundendaten: { payer: "Selbstzahler" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Alltagsbegleitung/ }));
    expect(within(screen.getByTestId("ah-hnd-tasks")).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(TASKS.hnd.map((t) => t.label));
    expect(within(screen.getByTestId("ah-ab-tasks")).getAllByRole("checkbox")).toHaveLength(11);
    expect(TASKS.hnd).toHaveLength(10);
    await u.click(within(card("ab")).getByRole("checkbox", { name: "Vorlesen (Zeitung, Bücher)" }));
    await u.click(within(card("ab")).getByRole("checkbox", { name: "Begleitung zu Arztterminen" }));
    expect(ah().services[0].tasks).toEqual(["arzttermine", "vorlesen"]);
    expect(within(card("ab")).getByText("Aufgaben · 2 gewählt")).toBeInTheDocument();
  });

  it("„Beides im selben Termin“ only with both services; saves one Anfahrt and travel time", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:25" }, Kundendaten: { payer: "Selbstzahler" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    expect(screen.queryByRole("checkbox", { name: /Beides im selben Termin/ })).toBeNull();
    await u.click(screen.getByRole("checkbox", { name: /^Alltagsbegleitung/ }));
    const both = screen.getByRole("checkbox", { name: /Beides im selben Termin – nur eine Anfahrt/ });
    const p0 = computeAhPricing(ahInputFromPayload(offer(), CFG)).gesamt;
    await u.click(both);
    expect(ah().services.map((s: F) => [s.type, s.combinedVisit])).toEqual([["Alltagsbegleitung", true], ["Haushaltsnahedienstleistungen", false]]);
    const p1 = computeAhPricing(ahInputFromPayload(offer(), CFG)).gesamt;
    // weekly: 4,33 Anfahrten (7,96 €) and 4,33 × 30 min AB travel time (53,04 €/h) less
    expect(p0 - p1).toBeCloseTo((52 / 12) * (7.96 + 0.5 * 53.04), 1);
  });

  it("notes: one line until tapped, stored as ahNote", async () => {
    await open();
    const u = user();
    const note = screen.getByLabelText("Notizen") as HTMLTextAreaElement;
    expect(note.rows).toBe(1);
    await u.click(note);
    expect(note.rows).toBe(5);
    await u.type(note, "Schlüssel beim Nachbarn");
    expect(ah().ahNote).toBe("Schlüssel beim Nachbarn");
  });
});

describe("budget mode", () => {
  const svcs = () => ah().services as F[];
  const minutes = (d: string) => { const [h, m] = d.split(":").map(Number); return h! * 60 + m!; };

  it("a new offer starts with it; the first service is fitted and „automatisch“; off → own durations back", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:15" } });
    const u = user();
    expect(screen.getByRole("checkbox", { name: /Im Budget bleiben – Dauer passt sich an/ })).toBeChecked();
    expect(screen.getByTestId("ah-pill")).toHaveTextContent("Leistung wählen");
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    expect(ah().ahEntlastungAuto).toBe("on");
    await setRhythm(u, "hnd", "14-tägig");
    const fitted = svcs()[0]!.schedules[0].dauer;
    expect(within(card("hnd")).getByTestId("ah-hnd-auto-0")).toHaveTextContent(`${fitted} Std.automatisch`);
    expect(within(card("hnd")).queryByRole("button", { name: /Dauer pro Einsatz/ })).toBeNull();
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(p.gesamt).toBeLessThanOrEqual(131);
    expect(screen.getByTestId("ah-pill")).toHaveTextContent(nb(`Rest ${euro(131 - p.gesamt)}`));
    expect(screen.getByTestId("ah-pill")).toHaveAttribute("data-kind", "ok");
    // budget mode off → the duration the service had before (1:00)
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    expect(ah().ahEntlastungAuto).toBeUndefined();
    expect(svcs()[0]!.schedules[0].dauer).toBe("1:00");
    expect(within(card("hnd")).getByRole("button", { name: "Dauer pro Einsatz länger" })).toBeInTheDocument();
    // a manual change, then on again: fitted from the new own duration; off again: that one back
    await setDuration(u, "hnd", "3:00");
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    expect(svcs()[0]!.schedules[0].dauer).toBe(fitted);
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    expect(svcs()[0]!.schedules[0].dauer).toBe("3:00");
  });

  it("re-fits on each trigger: service, rhythm, same visit, travel zone, payer, 2 Personen, Entlastungsbetrag", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:15" } });
    const u = user();
    const total = () => computeAhPricing(ahInputFromPayload(offer(), CFG)).gesamt;
    const fit = () => svcs().map((s) => s.schedules[0].dauer).join(" ");
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    await setRhythm(u, "hnd", "14-tägig");
    const a = fit();
    await u.click(screen.getByRole("checkbox", { name: /^Alltagsbegleitung/ })); // service
    await setRhythm(u, "ab", "Monatlich"); // rhythm
    const b = fit();
    expect(b).not.toBe(a);
    expect(total()).toBeLessThanOrEqual(131);
    await u.click(screen.getByRole("checkbox", { name: /Beides im selben Termin/ })); // same visit
    const c = fit();
    expect(c).not.toBe(b);
    expect(total()).toBeLessThanOrEqual(131);
    patch("Arbeitszeit", { travelTimeHHMM: "0:45" }); // zone 5
    const d = fit();
    expect(d).not.toBe(c);
    expect(total()).toBeLessThanOrEqual(131);
    patch("Kundendaten", { ahZweiPersonen: "on" }); // 262 €
    await waitFor(() => expect(screen.getByTestId("ah-budget")).toHaveTextContent("von 262,00 €"));
    const e = fit();
    expect(e.split(" ").map(minutes).reduce((x, y) => x + y)).toBeGreaterThan(d.split(" ").map(minutes).reduce((x, y) => x + y));
    expect(total()).toBeLessThanOrEqual(262);
    expect(total()).toBeGreaterThan(200);
    // Entlastungsbetrag not applied: no budget → own durations, a hint to Finanzierung
    patch("Finanzierung", { ahEntlastungsbetragNutzen: undefined });
    expect(fit()).toBe("1:00 1:00");
    expect(screen.getByTestId("ah-budget")).toHaveTextContent("Gesamt pro Monat");
    expect(within(screen.getByTestId("ah-budget")).getByRole("link", { name: "Finanzierung" })).toHaveAttribute("href", expect.stringContaining("/deal/" + KEY + "/ah/Finanzierung"));
    expect(screen.queryByRole("checkbox", { name: /Im Budget bleiben/ })).toBeNull();
    patch("Finanzierung", { ahEntlastungsbetragNutzen: "on" });
    expect(fit()).toBe(e);
    // Selbstzahler: no budget, the monthly total only
    patch("Kundendaten", { payer: "Selbstzahler" });
    expect(fit()).toBe("1:00 1:00");
    expect(screen.getByTestId("ah-budget")).toHaveTextContent("Gesamt pro Monat");
    expect(screen.queryByRole("checkbox", { name: /Im Budget bleiben/ })).toBeNull();
    expect(ah().ahEntlastungAuto).toBe("on"); // kept for when the payer changes back
    patch("Kundendaten", { payer: "Kassenkunde" });
    expect(fit()).toBe(e);
  });

  it("over budget without budget mode: „Zuzahlung“ (warning colours), not a step warning", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:25" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(screen.getByTestId("ah-pill")).toHaveTextContent(nb(`Zuzahlung ${euro(p.gesamt - 131)}`));
    expect(screen.getByTestId("ah-pill")).toHaveAttribute("data-kind", "over");
    const link = within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: /^Leistungen/ });
    await waitFor(() => expect(link).toHaveAttribute("data-state", "done"));
  });

  // owner 2026-11-23: the card must say what the offer says — every source ticked on Finanzierung counts
  const FIN = (vp: string, um?: string) => ({ ahEntlastungsbetragNutzen: "on", ahVerhinderungspflegeMonat: vp, ...(um ? { ahUmwidmungBeantragt: "on", ahUmwidmungBetrag: um } : {}) });

  it("all sources count: Verhinderungspflege and Umwidmung cover the rest → „Rest“, not „Zuzahlung“ (Eigenanteil 0, as the offer prints)", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:25" }, Finanzierung: FIN("200", "60") });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(p.gesamt).toBeGreaterThan(131);
    expect(p.eigenanteil).toBe(0);
    const c = screen.getByTestId("ah-budget");
    expect(c.querySelector('[data-part="label"]')).toHaveTextContent("Zuschüsse pro Monat");
    expect(c).toHaveTextContent(nb(`von ${euro(391)}`));
    expect(c.querySelector('[data-part="sources"]')).toHaveTextContent(nb(`Entlastungsbetrag ${euro(131)} · Verhinderungspflege ${euro(200)} · Umwidmung ${euro(60)}`));
    expect(screen.getByTestId("ah-pill")).toHaveTextContent(nb(`Rest ${euro(391 - p.gesamt)}`));
    expect(screen.getByTestId("ah-pill")).toHaveAttribute("data-kind", "ok");
  });

  it("sources that do not cover the total: „Zuzahlung“ is the Eigenanteil after all sources", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:25" }, Finanzierung: FIN("50") });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(p.eigenanteil).toBeGreaterThan(0);
    expect(p.eigenanteil).toBeCloseTo(p.gesamt - 181, 2);
    expect(screen.getByTestId("ah-pill")).toHaveTextContent(nb(`Zuzahlung ${euro(p.eigenanteil)}`));
    expect(screen.getByTestId("ah-budget")).toHaveTextContent(nb(`von ${euro(181)}`));
  });

  it("only the Entlastungsbetrag: label and figures as before, no sources line", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:15" } });
    const c = screen.getByTestId("ah-budget");
    expect(c.querySelector('[data-part="label"]')).toHaveTextContent("Entlastungsbetrag pro Monat");
    expect(c.querySelector('[data-part="sources"]')).toBeNull();
    expect(c).toHaveTextContent(nb(`von ${euro(131)}`));
  });

  it("budget mode fits the durations to all sources, not only the Entlastungsbetrag", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:15" }, Finanzierung: FIN("100") });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    await setRhythm(u, "hnd", "14-tägig");
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(p.gesamt).toBeLessThanOrEqual(231);
    expect(p.gesamt).toBeGreaterThan(131);
    expect(p.eigenanteil).toBe(0);
    expect(screen.getByTestId("ah-pill")).toHaveAttribute("data-kind", "ok");
  });

  it("nothing fits even at 5 minutes: own durations with − / +, „Zuzahlung“ shown honestly, never 0 minutes", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:45" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Alltagsbegleitung/ }));
    expect(svcs().map((s) => s.schedules[0].dauer)).toEqual(["1:00", "1:00"]);
    expect(screen.getByTestId("ah-pill")).toHaveAttribute("data-kind", "over");
    expect(within(card("hnd")).getByRole("button", { name: "Dauer pro Einsatz kürzer" })).toBeInTheDocument();
  });

  it("summary: the minus lines add up to the Eigenanteil; Selbstzahler: net, MwSt, gross; Servicepauschale as a note (ADR 028)", async () => {
    await open({ Arbeitszeit: { travelTimeHHMM: "0:25" }, Finanzierung: { ahVerhinderungspflegeMonat: "50" } });
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    const sum = screen.getByTestId("ah-summary");
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(Array.from(sum.querySelectorAll('[data-part="line"]')).map((l) => l.textContent)).toEqual([`Leistungen und Anfahrt pro Monat${euro(p.gesamt)}`, `Entlastungsbetrag− ${euro(131)}`, `Verhinderungspflege− ${euro(50)}`]);
    expect(sum.querySelector('[data-part="total"]')).toHaveTextContent(nb(`Eigenanteil pro Monat${euro(p.eigenanteil)}`));
    expect(Math.round((p.gesamt - 131 - 50) * 100) / 100).toBe(p.eigenanteil);
    patch("Kundendaten", { payer: "Selbstzahler" });
    const q = ahOfferTotals(ahInputFromPayload(offer(), CFG));
    expect(Array.from(screen.getByTestId("ah-summary").querySelectorAll('[data-part="line"]')).map((l) => l.textContent)).toEqual([`Leistungen und Anfahrt pro Monat${euro(q.net)}`, `zzgl. 7 % MwSt.${euro(q.vat)}`]);
    expect(screen.getByTestId("ah-summary").querySelector('[data-part="total"]')).toHaveTextContent(nb(`Gesamt pro Monat${euro(q.gross)}`));
    expect(summaryOf(q, euro).total.value).toBe(Math.round((q.net + Math.round(q.net * 7) / 100) * 100) / 100);
    expect(screen.getByTestId("ah-summary").querySelector('[data-part="note-pauschale"]')).toHaveTextContent(/Separate Direktrechnung — nicht im Gesamtbetrag\. Servicepauschale Reinigungsutensilien für HnD: 1,20.€ \/ Monat/);
  });
});

describe("old offers open, show and price as stored — and stay unchanged", () => {
  const CASES = ["ah-offer-b6e37653", "ah-offer-97ca8e12", "ah-offer-20b197e6", "ah-offer-20b18d79", "ah-offer-114d7198", "ah-offer-4cfe26f6", "ah-draft-e8fb9bc8", "ah-offer-114dbb2e"];
  it.each(CASES)("%s", async (id) => {
    const payload = PAYLOADS.find((c) => c.id === id)!.payload;
    const expected = RESTORED.find((c) => c.id === id)!.expected;
    const server = await openStored(structuredClone(payload));
    const services = (() => { try { return JSON.parse(payload.ah.ahServicesJson) as F[]; } catch { return []; } })();
    for (const [k, type] of [["hnd", "Haushaltsnahedienstleistungen"], ["ab", "Alltagsbegleitung"]] as const) {
      const s = services.find((x) => (x.type || "Alltagsbegleitung") === type);
      expect(screen.getByRole("checkbox", { name: new RegExp(k === "hnd" ? "^Haushaltsnahe" : "^Alltagsbegleitung") })).toHaveProperty("checked", !!s);
      if (!s) continue;
      s.schedules.forEach((r: F, j: number) => {
        expect(durationOf(k, j)).toBe(r.dauer ? `${r.dauer} Std.` : "–");
        const chosen = within(within(card(k)).getByTestId(`ah-${k}-row-${j}`)).queryAllByRole("radio").find((x) => (x as HTMLInputElement).checked);
        expect(chosen?.getAttribute("value") ?? "").toBe(r.regelmaessigkeit);
      });
      expect(within(card(k)).getByText(`Aufgaben · ${s.tasks.filter((t: unknown) => typeof t === "string").length} gewählt`)).toBeInTheDocument();
    }
    // ADR 028: a Selbstzahler's total is net + 7 % MwSt (today: + 1,20 €); a Kassenkunde's as today
    const isSz = expected.isSelbstzahler === true;
    const net = isSz ? expected.allBase : expected.gesamt;
    expect(totalShown()[0]).toBe(euro(isSz ? Math.round((net + Math.round(net * 7) / 100) * 100) / 100 : net));
    await new Promise((r) => setTimeout(r, 300));
    expect(ah()).toEqual(payload.ah);
    expect(useOfferStore.getState().version).toBe(0);
    expect(server.count("POST /api/price")).toBe(0);
  });

  it("ahEntlastungAuto is restored: an old offer with it shows budget mode on", async () => {
    await openStored(structuredClone(PAYLOADS.find((c) => c.id === "ah-offer-b6e37653")!.payload));
    expect(screen.getByRole("checkbox", { name: /Im Budget bleiben/ })).toBeChecked();
    expect(screen.getByTestId("ah-hnd-auto-0")).toHaveTextContent("1:30 Std.automatisch");
  });

  it("the older nested format shows its time rows (v2 fix FINDINGS-AH #2) and prices them", async () => {
    const payload = PAYLOADS.find((c) => c.id === "ah-draft-91fcd12b")!.payload;
    await openStored(structuredClone(payload));
    const p = computeAhPricing(ahInputFromPayload(payload, CFG));
    expect(p.gesamt).toBeGreaterThan(0);
    expect(totalShown()[0]).toBe(euro(ahOfferTotals(ahInputFromPayload(payload, CFG)).gross)); // a Selbstzahler: net + 7 % (ADR 028)
    expect(durationOf("hnd")).toBe("4:00 Std.");
    expect(within(card("hnd")).getByRole("radio", { name: "Monatlich" })).toBeChecked();
    expect(within(card("hnd")).getByRole("checkbox", { name: /^Wohnungsreinigung/ })).toBeChecked();
    expect(ah()).toEqual(payload.ah);
  });

  it("an offer with two time rows shows both, prices both, and a row can be removed down to one", async () => {
    const payload = structuredClone(PAYLOADS.find((c) => c.id === "ah-offer-4cfe26f6")!.payload);
    await openStored(payload);
    const k = JSON.parse(payload.ah.ahServicesJson)[0].type === "Alltagsbegleitung" ? "ab" : "hnd";
    expect(within(card(k)).getByText("Zeit 1")).toBeInTheDocument();
    expect(within(card(k)).getByText("Zeit 2")).toBeInTheDocument();
    const u = user();
    await u.click(within(card(k)).getByRole("button", { name: "Zeit 2 entfernen" }));
    expect(ah().services[0].schedules).toHaveLength(1);
    expect(within(card(k)).queryByRole("button", { name: /entfernen/ })).toBeNull();
  });
});

describe("frame", () => {
  it("the step is built and routed; Kosten stays in today's view", async () => {
    expect(BUILT_STEPS.get("ah")).toBe("complete");
    expect(BUILT_STEPS.get("Finanzierung")).toBe("complete");
    expect(BUILT_STEPS.has("Kosten") && BUILT_STEPS.get("Kosten")).toBe("partly");
    await open();
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: /^Leistungen/ })).toHaveAttribute("data-state", "open"));
  });

  it("shell total for AH: Gesamt / Monat and Eigenanteil from the browser, no price request", async () => {
    const server = await open({ Arbeitszeit: { travelTimeHHMM: "0:25" } });
    expect(totalShown()).toEqual([euro(0), euro(0)]);
    const u = user();
    await u.click(screen.getByRole("checkbox", { name: /Im Budget bleiben/ }));
    await u.click(screen.getByRole("checkbox", { name: /^Haushaltsnahe Dienstleistungen/ }));
    await setRhythm(u, "hnd", "14-tägig");
    const p = computeAhPricing(ahInputFromPayload(offer(), CFG));
    expect(totalShown()).toEqual([euro(p.gesamt), euro(p.eigenanteil)]);
    expect(screen.getAllByText("Gesamt / Monat").length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 400));
    expect(server.count("POST /api/price")).toBe(0);
    await waitFor(() => expect(within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: /^Leistungen/ })).toHaveAttribute("data-state", "done"));
  });

  it("Finanzierung (built in slice 2) opens with the AH total", async () => {
    await openStored(structuredClone(PAYLOADS.find((c) => c.id === "ah-offer-97ca8e12")!.payload), "Finanzierung");
    expect(await screen.findByTestId("ah-finanzierung")).toBeInTheDocument();
    expect(totalShown()[0]).toBe(euro(137.02));
  });

  it("Badumbau keeps its server total (Gesamt from the price answer)", async () => {
    const server = fakeServer({ ...BASE });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await waitFor(() => expect(nb(screen.getByRole("group", { name: "Schrittleiste" }).textContent ?? "")).toContain("Gesamt10,00 €"));
    expect(screen.queryByTestId("ah-total")).toBeNull();
    expect(server.count("POST /api/price")).toBeGreaterThan(0);
  });

  it("„Weiteres Angebot für diesen Kunden“ has its visible text as its name", async () => {
    await open();
    act(() => openVariantPanel());
    expect(await screen.findByRole("button", { name: "Weiteres Angebot für diesen Kunden" })).toBeInTheDocument();
  });
});
