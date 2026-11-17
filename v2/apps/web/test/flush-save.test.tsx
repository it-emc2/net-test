// The page may go away before the autosave delay: input is kept in a snapshot and restored.
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const S = () => useOfferStore.getState();
const SNAP = "oc.snapshot.4711";
const PATH = "/deal/4711/bu/Kundendaten";
const draft = (revision: number, city: string) => ({ body: { dealId: "4711", offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city } }, revision, updatedAt: "2026-11-12T10:00:00Z", updatedBy: "x" } });
const reopen = () => { cleanup(); useOfferStore.getState().close(); };
beforeEach(() => { localStorage.clear(); usePrefs.getState().setAutosave(true); });

describe("flush on page hide", () => {
  it("typed, pagehide, reopened: the value is back and goes up to the server", async () => {
    const put = { "PUT /api/deals/4711/draft": { body: { dealId: "4711", revision: 1, changed: true } } };
    fakeServer({ ...BASE, ...put });
    renderApp(PATH);
    await userEvent.type(await screen.findByLabelText("Vorname"), "Erika");
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem(SNAP)!).payload.Kundendaten.firstName).toBe("Erika");
    reopen();
    const s = fakeServer({ ...BASE, ...put }); // a reload: the server has nothing newer
    renderApp(PATH);
    expect(await screen.findByLabelText("Vorname")).toHaveValue("Erika");
    await waitFor(() => expect(s.count("PUT /api/deals/4711/draft")).toBe(1));
    await waitFor(() => expect(localStorage.getItem(SNAP)).toBeNull());
  });

  it("a newer server draft wins over an older snapshot", async () => {
    localStorage.setItem(SNAP, JSON.stringify({ at: 1, revision: 3, offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city: "Alt" } } }));
    fakeServer({ ...BASE, "GET /api/deals/4711/draft": draft(5, "Neu") });
    renderApp(PATH);
    await waitFor(() => expect(S().offer?.Kundendaten.city).toBe("Neu"));
    expect(S().version).toBe(S().savedVersion);
    expect(localStorage.getItem(SNAP)).toBeNull();
  });

  it("autosave off: the snapshot is kept, nothing is uploaded", async () => {
    usePrefs.getState().setAutosave(false);
    const s = fakeServer({ ...BASE, "PUT /api/deals/4711/draft": { body: { dealId: "4711", revision: 1, changed: true } } });
    renderApp(PATH);
    await userEvent.type(await screen.findByLabelText("Vorname"), "E");
    document.dispatchEvent(new Event("visibilitychange")); // jsdom: visible → no write
    expect(localStorage.getItem(SNAP)).toBeNull();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    expect(localStorage.getItem(SNAP)).not.toBeNull();
    reopen();
    renderApp(PATH);
    expect(await screen.findByLabelText("Vorname")).toHaveValue("E");
    expect(s.count("PUT /api/deals/4711/draft")).toBe(0);
    expect(S().version).toBeGreaterThan(S().savedVersion);
  });
});
