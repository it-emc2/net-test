// Opening an offer after a full page load asks for its price once (load-time work, 2026-11).
// The frame's hook mounts while the draft is loading; when the draft then opens with unsaved input
// from the device snapshot (version 1), that hook must not ask at once for its outdated key — the
// same offer would be priced twice (seen on the iPad: Kosten opened before the autosave).
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { BASE, fakeServer, renderApp } from "./helpers.js";

const draft = { body: { dealId: "4711", offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city: "Alt" } }, revision: 5, updatedAt: "2026-11-12T10:00:00Z", updatedBy: "x" } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
beforeEach(() => { localStorage.clear(); usePrefs.getState().setAutosave(true); useOfferStore.getState().close(); });

describe("price on opening an offer", () => {
  it("a stored draft: one price call", async () => {
    const s = fakeServer({ ...BASE, "GET /api/deals/4711/draft": draft });
    renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByLabelText("Vorname")).toBeInTheDocument();
    await waitFor(() => expect(s.count("POST /api/price")).toBe(1));
    await wait(700); // past the price delay (250 ms)
    expect(s.count("POST /api/price")).toBe(1);
  });

  it("a stored draft with newer input on the device (snapshot): one price call, with that input", async () => {
    localStorage.setItem("oc.snapshot.4711", JSON.stringify({ at: 1, revision: 5, offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city: "Neu" } } }));
    const s = fakeServer({ ...BASE, "GET /api/deals/4711/draft": draft });
    renderApp("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten.city).toBe("Neu"));
    await waitFor(() => expect(s.count("POST /api/price")).toBe(1));
    await wait(700);
    expect(s.count("POST /api/price")).toBe(1);
    expect((s.calls.find((c) => c.key === "POST /api/price")!.body as any).Kundendaten.city).toBe("Neu");
  });
  // the price cache names the offer: the change count alone starts at 0 for every opened offer
  it("a second offer opened in the same session gets its own price — never the first offer's cached one", async () => {
    const second = { body: { ...draft.body, dealId: "4712", payload: { activeOffer: "bu", Kundendaten: { city: "Zweite" } } } };
    const s = fakeServer({ ...BASE, "GET /api/deals/4711/draft": draft, "GET /api/deals/4712/draft": second,
      "POST /api/price": (body) => ({ body: { total: (body as any).Kundendaten.city === "Zweite" ? 222 : 111 } }) });
    const router = renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByLabelText("Vorname")).toBeInTheDocument();
    await waitFor(() => expect(s.count("POST /api/price")).toBe(1));
    await router.navigate("/deal/4712/bu/Kundendaten");
    await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten.city).toBe("Zweite"));
    await waitFor(() => expect(s.count("POST /api/price")).toBe(2));
    const bodies = s.calls.filter((c) => c.key === "POST /api/price").map((c) => (c.body as any).Kundendaten.city);
    expect(bodies).toEqual(["Alt", "Zweite"]);
    await wait(700);
    expect(s.count("POST /api/price")).toBe(2);
  });

  // found 2026-11-24 with two variants: back on the first one the page showed the price it had when it was first opened
  it("the same offer opened again after it changed gets a new price — not the one cached at its first opening", async () => {
    let opened = 0;
    const second = { body: { ...draft.body, dealId: "4712", payload: { activeOffer: "bu", Kundendaten: { city: "Zweite" } } } };
    const s = fakeServer({ ...BASE, "GET /api/deals/4712/draft": second,
      "GET /api/deals/4711/draft": () => ({ body: { ...draft.body, payload: { activeOffer: "bu", Kundendaten: { city: opened++ === 0 ? "Alt" : "Geändert" } } } }),
      "POST /api/price": (body) => ({ body: { total: (body as any).Kundendaten.city.length } }) });
    const router = renderApp("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(s.count("POST /api/price")).toBe(1));
    await router.navigate("/deal/4712/bu/Kundendaten");
    await waitFor(() => expect(s.count("POST /api/price")).toBe(2));
    await router.navigate("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten.city).toBe("Geändert"));
    await waitFor(() => expect(s.count("POST /api/price")).toBe(3));
    expect(s.calls.filter((c) => c.key === "POST /api/price").map((c) => (c.body as any).Kundendaten.city)).toEqual(["Alt", "Zweite", "Geändert"]);
  });
});
