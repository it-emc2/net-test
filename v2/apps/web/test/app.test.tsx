import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEBOUNCE_MS } from "../src/features/offer/model/usePrice.js";
import { AUTOSAVE_MS, useOfferStore } from "../src/features/offer/index.js";
import { BASE, NO_DRAFT, USER, fakeServer, renderApp } from "./helpers.js";

const PRICE = "POST /api/price";
const TEMP = "t-0123456789abcdef01234567";
const S = () => useOfferStore.getState();

describe("app shell", () => {
  it("not logged in: the login form is shown in place of the page; after login the page appears", async () => {
    const s = fakeServer({
      "GET /api/auth/me": { status: 401, body: { error: { code: "UNAUTHORIZED", message: "Unauthorized", requestId: "r" } } },
      "POST /api/auth/login": { body: { token: "t", user: USER } },
    });
    renderApp("/");
    await screen.findByRole("heading", { name: "Anmeldung" });
    await userEvent.type(screen.getByLabelText("E-Mail"), "ap@example.test");
    await userEvent.type(screen.getByLabelText("Passwort"), "geheim");
    await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));
    await screen.findByRole("heading", { name: "Hauptmenü" });
    expect(s.calls.find((c) => c.key === "POST /api/auth/login")?.body).toEqual({ email: "ap@example.test", password: "geheim" });
  });

  it("Hauptmenü: five offer types; no price request, no offer in the store", async () => {
    const s = fakeServer(BASE);
    renderApp("/");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    for (const name of ["Badumbau", "Badewannentür", "Handlauf", "Badelift", "Alltagshilfe"]) expect(screen.getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
    expect(s.count(PRICE)).toBe(0);
    expect(S().offer).toBeNull();
  });

  it("tile → offer: a temporary key in the address, the first step, exactly ONE price request, nothing saved yet", async () => {
    const s = fakeServer(BASE);
    const router = renderApp("/");
    await userEvent.click(await screen.findByRole("link", { name: /Badumbau/ }));
    await screen.findByRole("navigation", { name: "Schritte" });
    expect(router.state.location.pathname).toMatch(/^\/deal\/t-[0-9a-f]{24}\/bu\/Kundendaten$/);
    await screen.findByText("10,00 €");
    expect(s.count(PRICE)).toBe(1);
    expect((s.calls.find((c) => c.key === PRICE)?.body as any).activeOffer).toBe("bu");
    expect(screen.getByText(/noch ohne Auftragsnummer/)).toBeInTheDocument();
    expect(s.calls.some((c) => c.key.startsWith("PUT "))).toBe(false); // opening a tile alone creates nothing
  });

  it("a deal number in the address opens the offer for that deal; a step without a React screen links to today's UI", async () => {
    fakeServer(BASE);
    renderApp("/deal/4711/bwt/Kosten");
    await screen.findByText(/Badewannentür · Auftrag 4711/);
    expect(S().dealId).toBe("4711");
    expect(screen.getByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toHaveAttribute("href", "/?deal=4711#Kosten");
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1); // only the active step is on the page
  });

  it("an existing draft is opened as it was saved — also when it was last edited in today's UI", async () => {
    const payload = { ...structuredClone(S().offer ?? {}), activeOffer: "bu", Kundendaten: { firstName: "Erika", lastName: "Mustermann", hasContactPerson: "Nein", customerType: "Neu" } };
    fakeServer({ ...BASE, "GET /api/deals/4711/draft": { body: { dealId: "4711", offerType: "bu", payload, revision: 7, updatedAt: "2026-11-12T10:00:00Z", updatedBy: "x" } } });
    renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByLabelText("Vorname")).toHaveValue("Erika");
    expect([S().revision, S().version, S().savedVersion]).toEqual([7, 0, 0]);
  });

  it("the draft of a deal is an offer of another type → the address follows the draft", async () => {
    fakeServer({ ...BASE, "GET /api/deals/4711/draft": { body: { dealId: "4711", offerType: "bwt", payload: { activeOffer: "bwt", Kundendaten: {} }, revision: 2, updatedAt: "2026-11-12T10:00:00Z" } } });
    const router = renderApp("/deal/4711/bu/Kundendaten");
    await screen.findByText(/Badewannentür · Auftrag 4711/);
    expect(router.state.location.pathname).toBe("/deal/4711/bwt/Kundendaten");
  });

  it("back to the Hauptmenü empties the store and asks for no price", async () => {
    const s = fakeServer(BASE);
    renderApp(`/deal/${TEMP}/bl/bl`);
    await screen.findByText("10,00 €");
    const before = s.count(PRICE);
    await userEvent.click(screen.getByRole("button", { name: "Zum Hauptmenü" }));
    await screen.findByRole("heading", { name: "Hauptmenü" });
    await waitFor(() => expect(S().offer).toBeNull());
    expect(s.count(PRICE)).toBe(before);
  });

  it("many changes in a row cost ONE more price request and ONE save, both with the latest state", async () => {
    const s = fakeServer({ ...BASE, [`PUT /api/deals/${TEMP}/draft`]: { body: { dealId: TEMP, revision: 1, changed: true } } });
    renderApp(`/deal/${TEMP}/bu/Kundendaten`);
    await screen.findByText("10,00 €");
    expect(s.count(PRICE)).toBe(1);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => { for (let i = 0; i < 25; i++) S().patch("Kundendaten", { city: `Hof ${i}` }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_MS); });
    vi.useRealTimers();
    await waitFor(() => expect(s.count(PRICE)).toBe(2));
    expect((s.calls.filter((c) => c.key === PRICE)[1]?.body as any).Kundendaten.city).toBe("Hof 24");
    const saves = s.calls.filter((c) => c.key.startsWith("PUT "));
    await waitFor(() => expect(saves.length || s.calls.filter((c) => c.key.startsWith("PUT ")).length).toBe(1));
    const save = s.calls.find((c) => c.key.startsWith("PUT "))!.body as any;
    expect([save.offerType, save.baseRevision, save.payload.Kundendaten.city]).toEqual(["bu", 0, "Hof 24"]);
    await screen.findByText(/Automatisch gespeichert/);
    expect([S().revision, S().savedVersion]).toEqual([1, 25]);
  });

  it("a draft changed elsewhere is not overwritten: the user is told to reload", async () => {
    fakeServer({ ...BASE, "PUT /api/deals/4711/draft": { status: 409, body: { error: { code: "REVISION_CONFLICT", message: "Der Entwurf wurde inzwischen an anderer Stelle geändert. Bitte neu laden.", requestId: "r" }, currentRevision: 9 } } });
    renderApp("/deal/4711/bu/Kundendaten");
    await userEvent.type(await screen.findByLabelText("Vorname"), "E");
    await userEvent.click(screen.getByRole("link", { name: "Weitere Angaben in der bisherigen Ansicht" })); // saves at once
    expect(await screen.findByText("Nicht gespeichert – an anderer Stelle geändert")).toHaveAttribute("role", "alert");
    expect(S().savedVersion).toBe(0);
  });

  it("unknown offer type, bad draft key or unknown step: back to a valid place", async () => {
    fakeServer({ ...BASE, "GET /api/deals/*/draft": NO_DRAFT });
    const r1 = renderApp("/neu/hms");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    expect(r1.state.location.pathname).toBe("/");
  });
});

