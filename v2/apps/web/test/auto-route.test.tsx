// The way to the customer is worked out by itself (UX-CHANGES U-011 B4, owner 2026-11-17: "auto
// apply time always"): as soon as the address is known, on Kundendaten or on Arbeitszeit; again
// when the address changes, also over a value typed by hand; never for an offer that is opened
// with its way already filled in; and nothing blocks when no route comes.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { AUTO_ROUTE_MS, STALE, addressKey, needsRoute } from "../src/features/steps/arbeitszeit/auto-route.js";
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567", ROUTE = "POST /api/routing/suggest-distance";
type Obj = Record<string, any>;
const FOUND: Reply = { body: { ok: true, oneWayKm: 12.34, roundTripKm: 24.68, oneWaySeconds: 20 * 60, from: { address: "Firma" }, to: { address: "Musterweg 4, 95028 Hof" } } };
const DOWN: Reply = { status: 504, body: { ok: false, error: { code: "ROUTING_TIMEOUT", message: "Routenvorschlag gerade nicht verfügbar.", requestId: "t" } } };
const ADDRESS = { street: "Musterweg 4", postalCode: "95028", city: "Hof" };
const az = () => ((useOfferStore.getState().offer as Obj).Arbeitszeit ?? {}) as Obj;
const setKd = (fields: Obj) => useOfferStore.getState().patch("Kundendaten" as never, fields as never);
const draft = (payload: Obj): Reply => ({ body: { dealId: KEY, offerType: "bu", payload: { activeOffer: "bu", ...payload }, revision: 3, updatedAt: "2026-11-12T10:00:00Z" } });
const was = AUTO_ROUTE_MS.wait;
beforeEach(() => { AUTO_ROUTE_MS.wait = 20; });
afterEach(() => { AUTO_ROUTE_MS.wait = was; });
const quiet = (ms = 120) => new Promise((r) => setTimeout(r, ms));

describe("the automatic route — rules", () => {
  it("an address is enough to ask with a full PLZ or a town", () => {
    expect(addressKey({ street: "Musterweg 4" })).toBe("");
    expect(addressKey({ postalCode: "950" })).toBe("");
    expect(addressKey({ postalCode: "95028" })).toBe("|95028|");
    expect(addressKey({ street: " Musterweg 4 ", city: "Hof" })).toBe("musterweg 4||hof");
  });

  it("asked for: an opened offer only while its way is missing; afterwards whenever the address changes", () => {
    expect(needsRoute({}, "", undefined)).toBe(false);
    expect(needsRoute({}, "a", undefined)).toBe(true);
    expect(needsRoute({ distanceKm: "12.3" }, "a", undefined)).toBe(true); // the travel time is missing
    expect(needsRoute({ distanceKm: "12.3", travelTimeHHMM: "0:20" }, "a", undefined)).toBe(false);
    expect(needsRoute({ distanceKm: "12.3", travelTimeHHMM: "0:20" }, "b", "a")).toBe(true);
    expect(needsRoute({}, "a", "a")).toBe(false); // emptied by hand: not filled again behind the user's back
  });
});

describe("the automatic route — on the pages", () => {
  it("Kundendaten: once the address is typed, distance and travel time are filled in — one call, after the typing stopped", async () => {
    const server = fakeServer({ ...BASE, [ROUTE]: FOUND });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByLabelText("Vorname");
    setKd({ street: "Musterweg 4" }); setKd({ postalCode: "9502" }); setKd({ postalCode: "95028" }); setKd({ city: "Ho" }); setKd({ city: "Hof" });
    await waitFor(() => expect([az().distanceKm, az().travelTimeHHMM]).toEqual(["12.3", "0:20"]));
    await quiet();
    expect(server.count(ROUTE)).toBe(1);
    expect(server.calls.find((c) => c.key === ROUTE)!.body).toEqual({ Kundendaten: { ...ADDRESS, state: "", country: "" } });
    expect(typeof az().totalHoursNumeric).toBe("number"); // what follows from the entries is kept up to date in the same change
  });

  it("Arbeitszeit: an offer with an address but no way gets it on opening, and the page says where it came from", async () => {
    fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS }), [ROUTE]: FOUND });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await waitFor(() => expect((screen.getByLabelText(/Wie viele Kilometer/) as HTMLInputElement).value).toBe("12.3"));
    expect(screen.getByTestId("az-routing").textContent).toContain("Vorschlag: 12,3 km (Hin- & Rückfahrt: 24,7 km) ✓ Automatisch eingetragen");
  });

  it("an offer opened with its way filled in is left alone", async () => {
    const server = fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS, Arbeitszeit: { distanceKm: "40", travelTimeHHMM: "0:45" } }), [ROUTE]: FOUND });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await screen.findByRole("heading", { name: "Anfahrt" });
    await quiet();
    expect(server.count(ROUTE)).toBe(0);
    expect(useOfferStore.getState().version).toBe(0);
    expect([az().distanceKm, az().travelTimeHHMM]).toEqual(["40", "0:45"]);
  });

  it("the address changes: the way is worked out again — also over a value typed by hand", async () => {
    const server = fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS, Arbeitszeit: { distanceKm: "40", travelTimeHHMM: "0:45" } }), [ROUTE]: FOUND });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await screen.findByRole("heading", { name: "Anfahrt" });
    await quiet(60);
    setKd({ city: "Bayreuth", postalCode: "95444" });
    await waitFor(() => expect([az().distanceKm, az().travelTimeHHMM]).toEqual(["12.3", "0:20"]));
    expect(server.count(ROUTE)).toBe(1);
  });

  it("no route for a new offer: nothing is said, nothing is filled in, nothing stops", async () => {
    fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS }), [ROUTE]: DOWN });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await screen.findByRole("heading", { name: "Anfahrt" });
    await quiet();
    expect(screen.queryByTestId("az-routing")).toBeNull();
    expect(az().distanceKm ?? "").toBe("");
  });

  it("the address changed and no route comes: the page says the way still belongs to the old address", async () => {
    fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS, Arbeitszeit: { distanceKm: "40", travelTimeHHMM: "0:45" } }), [ROUTE]: DOWN });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await screen.findByRole("heading", { name: "Anfahrt" });
    await quiet(60);
    setKd({ city: "Bayreuth", postalCode: "95444" });
    await waitFor(() => expect(screen.getByTestId("az-routing").textContent).toBe(STALE));
    expect([az().distanceKm, az().travelTimeHHMM]).toEqual(["40", "0:45"]);
  });

  it("the button still asks again and says every outcome", async () => {
    const server = fakeServer({ ...BASE, "GET /api/deals/*/draft": draft({ Kundendaten: ADDRESS, Arbeitszeit: { distanceKm: "40", travelTimeHHMM: "0:45" } }), [ROUTE]: FOUND });
    renderApp(`/deal/${KEY}/bu/Arbeitszeit`);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Strecke aus Adresse vorschlagen" }));
    await waitFor(() => expect(az().distanceKm).toBe("12.3"));
    expect(server.count(ROUTE)).toBe(1);
  });
});
