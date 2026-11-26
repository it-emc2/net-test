// Kundenmodus (quick win C7, owner 2026-11-26): one switch in the header hides everything internal
// while the customer watches. Display only: the offer, its prices and every request stay the same.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { RULES } from "../src/features/steps/angebotscheck/rules.js";
import { summary } from "../src/features/steps/duschwanne/rules.js";
import { cardsOf, PREVIEWS } from "../src/features/steps/versand/documents.js";
import { CUSTOMER_MODE_KEY, readCustomerMode, setCustomerMode, useCustomerModeStore } from "../src/shared/lib/customer-mode.js";
import { END_LABEL, HIDDEN_TEXT, Internal } from "../src/shared/ui/internal.js";
import arbeiten from "./fixtures/arbeiten.json" with { type: "json" };
import duschwanne from "./fixtures/duschwanne.json" with { type: "json" };
import kosten from "./fixtures/kosten.json" with { type: "json" };
import { BASE, fakeServer, openMore, renderApp, toClassic, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
const PRICE = kosten.scenarios[0]!.price as Record<string, unknown>;
const offer = () => useOfferStore.getState().offer;
const switchButton = () => screen.getByTestId("customer-mode");

beforeEach(() => { localStorage.clear(); setCustomerMode(false); });
afterEach(() => { vi.restoreAllMocks(); setCustomerMode(false); });

describe("the state (per device, not in the offer)", () => {
  it("is off by default, toggles and is kept in localStorage", () => {
    expect(useCustomerModeStore.getState().on).toBe(false);
    expect(localStorage.getItem(CUSTOMER_MODE_KEY)).toBeNull();
    act(() => useCustomerModeStore.getState().toggle());
    expect(useCustomerModeStore.getState().on).toBe(true);
    expect(localStorage.getItem(CUSTOMER_MODE_KEY)).toBe("on");
    act(() => useCustomerModeStore.getState().toggle());
    expect(useCustomerModeStore.getState().on).toBe(false);
    expect(localStorage.getItem(CUSTOMER_MODE_KEY)).toBeNull();
  });
  it("starts as stored (a reload keeps it on) and off when reading the storage fails", () => {
    expect(readCustomerMode()).toBe(false);
    localStorage.setItem(CUSTOMER_MODE_KEY, "on");
    expect(readCustomerMode()).toBe(true); // what the store starts with
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readCustomerMode()).toBe(false);
  });
  it("a blocked storage is tolerated: the switch still works for this page", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => act(() => setCustomerMode(true))).not.toThrow();
    expect(useCustomerModeStore.getState().on).toBe(true);
  });
  it("another tab switching it is followed (storage event)", () => {
    localStorage.setItem(CUSTOMER_MODE_KEY, "on");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CUSTOMER_MODE_KEY, newValue: "on" })); });
    expect(useCustomerModeStore.getState().on).toBe(true);
    localStorage.removeItem(CUSTOMER_MODE_KEY);
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CUSTOMER_MODE_KEY, newValue: null })); });
    expect(useCustomerModeStore.getState().on).toBe(false);
  });
});

describe("<Internal>", () => {
  it("renders its children while off; nothing (not even for a screen reader) while on", () => {
    render(<p data-testid="box">A<Internal>B</Internal><Internal when={false}>C</Internal><Internal instead="d">D</Internal></p>);
    expect(screen.getByTestId("box").textContent).toBe("ABCD");
    act(() => setCustomerMode(true));
    expect(screen.getByTestId("box").textContent).toBe("ACd");
  });
  it("notice: the calm note with a button that ends the Kundenmodus", async () => {
    render(<Internal notice testId="n"><p>geheim</p></Internal>);
    act(() => setCustomerMode(true));
    expect(screen.queryByText("geheim")).toBeNull();
    expect(within(screen.getByTestId("n")).getByText(HIDDEN_TEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: END_LABEL }));
    expect(useCustomerModeStore.getState().on).toBe(false);
    expect(screen.getByText("geheim")).toBeInTheDocument();
  });
});