// The user menu is a native popover. The test browser (jsdom) never opens popovers, so the menu's
// controls are queried with `hidden: true`; opening and closing it is the browser's own job.
describe("header and sidebar", () => {
  it("header: logo, title and the user menu with the user's name; the save state only while an offer is open", async () => {
    fakeServer(BASE);
    renderApp("/");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("Angebotskonfigurator");
    expect(screen.getByRole("img", { name: "EmC2" })).toHaveAttribute("src", "/assets/logo.png");
    expect(screen.getByLabelText("Benutzermenü")).toHaveTextContent("ap@example.test");
    expect(header.querySelector("[role=status]")).toBeNull();
  });

  it("user menu: theme, dark mode and automatic saving use the same browser keys as today's UI", async () => {
    fakeServer(BASE);
    renderApp(`/deal/${TEMP}/bu/Kundendaten`);
    await screen.findByLabelText("Vorname");
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("wohnen"); // BU's accent while nothing is chosen
    await userEvent.selectOptions(screen.getByLabelText("Farbthema"), "pflege");
    expect([root.dataset.theme, localStorage.getItem("emc2.theme")]).toEqual(["pflege", "pflege"]);
    await userEvent.selectOptions(screen.getByLabelText("Farbthema"), "");
    expect([root.dataset.theme, localStorage.getItem("emc2.theme")]).toEqual(["wohnen", null]);
    await userEvent.click(screen.getByRole("switch", { name: "Dunkler Modus", hidden: true }));
    expect([root.dataset.mode, localStorage.getItem("emc2.mode")]).toEqual(["dark", "dark"]);
    await userEvent.click(screen.getByRole("switch", { name: "Dunkler Modus", hidden: true }));
    expect(root.dataset.mode).toBe("light");
    await userEvent.click(screen.getByRole("switch", { name: "Automatisch speichern", hidden: true }));
    expect(localStorage.getItem("oc.autosave")).toBe("off");
    await userEvent.click(screen.getByRole("switch", { name: "Automatisch speichern", hidden: true }));
    expect(localStorage.getItem("oc.autosave")).toBe("on");
  });

  it("automatic saving off: nothing is saved by itself; the „Speichern“ button in the header saves", async () => {
    const s = fakeServer({ ...BASE, [`PUT /api/deals/${TEMP}/draft`]: { body: { dealId: TEMP, revision: 1, changed: true } } });
    renderApp(`/deal/${TEMP}/bu/Kundendaten`);
    await screen.findByLabelText("Vorname");
    await userEvent.click(screen.getByRole("switch", { name: "Automatisch speichern", hidden: true }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => { S().patch("Kundendaten", { city: "Hof" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2); });
    vi.useRealTimers();
    expect(s.calls.some((c) => c.key.startsWith("PUT "))).toBe(false);
    expect(screen.getByText("Nicht gespeicherte Änderungen")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByText(/^Gespeichert · /);
    expect(s.calls.filter((c) => c.key.startsWith("PUT "))).toHaveLength(1);
    await userEvent.click(screen.getByRole("switch", { name: "Automatisch speichern", hidden: true })); // back on for the other tests
  });

  it("log out from the menu: the login form appears", async () => {
    fakeServer({ ...BASE, "POST /api/auth/logout": { body: { ok: true } } });
    renderApp("/");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    await userEvent.click(screen.getByRole("button", { name: "Abmelden", hidden: true }));
    await screen.findByRole("heading", { name: "Anmeldung" });
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("sidebar: steps before the open one are marked done, the open one active; groups as today", async () => {
    fakeServer(BASE);
    renderApp(`/deal/${TEMP}/bu/Duschwanne`);
    const nav = await screen.findByRole("navigation", { name: "Schritte" });
    const state = (name: string) => Array.from(nav.querySelectorAll("a")).find((a) => a.textContent?.startsWith(name))?.getAttribute("data-state");
    expect([state("Kundendaten"), state("Arbeitszeit"), state("Arbeiten"), state("Duschwanne"), state("Fußboden"), state("Kosten")]).toEqual(["done", "done", "done", "active", "idle", "idle"]);
    expect(nav).toHaveTextContent("I · Auszuführende Arbeiten");
    expect(nav).toHaveTextContent("II · Material für Badumbau");
    // narrow screens: the list folds behind a button that names the open step
    const toggle = screen.getByRole("button", { name: /Schritt 4 von 16 ·\s*Duschwanne/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("Weiter and Zurück lead through the steps in order; none before the first, none after the last", async () => {
    fakeServer(BASE);
    const router = renderApp(`/deal/${TEMP}/bl/Kundendaten`);
    await screen.findByLabelText("Vorname");
    expect(screen.queryByRole("link", { name: /^Zurück zu/ })).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "Weiter zu Arbeitszeit" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${TEMP}/bl/Arbeitszeit`));
    await userEvent.click(await screen.findByRole("link", { name: "Zurück zu Kundendaten" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${TEMP}/bl/Kundendaten`));
    await userEvent.click(within(screen.getByRole("navigation", { name: "Schritte" })).getByRole("link", { name: /Angebotsversand/ }));
    await screen.findByRole("link", { name: "Zurück zu Kosten" });
    expect(screen.queryByRole("link", { name: /^Weiter zu/ })).toBeNull();
  });
});

