// Hauptmenü, planning part: today's list, the offer from an appointment (replay of today's UI,
// fixtures/home-planung.json), search, „Termin hat nicht statt gefunden“, the week calendar.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { badge, departure, enrichmentOf, enrichmentPatch, fullRouteHref, parseAddress, parseName, pause, searchEntries, todayEntries, weekView, type PlanningEntry } from "../src/features/home/planning-rules.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";
// @ts-expect-error — the capture script is the shared test data (CommonJS)
import { weekPayload, CONTACT } from "../../../scripts/capture-home-planung.cjs";
import fixture from "./fixtures/home-planung.json";

const week = () => weekPayload() as { planning: Record<string, any> };
const inWeek = () => week().planning.days.reduce((n: number, d: any) => n + d.customers.length, 0); // 3 of today + 1 on another day (weekend: 1)
const termine = (n: number) => `${n} Termin${n !== 1 ? "e" : ""}`;
const HANDLERS = (bitrix: unknown) => ({
  ...BASE,
  "GET /api/planning/current": { body: week() },
  "GET /api/bitrix/activities/today": { body: { byDealId: {} } },
  "POST /api/bitrix/log-action": { body: { ok: true } },
  "GET /api/offers/by-deal/*": { body: [] },
  "GET /api/bitrix/deal/*": bitrix ? { body: { contact: bitrix } } : { status: 502, body: { error: { code: "X", message: "x", requestId: "t" } } },
  "GET /api/bitrix/contact/*": bitrix ? { body: { result: bitrix } } : { status: 502, body: { error: { code: "X", message: "x", requestId: "t" } } },
});
const card = (id: string) => document.querySelector(`[data-testid="appointment"][data-id="${id}"]`) as HTMLElement;

describe("rules", () => {
  const entries = todayEntries(week()).entries;
  it("today: by start time; names, badge, search without accents", () => {
    expect(entries.map((e) => e.name)).toEqual(["Erika Mustermann", "Hans Beispiel", "Anna Absage"]);
    expect(entries.map((e) => badge(e))).toEqual(["Fixer Slot 1", "Priorität Niedrig", "Abgesagt"]);
    expect(badge({ locked: true } as PlanningEntry, true)).toBe("Fixiert");
    expect(searchEntries(entries, "  MUSTERWEG ").map((e) => e.name)).toEqual(["Hans Beispiel"]);
    expect(searchEntries(entries, "").length).toBe(3);
  });
  it("pause chip after the last appointment before the pause; full route skips cancelled", () => {
    expect(pause({ start: "12:00", end: "12:30", durationMinutes: 30 }, entries)).toEqual({ text: "Pause 12:00–12:30 · 30 Min", index: 0 });
    expect(pause({ durationMinutes: 0 }, entries)).toBeNull();
    const href = fullRouteHref(entries)!;
    const d = decodeURIComponent(href).replace(/\+/g, " ");
    expect(d).toContain("origin=Kornhausacker 10, Hof&destination=Kornhausacker 10, Hof&waypoints=Teststraße 1, 95028 Hof|Musterweg 5, 95030 Hof&travelmode=driving");
    expect(d).not.toContain("Probeweg");
  });
  it("name and address are split as today; the contact adds the Anrede and only empty fields", () => {
    expect(parseName("Anna Maria von Muster")).toEqual({ firstName: "Anna Maria von", lastName: "Muster" });
    expect(parseAddress("Teststraße 1, 95028 Hof")).toEqual({ street: "Teststraße 1", postalCode: "95028", city: "Hof" });
    expect(enrichmentPatch(enrichmentOf(CONTACT), { email: "alt@example.test", street: "" })).toMatchObject({ salutation: "Frau", street: "Bitrixstraße 7", city: "Hof" });
    expect(enrichmentPatch(enrichmentOf(CONTACT), { email: "alt@example.test" })).not.toHaveProperty("email");
  });
  it("week: this week from days, other weeks from rawWpByDate, arrows stop at the data", () => {
    const w = week(), v = weekView(w, 0), prev = weekView(w, -5), next = weekView(w, 9);
    expect(v.days).toHaveLength(5);
    expect(v.meta).toMatch(new RegExp(`^${termine(inWeek())} · diese Woche · KW \\d+ \\(`));
    expect(prev.offset).toBe(0); // nothing earlier planned
    expect(next.offset).toBe(1);
    expect(next.meta).toContain("1 Termin · nächste Woche");
    expect(v.days.some((d) => d.today)).toBe(new Date().getDay() % 6 !== 0);
  });
});