describe("header", () => {
  it("one tap on, a visible „Kundenmodus“ while on, one tap off", async () => {
    fakeServer({ ...BASE });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("button", { name: "Schritte öffnen" });
    expect(switchButton()).toHaveAttribute("aria-pressed", "false");
    expect(switchButton()).toHaveAccessibleName("Kundenmodus einschalten");
    expect(switchButton()).not.toHaveTextContent("Kundenmodus");
    await userEvent.click(switchButton());
    expect(switchButton()).toHaveAttribute("aria-pressed", "true");
    expect(switchButton()).toHaveTextContent("Kundenmodus");
    expect(localStorage.getItem(CUSTOMER_MODE_KEY)).toBe("on");
    await userEvent.click(switchButton());
    expect(switchButton()).toHaveAttribute("aria-pressed", "false");
    expect(useCustomerModeStore.getState().on).toBe(false);
  });
  it("is in the header on the Hauptmenü too", async () => {
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
    renderApp("/");
    expect(await screen.findByTestId("customer-mode")).toBeInTheDocument();
  });
});

describe("Aufschlag / Rabatt", () => {
  async function open() {
    const server = fakeServer({ ...BASE, "POST /api/price": { body: PRICE } });
    renderApp(`/deal/${KEY}/bu/Rabatt`);
    await screen.findByRole("heading", { name: "Übersicht" });
    await waitFor(() => expect(screen.getByTestId("rb-sums").querySelector('[data-part="total"]')).toHaveTextContent("1.267,35"));
    return server;
  }
  it("off: unchanged — the ladder with the markup and the markup card", async () => {
    await open();
    expect(screen.getByTestId("rb-sums").querySelectorAll('[data-part="row"]').length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Aufschlag in Prozent")).toBeInTheDocument();
    expect(screen.queryByTestId("markup-hidden")).toBeNull();
  });
  it("on: markup and the sums before it are gone, the note is there; Gesamt and the discount stay", async () => {
    await open();
    act(() => setCustomerMode(true));
    const sums = screen.getByTestId("rb-sums");
    expect(sums.querySelectorAll('[data-part="row"]')).toHaveLength(0);
    expect(sums).not.toHaveTextContent(/Aufschlag/);
    expect(screen.queryByLabelText("Aufschlag in Prozent")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Aufschlag" })).toBeNull();
    expect(within(screen.getByTestId("markup-hidden")).getByText(HIDDEN_TEXT)).toBeInTheDocument();
    expect(sums.querySelector('[data-part="net"]')).toHaveTextContent("1.065,00");
    expect(sums.querySelector('[data-part="total"]')).toHaveTextContent("1.267,35");
    expect(screen.getByText("Rabatt hinzufügen")).toBeInTheDocument();
    // the note's button ends it: the markup is back
    await userEvent.click(within(screen.getByTestId("markup-hidden")).getByRole("button", { name: END_LABEL }));
    expect(screen.getByLabelText("Aufschlag in Prozent")).toBeInTheDocument();
  });
  it("nothing is written to the offer and no request is made by switching", async () => {
    const server = await open();
    await userEvent.clear(screen.getByLabelText("Aufschlag in Prozent"));
    await userEvent.type(screen.getByLabelText("Aufschlag in Prozent"), "45");
    await waitFor(() => expect(server.calls.at(-1)?.key).toBe("POST /api/price"));
    await new Promise((r) => setTimeout(r, 600)); // the price (and a save) have settled
    const before = { offer: structuredClone(offer()), version: useOfferStore.getState().version, calls: server.calls.length };
    act(() => setCustomerMode(true));
    await new Promise((r) => setTimeout(r, 600));
    act(() => setCustomerMode(false));
    await new Promise((r) => setTimeout(r, 600));
    expect(offer()).toEqual(before.offer);
    expect(useOfferStore.getState().version).toBe(before.version);
    expect(server.calls.slice(before.calls)).toEqual([]);
    expect(screen.getByLabelText("Aufschlag in Prozent")).toHaveValue("45");
  });
});

describe("Kosten", () => {
  it("off: the internal overview; on: the note instead, the same with the note's button off again", async () => {
    fakeServer({ ...BASE, "POST /api/price": { body: PRICE } });
    renderApp(`/deal/${KEY}/bu/Kosten`);
    await screen.findByRole("heading", { name: "Kosten-Details" });
    await waitFor(() => expect(screen.getAllByTestId("kosten-section").length).toBeGreaterThan(0));
    act(() => setCustomerMode(true));
    expect(screen.queryByRole("heading", { name: "Kosten-Details" })).toBeNull();
    expect(screen.queryByTestId("kosten-sums")).toBeNull();
    expect(screen.queryByText(/Interne Übersicht/)).toBeNull();
    expect(within(screen.getByTestId("kosten-hidden")).getByText(HIDDEN_TEXT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: END_LABEL }));
    expect(await screen.findByTestId("kosten-sums")).toBeInTheDocument();
  });
});

describe("Kundendaten", () => {
  it("Badelift: the markup there is replaced by the note; the internal list is not rendered", async () => {
    fakeServer({ ...BASE });
    renderApp(`/deal/${KEY}/bl/Kundendaten`);
    expect(await screen.findByLabelText("Aufschlag in Prozent")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Interne Liste/ })).toBeInTheDocument();
    act(() => setCustomerMode(true));
    expect(screen.queryByLabelText("Aufschlag in Prozent")).toBeNull();
    expect(screen.getByTestId("markup-hidden")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Interne Liste/ })).toBeNull();
    expect(screen.getByLabelText(/^Nachname/)).toBeInTheDocument(); // the rest stays
  });
});

