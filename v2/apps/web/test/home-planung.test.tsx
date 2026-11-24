// Hauptmenü, planning part on the lean planning API (fixtures/home-planung-v2.json, made-up data):
// the list, the offer from an appointment (parity with the recording of today's UI,
// fixtures/home-planung.json), notes, departure/return/pause, search, „Termin hat nicht statt gefunden“,
// the week calendar (loaded only when on screen).
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { chargeOf, departure, entryOf, fullRouteHref, mondayKey, pause, prefill, searchEntries, todayModel, weekModel, type TodayPayload, type WeekPayload } from "../src/features/home/planning-rules.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";
import { customerOfContact } from "@oc/api-contract";
import old from "./fixtures/home-planung.json";
import lean from "./fixtures/home-planung-v2.json";

const TODAY = lean.today as unknown as TodayPayload, WEEK = lean.week as unknown as WeekPayload;
const CONTACT = { HONORIFIC: { STATUS_ID: "HNR_DE_1" }, EMAIL: [{ VALUE: "erika.bitrix@example.test" }], PHONE: [{ VALUE: "+49 9281 999999" }], ADDRESS: "Bitrixstraße 7", ADDRESS_CITY: "Hof", ADDRESS_POSTAL_CODE: "95028" };
const FAIL = { status: 502, body: { error: { code: "X", message: "x", requestId: "t" } } };
const HANDLERS = (bitrix: unknown) => ({
  ...BASE,
  "GET /api/planning/v2/today": { body: TODAY },
  "GET /api/planning/v2/today?date=*": { body: TODAY },
  "GET /api/planning/v2/week?from=*": { body: WEEK },
  "POST /api/bitrix/log-action": { body: { ok: true } },
  "GET /api/offers/by-deal/*": { body: [] },
  "GET /api/bitrix/deal/*": bitrix ? { body: { contact: bitrix } } : FAIL,
  // the planning asks the deal through the one-request route (same contact, mapped on the server)
  "GET /api/deals/*/customer": bitrix ? { body: { dealId: "70001", dealTitle: "", customer: customerOfContact({ ID: "5001", ...(bitrix as object) }), vermieter: { erforderlich: null, liegtVor: null }, source: "batch", loadedAt: "2026-11-18T10:00:00.000Z" } } : FAIL,
  "GET /api/bitrix/contact/*": bitrix ? { body: { result: bitrix } } : FAIL,
});
const card = (id: string) => document.querySelector(`[data-testid="appointment"][data-id="${id}"]`) as HTMLElement;
afterEach(() => vi.unstubAllGlobals());

describe("rules", () => {
  const { entries, home } = todayModel(TODAY);
  it("mapping: order, names, status, deal, times, notes", () => {
    expect(entries.map((e) => e.name)).toEqual(["Erika Mustermann", "Hans Beispiel", "Probst", "Anna Absage"]);
    const a = entries[0]!;
    expect(a).toMatchObject({ importDealId: "70001", contactId: "5001", manualStartMinutes: 540, duration: 90, locked: true, taetigkeitenBadge: "bu", street: "Teststraße 1", postalCode: "95028" });
    expect(entries[3]!.cancelled).toBe(true);
    expect(entries[1]).toMatchObject({ tightBy: 5 });
    expect(entries[2]!.stageAlert).toBe("Deal noch in „Rückfragen“");
    expect(home).toEqual({ name: "Firma (Test)", address: "Beispielweg 1, 95028 Hof" });
  });
  it("search without accents; departure; pause position; route from the start location", () => {
    expect(searchEntries(entries, "  MUSTERWEG ").map((e) => e.name)).toEqual(["Hans Beispiel"]);
    expect(departure("08:15")).toBe("08:15");
    expect(departure(null)).toBeNull();
    expect(pause(TODAY.plan!.pause, entries)).toMatchObject({ text: "Pause 12:00 – 12:30", index: 0, min: 30 });
    expect(pause(null, entries)).toBeNull();
    const d = decodeURIComponent(fullRouteHref(entries, home!.address)!).replace(/\+/g, " ");
    expect(d).toContain("origin=Beispielweg 1, 95028 Hof&destination=Beispielweg 1, 95028 Hof&waypoints=Teststraße 1, 95028 Hof|Musterweg 5, 95030 Hof|Probeweg 9, 95032 Hof&travelmode");
    expect(d).not.toContain("Weg 2,"); // cancelled
  });
  it("prefill: single word stays a first name as today; the API's customerNumber wins, else the contact id", () => {
    expect(prefill(entries[2]!).kunde).toMatchObject({ firstName: "Probst", lastName: "" });
    expect(prefill(entries[0]!).kunde).toMatchObject({ firstName: "Erika", lastName: "Mustermann", salutation: "Frau", customerNumber: "5001", bitrixContactId: "5001" });
    expect(prefill(entryOf({ id: "x", status: "planned", customerNumber: "K-77", bitrixContactId: "5" }, "", false)).kunde.customerNumber).toBe("K-77");
    expect(prefill(entries[1]!).auftragId).toBe("5002"); // no deal: the contact, as today
  });
  it("charging: at the pause with its Route; elsewhere a small line; the flat shape is read too", () => {
    expect(chargeOf(TODAY.plan!.charge)).toEqual({ atPause: true, name: "Ladesäule Test", power: "150 kW DC", route: "https://www.google.com/maps/dir/?api=1&destination=50.7376,11.8456" });
    expect(chargeOf({ atPause: false, charger: { name: "Q1" } })).toMatchObject({ atPause: false, name: "Q1", route: null });
    expect(chargeOf({ name: "Flach", power: "22 kW" })).toMatchObject({ atPause: true, name: "Flach", power: "22 kW" });
    expect(chargeOf(null)).toBeNull();
  });
  it("week: 7 days from the API, counts, label", () => {
    const v = weekModel(WEEK, 0, new Date(2026, 10, 17));
    expect(v.days).toHaveLength(7);
    expect(v.meta).toBe(`5 Termine · diese Woche · KW 47 (16. Nov. – 22. Nov.)`);
    expect(v.days[1]).toMatchObject({ today: true, active: 3, cancelled: 1 });
    expect(mondayKey(new Date(2026, 10, 18), 1)).toBe("2026-11-23");
  });
});