describe("offer from an appointment (replay of today's UI)", () => {
  it.each((fixture as { scenarios: any[] }).scenarios)("$name", async (s) => {
    fakeServer(HANDLERS(s.bitrix ? CONTACT : null));
    const router = renderApp("/");
    await waitFor(() => expect(card(s.entry)).toBeTruthy());
    await userEvent.click(within(card(s.entry)).getByRole("button", { name: "In Konfigurator öffnen" }));
    await userEvent.click(await screen.findByRole("button", { name: { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", ah: "Alltagshilfe" }[s.type as string]! }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${s.top.auftragId === "70001" ? "70001" : "t-[0-9a-f]{24}"}/${s.type}`)));
    // today stores the customer data, the number, and — in the background — what Bitrix knows
    const want = { ...s.kundendaten }; // bitrix-filled: Anrede + empty fields
    await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten).toMatchObject(want));
    const o = useOfferStore.getState().offer as any;
    expect(o.auftragId).toBe(s.top.auftragId);
    expect(o.mail.auftragId).toBe(s.top.mail.auftragId);
    expect(o.postal.auftragId).toBe(s.top.postal.auftragId);
    if (!s.kundendaten.salutation) expect(o.Kundendaten.salutation ?? "").toBe("");
  });
});

describe("layout", () => {
  it("departure = first start minus the way; unknown stays unknown", () => {
    expect(departure(540, 45)).toBe("08:15");
    expect(departure(30, 45)).toBe("23:45");
    expect(departure(540, null)).toBeNull();
    expect(departure(undefined, 45)).toBeNull();
  });
  it("departure row says it is unknown without routing; left column order; pause is its own card", async () => {
    fakeServer({ ...HANDLERS(null), "POST /api/routing/suggest-distance": { status: 504, body: { error: { code: "X", message: "x", requestId: "t" } } } });
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    expect(screen.getByTestId("departure")).toHaveTextContent("Abfahrt: Fahrzeit unbekannt");
    const left = within(card("a1")).getByTestId("appt-left").textContent!;
    expect(left.indexOf("09:00")).toBeLessThan(left.indexOf("bis 10:30 · 90 Min"));
    expect(left.indexOf("bis 10:30 · 90 Min")).toBeLessThan(left.indexOf("BU"));
    expect(left.indexOf("BU")).toBeLessThan(left.indexOf("#70001"));
    expect(left).not.toMatch(/Slot|Priorität/); // slot and priority are not on the card (U-023)
    expect(screen.getByTestId("pause")).toHaveTextContent("Pause 12:00 – 12:30");
    expect(screen.getByTestId("pause")).toHaveTextContent("30 Min");
  });
  it("departure with travel time and km; return row", async () => {
    fakeServer({ ...HANDLERS(null), "POST /api/routing/suggest-distance": { body: { ok: true, oneWaySeconds: 2700, oneWayKm: 52 } } });
    renderApp("/");
    await waitFor(() => expect(screen.getByTestId("departure")).toHaveTextContent("Abfahrt 08:15"));
    expect(screen.getByTestId("departure")).toHaveTextContent("45 Min · 52 km bis zum 1. Termin");
    await waitFor(() => expect(screen.getByTestId("return")).toHaveTextContent("Rückfahrt ab 14:00"));
  });
  it("week: empty days are one line", async () => {
    fakeServer(HANDLERS(null));
    renderApp("/");
    await waitFor(() => expect(screen.getAllByTestId("week-day-empty").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId("week-day-empty")[0]).toHaveTextContent("keine Termine");
  });
});

describe("panel", () => {
  it("shows today's list with the same data; search, clear, cancelled card is not openable", async () => {
    fakeServer(HANDLERS(null));
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    expect(screen.getByTestId("planning-meta")).toHaveTextContent(/^3 Termin\(e\) für /);
    expect(card("a1")).toHaveTextContent("09:00bis 10:30 · 90 Min");
    expect(within(card("a1")).getByRole("link", { name: /Kunde anrufen/ })).toHaveAttribute("href", "tel:+49928100001".replace("+49928100001", "+499281000001"));
    expect(within(card("c3")).getByRole("button", { name: /Nicht verfügbar/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Termine suchen"), "beispiel");
    expect(card("a1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Suche löschen" }));
    expect(card("a1")).toBeTruthy();
  });
  it("Bitrix times replace the planned ones", async () => {
    fakeServer({ ...HANDLERS(null), "GET /api/bitrix/activities/today": { body: { byDealId: { "70001": { startMinutes: 600, endMinutes: 660 } } } } });
    renderApp("/");
    await waitFor(() => expect(card("a1")).toHaveTextContent("10:00bis 11:00 · 60 Min"));
  });
  it("the list cannot be loaded: its own error with a retry", async () => {
    const srv = fakeServer({ ...HANDLERS(null), "GET /api/planning/current": { status: 502, body: { error: { code: "X", message: "x", requestId: "t" } } } });
    renderApp("/");
    await screen.findByText("Planungstermine konnten nicht geladen werden");
    expect(screen.getByTestId("planning-meta")).toHaveTextContent("Planungsdaten konnten nicht geladen werden");
    await userEvent.click(screen.getByRole("button", { name: /Erneut versuchen/ }));
    await waitFor(() => expect(srv.count("GET /api/planning/current")).toBe(2));
  });
  it("opening logs termin_opened; „Termin hat nicht statt gefunden“ asks for the reason and moves the deal", async () => {
    const srv = fakeServer({ ...HANDLERS(null), "POST /api/bitrix/deal/70001/move-besichtigung": { body: { ok: true } } });
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    await userEvent.click(within(card("a1")).getByRole("button", { name: /nicht statt gefunden/ }));
    const dialog = await screen.findByRole("dialog", { name: "Kunde nicht erreicht" });
    await userEvent.click(within(dialog).getByLabelText("Sonstiges"));
    await userEvent.type(within(dialog).getByLabelText(/Kommentar/), "Klingel defekt");
    await userEvent.click(within(dialog).getByRole("button", { name: "Verschieben & kommentieren" }));
    await waitFor(() => expect(srv.count("POST /api/bitrix/deal/70001/move-besichtigung")).toBe(1));
    expect(srv.calls.find((c) => c.key.endsWith("move-besichtigung"))!.body).toEqual({
      comment: "📵 Termin nicht zustande gekommen:\n• Kunde nicht erreichbar\n• Sonstiges\nKlingel defekt", reason: "Kunde nicht erreichbar, Sonstiges – Klingel defekt",
    });
    await waitFor(() => expect(within(card("a1")).queryByRole("button", { name: /nicht statt gefunden/ })).toBeNull()); // done: hidden
  });
  it("a deal with a saved offer has no „nicht statt gefunden“ button", async () => {
    fakeServer({ ...HANDLERS(null), "GET /api/offers/by-deal/70001": { body: [{ offerNumber: "ANG1" }] } });
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    await waitFor(() => expect(within(card("a1")).queryByRole("button", { name: /nicht statt gefunden/ })).toBeNull());
  });
  it("week calendar: this week, ▶ ◀ and „Diese Woche“; a tap opens the same offer picker", async () => {
    const srv = fakeServer(HANDLERS(null));
    renderApp("/");
    const cal = await screen.findByTestId("week-calendar");
    await waitFor(() => expect(screen.getByTestId("week-meta")).toHaveTextContent(`${termine(inWeek())} · diese Woche`));
    expect(within(cal).getByRole("button", { name: "Diese Woche" })).toBeDisabled();
    expect(within(cal).getByRole("button", { name: "Vorherige Woche" })).toBeDisabled();
    await userEvent.click(within(cal).getByRole("button", { name: "Nächste Woche" }));
    expect(screen.getByTestId("week-meta")).toHaveTextContent("1 Termin · nächste Woche");
    expect(srv.count("GET /api/planning/current")).toBe(1); // no new call to change weeks
    await userEvent.click(within(cal).getByRole("button", { name: /Paula Muster/ }));
    expect(await screen.findByRole("dialog", { name: "Welche Angebotsart möchten Sie öffnen?" })).toHaveTextContent("Paula Muster");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(within(cal).getByRole("button", { name: "Diese Woche" }));
    expect(screen.getByTestId("week-meta")).toHaveTextContent("diese Woche");
  });
});