describe("Versand · Mehr Optionen", () => {
  const titles = () => screen.getAllByTestId("zf-doc-card").map((c) => c.querySelector("h4")!.textContent);
  it("off: all three documents and the internal note; on: only the offer, no note", async () => {
    fakeServer({ ...BASE });
    renderApp(`/deal/${KEY}/bu/Zusammenfassung`);
    await screen.findByRole("heading", { name: "Angebotsversand" }, { timeout: 5000 });
    openMore();
    await waitFor(() => expect(titles()).toEqual(["Angebot", "Hassmann Warenkorb", "Kalkulation"]));
    expect(screen.getByTestId("zf-internal-note")).toBeInTheDocument();
    expect(screen.getByText(/interne Notiz/)).toBeInTheDocument();
    act(() => setCustomerMode(true));
    expect(titles()).toEqual(["Angebot"]);
    expect(screen.queryByTestId("zf-internal-note")).toBeNull();
    expect(screen.queryByText(/Kalkulation|Hassmann/)).toBeNull();
    expect(screen.queryByText(/interne Notiz/)).toBeNull();
    expect(screen.getByTestId("oo-card")).toBeInTheDocument(); // "Angebot anpassen" stays
  });
  it("the rules mark exactly the back-office documents as internal", () => {
    expect(cardsOf("bu").filter((c) => c.internal).map((c) => c.title)).toEqual(["Hassmann Warenkorb", "Kalkulation"]);
    expect(PREVIEWS.filter((p) => p.internal).map((p) => p.key)).toEqual(["kalkulation", "hassmann"]);
  });
});

describe("other internal details", () => {
  it("Angebotscheck: the markup line's details are internal (the line itself stays)", () => {
    expect(RULES.filter((r) => (r as { internal?: true }).internal).map((r) => r.id)).toEqual(["aufschlag-unter-min"]);
  });
  it("Angebotscheck: every other line keeps its details in the Kundenmodus", async () => {
    fakeServer({ ...BASE, "POST /api/price": { body: PRICE } });
    renderApp(`/deal/${KEY}/bu/Angebotscheck`);
    await screen.findByRole("heading", { name: "Angebotscheck" });
    await waitFor(() => expect(document.querySelectorAll('[data-part="detail"]').length).toBeGreaterThan(0));
    const before = Array.from(document.querySelectorAll('[data-part="detail"]')).map((d) => d.textContent);
    act(() => setCustomerMode(true));
    expect(Array.from(document.querySelectorAll('[data-part="detail"]')).map((d) => d.textContent)).toEqual(before);
  });
  it("Duschwanne: the catalogue price is apart from the rest of „Ihre Auswahl“", () => {
    const s = summary({ chosenTrayProductId: "X1" }, { productId: "X1", articleNumber: "X1", price: 199, name: "Wanne" } as never, "standard");
    expect(s?.sub).toBe("Badolux · extraflach · Art.-Nr. X1");
    expect(s?.price).toMatch(/^199,00\s€$/);
  });
});