describe("offer from an appointment (parity with today's UI)", () => {
  it.each((old as { scenarios: any[] }).scenarios)("$name", async (s) => {
    fakeServer(HANDLERS(s.bitrix ? CONTACT : null));
    const router = renderApp("/");
    await waitFor(() => expect(card(s.entry)).toBeTruthy());
    await userEvent.click(within(card(s.entry)).getByRole("button", { name: "In Konfigurator öffnen" }));
    await userEvent.click(await screen.findByRole("button", { name: { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", ah: "Alltagshilfe" }[s.type as string]! }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${s.top.auftragId === "70001" ? "70001" : "t-[0-9a-f]{24}"}/${s.type}`)));
    // difference to today: the salutation comes with the data, also when Bitrix cannot be asked
    const want = { ...s.kundendaten, ...(s.kundendaten.salutation ? {} : { salutation: s.entry === "a1" ? "Frau" : "Herr" }) };
    await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten).toMatchObject(want));
    const o = useOfferStore.getState().offer as any;
    expect([o.auftragId, o.mail.auftragId, o.postal.auftragId]).toEqual([s.top.auftragId, s.top.mail.auftragId, s.top.postal.auftragId]);
  });
});

describe("panel", () => {
  it("list: same data as the card of today; search, clear, cancelled card is not openable", async () => {
    fakeServer(HANDLERS(null));
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    expect(screen.getByTestId("planning-meta")).toHaveTextContent(/^4 Termin\(e\) für Dienstag, 17. November 2026 · aktualisiert \d\d:\d\d/);
    expect(within(card("a1")).getByRole("link", { name: /Kunde in Bitrix anrufen/ })).toHaveAttribute("href", "https://emczwei.bitrix24.de/crm/contact/details/5001/");
    expect(within(card("d4")).getByRole("button", { name: /Nicht verfügbar/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Termine suchen"), "beispiel");
    expect(card("a1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Suche löschen" }));
    expect(card("a1")).toBeTruthy();
  });
  it("departure, travel, pause with charging, return; left column order; notes and warnings", async () => {
    fakeServer(HANDLERS(null));
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    expect(screen.getByTestId("departure")).toHaveTextContent("Abfahrt 08:15ab Firma (Test) · 45 Min · 52 km bis zum 1. Termin");
    expect(screen.getAllByTestId("travel")[0]).toHaveTextContent("20 Min Fahrt / Puffer · 14 kmAnkunft ca. 10:50");
    expect(screen.getByTestId("pause")).toHaveTextContent("Pause 12:00 – 12:30");
    expect(screen.getByTestId("charge")).toHaveTextContent("Laden: Ladesäule Test, 150 kW DC");
    expect(screen.getByTestId("return")).toHaveTextContent("Rückfahrt ab 15:45 · Ankunft ca. 15:45nach Firma (Test) · 50 Min · 40 km");
    const left = within(card("a1")).getByTestId("appt-left").textContent!;
    expect(left).toMatch(/^09:00bis 10:30 · 90 MinBU#70001$/);
    const notes = within(card("a1")).getByTestId("notes");
    expect(notes).toHaveTextContent("Hinterhaus, 2. Stock");
    expect(notes).toHaveTextContent("Hund im Haus");
    expect(notes).toHaveAttribute("title", expect.stringContaining("Hund im Haus"));
    expect(within(card("b2")).getByTestId("warning")).toHaveTextContent("Knapp geplant: 5 Min");
    expect(within(card("c3")).getByTestId("warning")).toHaveTextContent("Deal noch in „Rückfragen“");
  });
  it("charging on the way is a small line, not in the pause card", async () => {
    const plan = { ...TODAY.plan!, charge: { atPause: false, charger: { name: "Q1 Autostrom", power: "150 kW DC", lat: 50.7, lng: 11.8 } } };
    fakeServer({ ...HANDLERS(null), "GET /api/planning/v2/today": { body: { ...TODAY, plan } } });
    renderApp("/");
    expect(await screen.findByTestId("charge-route")).toHaveTextContent("Laden unterwegs: Q1 Autostrom, 150 kW DC");
    expect(screen.queryByTestId("charge")).toBeNull();
  });
  it("the service is not set up (503): its message and the link to today's view; no other endpoint is asked", async () => {
    const srv = fakeServer({ ...HANDLERS(null), "GET /api/planning/v2/today": { status: 503, body: { error: { code: "PLANNING_KEY_MISSING", message: "Der Planungsdienst ist auf diesem Server nicht eingerichtet (PLANNING_API_KEY fehlt).", requestId: "t" } } } });
    renderApp("/");
    await screen.findByText("Planungstermine konnten nicht geladen werden");
    expect(screen.getByText(/PLANNING_API_KEY fehlt/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planung in der bisherigen Ansicht" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("planning-meta")).toHaveTextContent("Planungsdaten konnten nicht geladen werden");
    expect(srv.calls.some((c) => c.key.includes("/api/planning/current"))).toBe(false); // never the 2 MB endpoint
    await userEvent.click(screen.getByRole("button", { name: /Erneut versuchen/ }));
    await waitFor(() => expect(srv.count("GET /api/planning/v2/today")).toBe(2));
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
    await waitFor(() => expect(within(card("a1")).queryByRole("button", { name: /nicht statt gefunden/ })).toBeNull());
  });
  it("a deal with a saved offer has no „nicht statt gefunden“ button", async () => {
    fakeServer({ ...HANDLERS(null), "GET /api/offers/by-deal/70001": { body: [{ offerNumber: "ANG1" }] } });
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    await waitFor(() => expect(within(card("a1")).queryByRole("button", { name: /nicht statt gefunden/ })).toBeNull());
  });
});

describe("week calendar", () => {
  it("is loaded only when it comes on screen; slot and priority are not shown", async () => {
    let seen: ((r: { isIntersecting: boolean }[]) => void) | null = null;
    vi.stubGlobal("IntersectionObserver", class { constructor(cb: typeof seen) { seen = cb; } observe() {} disconnect() {} });
    const srv = fakeServer(HANDLERS(null));
    renderApp("/");
    await waitFor(() => expect(card("a1")).toBeTruthy());
    expect(srv.calls.some((c) => c.key.startsWith("GET /api/planning/v2/week"))).toBe(false);
    expect(screen.getByText("Lade Wochenplanung…")).toBeInTheDocument();
    act(() => seen!([{ isIntersecting: true }]));
    await waitFor(() => expect(screen.getByTestId("week-meta")).toHaveTextContent("5 Termine · diese Woche"));
    const w = srv.calls.filter((c) => c.key.startsWith("GET /api/planning/v2/week"));
    expect(w).toHaveLength(1);
    expect(w[0]!.key).toBe(`GET /api/planning/v2/week?from=${mondayKey(new Date())}`);
    expect(screen.getByTestId("week-calendar")).not.toHaveTextContent(/Slot|Priorität|Hoch|Niedrig/);
  });
  it("◀ ▶ Diese Woche ask the week; a tap loads that day and opens the offer picker", async () => {
    const srv = fakeServer(HANDLERS(null));
    renderApp("/");
    const cal = await screen.findByTestId("week-calendar");
    await waitFor(() => expect(screen.getByTestId("week-meta")).toHaveTextContent("diese Woche"));
    expect(within(cal).getByRole("button", { name: "Diese Woche" })).toBeDisabled();
    expect(screen.getAllByTestId("week-day-empty").length).toBeGreaterThan(0);
    await userEvent.click(within(cal).getByRole("button", { name: "Nächste Woche" }));
    await waitFor(() => expect(srv.calls.map((c) => c.key)).toContain(`GET /api/planning/v2/week?from=${mondayKey(new Date(), 1)}`));
    await waitFor(() => expect(screen.getByTestId("week-meta")).toHaveTextContent("nächste Woche"));
    await userEvent.click(within(cal).getAllByRole("button", { name: /Erika Mustermann/ })[0]!);
    expect(await screen.findByRole("dialog", { name: "Welche Angebotsart möchten Sie öffnen?" })).toBeInTheDocument();
    expect(srv.calls.some((c) => c.key.startsWith("GET /api/planning/v2/today?date="))).toBe(true);
  });
});
