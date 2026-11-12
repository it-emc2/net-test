import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEBOUNCE_MS } from "../src/features/offer/model/usePrice.js";
import { useOfferStore } from "../src/features/offer/index.js";
import { USER, fakeServer, renderApp } from "./helpers.js";

const loggedIn = { "GET /api/auth/me": { body: { user: USER } } };
const PRICE = "POST /api/price";

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
    const s = fakeServer(loggedIn);
    renderApp("/");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    for (const name of ["Badumbau", "Badewannentür", "Handlauf", "Badelift", "Alltagshilfe"]) expect(screen.getByRole("link", { name: new RegExp(name) })).toBeInTheDocument();
    expect(s.count(PRICE)).toBe(0);
    expect(useOfferStore.getState().offer).toBeNull();
  });

  it("tile → offer: one new offer, the first step in the address, exactly ONE price request", async () => {
    const s = fakeServer({ ...loggedIn, [PRICE]: { body: { total: 1234.5, selfPayAmount: 0 } } });
    const router = renderApp("/");
    await userEvent.click(await screen.findByRole("link", { name: /Badumbau/ }));
    await screen.findByRole("navigation", { name: "Schritte" });
    expect(router.state.location.pathname).toBe("/neu/bu/Kundendaten");
    await screen.findByText("1.234,50 €");
    expect(s.count(PRICE)).toBe(1);
    expect((s.calls.find((c) => c.key === PRICE)?.body as any).activeOffer).toBe("bu");
    // only the active step is on the page
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  });

  it("a deal number in the address opens the offer for that deal", async () => {
    fakeServer({ ...loggedIn, [PRICE]: { body: { total: 0 } } });
    renderApp("/deal/4711/bwt/Kosten");
    await screen.findByText(/Badewannentür · Auftrag 4711/);
    expect(useOfferStore.getState().dealId).toBe("4711");
    expect(screen.getByRole("link", { name: "In der bisherigen Ansicht öffnen" })).toHaveAttribute("href", "/?deal=4711#Kosten");
  });

  it("back to the Hauptmenü empties the store and asks for no price", async () => {
    const s = fakeServer({ ...loggedIn, [PRICE]: { body: { total: 10 } } });
    renderApp("/neu/bl/bl");
    await screen.findByText("10,00 €");
    const before = s.count(PRICE);
    await userEvent.click(screen.getByRole("button", { name: "Zum Hauptmenü" }));
    await screen.findByRole("heading", { name: "Hauptmenü" });
    await waitFor(() => expect(useOfferStore.getState().offer).toBeNull());
    expect(s.count(PRICE)).toBe(before);
  });

  it("many changes in a row cost ONE more price request, sent with the latest state", async () => {
    const s = fakeServer({ ...loggedIn, [PRICE]: { body: { total: 10 } } });
    renderApp("/neu/bu/Kundendaten");
    await screen.findByText("10,00 €");
    expect(s.count(PRICE)).toBe(1);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => { for (let i = 0; i < 25; i++) useOfferStore.getState().patch("Kundendaten", { city: `Hof ${i}` }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50); });
    vi.useRealTimers();
    await waitFor(() => expect(s.count(PRICE)).toBe(2));
    expect((s.calls.filter((c) => c.key === PRICE)[1]?.body as any).Kundendaten.city).toBe("Hof 24");
  });

  it("unknown offer type or step: back to a valid place", async () => {
    fakeServer({ ...loggedIn, [PRICE]: { body: { total: 0 } } });
    const r1 = renderApp("/neu/hms/Kundendaten");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    expect(r1.state.location.pathname).toBe("/");
  });
});