describe("price hints in the steps (on-mode)", () => {
  const CONFIG = { "GET /admin/api/config/public": { body: arbeiten.config } };
  it("Arbeiten · Aluprofil: the hours stay, the money goes", async () => {
    fakeServer({ ...BASE, ...CONFIG });
    renderApp(`/deal/${KEY}/bu/Arbeiten`);
    await screen.findByRole("heading", { name: "Auszuführende Arbeiten" });
    await userEvent.click(screen.getByRole("button", { name: "Weitere Stelle", hidden: true }));
    const extra = () => document.querySelector('[data-part="extra"]')!;
    const hint = () => screen.getByText(/Je Position pauschal/);
    expect(extra().textContent).toBe("+50,00 € · +2 Std");
    expect(hint().textContent).toMatch(/50 € Material \+ 2 Std Arbeitszeit\.$/);
    act(() => setCustomerMode(true));
    expect(extra().textContent).toBe("+2 Std");
    expect(hint().textContent).toMatch(/Je Position pauschal 2 Std Arbeitszeit\.$/);
    expect(hint().textContent).not.toMatch(/€/);
  });
  it("Wandverkleidung · winwall accessory „Zuschnitt“: the price per plate goes, the rest stays", async () => {
    fakeServer({ ...BASE, ...CONFIG });
    renderApp(`/deal/${KEY}/bu/Wandverkleidung`);
    await screen.findByRole("heading", { name: "Wandverkleidung" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "Wandverkleidung" }));
    await toClassic(user);
    await user.click(screen.getByRole("button", { name: "Zeile hinzufügen (Dekor und Format)" }));
    const small = () => screen.getByTestId("wv-acc-cut").querySelector('[data-part="small"]')!.textContent;
    expect(small()).toBe("10 € je Platte, gerade Schnitte · aus: wir schneiden selbst");
    act(() => setCustomerMode(true));
    expect(small()).toBe("gerade Schnitte · aus: wir schneiden selbst");
  });
  it("Duschwanne: the catalogue price leaves the cards and „Ihre Auswahl“; the cards stay", async () => {
    const SEARCHES: Record<string, Reply> = Object.fromEntries(Object.entries(duschwanne.searches).map(([q, results]) => [`GET /api/trays/suggest?${q}`, { body: { results } }]));
    fakeServer({ ...BASE, ...CONFIG, ...SEARCHES });
    renderApp(`/deal/${KEY}/bu/Duschwanne`);
    await screen.findByRole("heading", { name: "Duschwanne" });
    await userEvent.click(screen.getByRole("switch", { name: "Duschwanne" }));
    fireEvent.change(screen.getByLabelText("Breite in cm"), { target: { value: "90" } });
    fireEvent.change(screen.getByLabelText("Länge in cm"), { target: { value: "120" } });
    await waitFor(() => expect(screen.getAllByTestId("tray-card").length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByTestId("tray-card")[0]!.querySelector("input")!);
    const prices = () => document.querySelectorAll('[data-testid="tray-card"] [data-part="price"]').length;
    await waitFor(() => expect(screen.getByTestId("tray-summary")).toHaveTextContent("€"));
    expect(prices()).toBeGreaterThan(0);
    const cards = screen.getAllByTestId("tray-card").length;
    act(() => setCustomerMode(true));
    expect(prices()).toBe(0);
    expect(screen.getAllByTestId("tray-card")).toHaveLength(cards);
    expect(screen.getByTestId("tray-summary")).not.toHaveTextContent("€");
    expect(screen.getByTestId("tray-summary")).toHaveTextContent("Art.-Nr.");
  });
});
