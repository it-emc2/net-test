// U-063: a deal opened from an appointment (offer picker) or by its number lists its stored drafts
// and offers FIRST when it has any — before a new empty offer is started and also when the deal has
// an autosaved draft. Without stored documents, or when the lookup fails or is slow, everything is
// as before (no extra tap). Made-up deals and customers only.
process.env.TZ = "Europe/Berlin";
import { homeSearchRow, type HomeSearchRow } from "@oc/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEAL_DOCS_WAIT_MS, autosavedButton, storedFirst, storedIntro, within as withinMs } from "../src/features/home/search-rules.js";
import lean from "./fixtures/home-planung-v2.json" with { type: "json" };
import { BASE, NO_DRAFT, fakeServer, renderApp, type Reply } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const DEAL = "70001"; // the deal of appointment a1 in home-planung-v2.json
const DRAFT_ID = "65a000000000000000000001";
const draftRow = (deal = DEAL): HomeSearchRow => homeSearchRow({ _type: "draft", _id: DRAFT_ID, name: "Entwurf Bad oben", firstName: "Erika", lastName: "Muster", offerType: "bu", updatedAt: "2026-11-02T09:00:00Z", payload: { auftragId: deal } }, "deal");
const offerRow = (nr = "ANG2026-1102-090000", deal = DEAL): HomeSearchRow => homeSearchRow({ _type: "offer", offerNumber: nr, firstName: "Erika", lastName: "Muster", offerType: "bu", updatedAt: "2026-11-03T09:00:00Z", payload: { auftragId: deal } }, "deal");
const draftOf = (offerType: string, extra: Record<string, unknown> = {}): Reply => ({ body: { dealId: DEAL, offerType, payload: { activeOffer: offerType, Kundendaten: { firstName: "Erika", lastName: "Muster" }, ...extra }, revision: 3, updatedAt: "2026-11-23T09:15:00.000Z", variantId: "v1", variantName: "" } });
const FAIL: Reply = { status: 500, body: { error: { code: "OFFER_SEARCH_FAILED", message: "x", requestId: "t" } } };
const BY_DEAL = `GET /api/offers/v2/by-deal/${DEAL}`;
const PLAN = {
  "GET /api/planning/v2/today": { body: lean.today }, "GET /api/planning/v2/today?date=*": { body: lean.today }, "GET /api/planning/v2/week?from=*": { body: lean.week },
  "POST /api/bitrix/log-action": { body: { ok: true } }, "GET /api/offers/by-deal/*": { body: [] },
  "GET /api/deals/*/related": { body: { dealId: DEAL, related: [] } }, "GET /api/deals/*/customer": FAIL, "GET /api/bitrix/contact/*": FAIL,
};
const IMPORT = { [`POST /api/deals/${DEAL}/draft/import`]: { body: { dealId: DEAL, revision: 1, changed: true } } };
const LEGACY = { [`GET /api/drafts/${DRAFT_ID}`]: { body: { id: DRAFT_ID, name: "Entwurf Bad oben", offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { firstName: "Erika", lastName: "Muster", notes: "aus dem Entwurf" } } } } };

/** the by-deal lookup never answers (slow server) */
function slowLookup() {
  const impl = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (url.startsWith("/api/offers/v2/by-deal/") ? new Promise<Response>(() => {}) : impl(url, init))));
}
const card = (id: string) => document.querySelector(`[data-testid="appointment"][data-id="${id}"]`) as HTMLElement;
async function pick(title: string) {
  await waitFor(() => expect(card("a1")).toBeTruthy());
  await userEvent.click(within(card("a1")).getByRole("button", { name: "In Konfigurator öffnen" }));
  await userEvent.click(await screen.findByRole("button", { name: title }));
}

describe("rules", () => {
  it("stored first: any row counts, except an offer with the autosaved draft's own number; unknown → no", () => {
    expect(storedFirst(null)).toBe(false);
    expect(storedFirst([])).toBe(false);
    expect(storedFirst([draftRow()])).toBe(true);
    expect(storedFirst([offerRow("ANG1")], "ANG1")).toBe(false);
    expect(storedFirst([offerRow("ANG1"), offerRow("ANG2")], "ANG1")).toBe(true);
    expect(storedFirst([offerRow("ANG1")], "")).toBe(true);
  });
  it("texts", () => {
    const d = { offerType: "bu", updatedAt: "2026-11-23T09:15:00.000Z", revision: 3 };
    expect(autosavedButton(d)).toBe("Automatisch gespeicherten Stand öffnen (23.11.2026, 10:15, Version 3)");
    expect(storedIntro("70001", null)).toBe("Zu Auftrag 70001 gibt es gespeicherte Entwürfe oder Angebote. Öffnen Sie eines davon oder beginnen Sie ein neues Angebot.");
    expect(storedIntro("70001", { ...d, title: "Badumbau" })).toMatch(/^Zu Auftrag 70001 gibt es einen automatisch gespeicherten Stand \(Badumbau, 23\.11\.2026, 10:15, Version 3\) und gespeicherte/);
  });
  it("within: the answer, or null when it fails or is too slow (never rejects)", async () => {
    expect(await withinMs(Promise.resolve(1), 50)).toBe(1);
    expect(await withinMs(Promise.reject(new Error("x")), 50)).toBeNull();
    expect(await withinMs(new Promise(() => {}), 20)).toBeNull();
  });
});

describe("offer picker from an appointment", () => {
  it("deal without stored documents: the offer starts at once, as before", async () => {
    const srv = fakeServer({ ...BASE, ...PLAN, [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("deal-start")).toBeNull();
    expect(srv.count(BY_DEAL)).toBe(1);
  });

  it("deal with stored documents and no draft: listed first; „Neues leeres Angebot beginnen“ starts the offer", async () => {
    fakeServer({ ...BASE, ...PLAN, [BY_DEAL]: { body: { rows: [draftRow(), offerRow()] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    const ds = await screen.findByTestId("deal-start");
    expect(screen.getByRole("dialog", { name: "Gespeicherte Entwürfe und Angebote" })).toBeInTheDocument();
    expect(ds).toHaveTextContent("Zu Auftrag 70001 gibt es gespeicherte Entwürfe oder Angebote.");
    expect(within(ds).getAllByTestId("search-row").map((r) => r.querySelector('[data-part="meta"]')!.textContent)).toEqual(["2.11.2026, 10:00:00", "ANG2026-1102-090000 · 3.11.2026, 10:00:00"]);
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(within(ds).getByRole("button", { name: "Neues leeres Angebot beginnen (Badumbau)" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
  });

  it("deal with stored documents and no draft: a row is copied into the deal's draft and opened (U-057)", async () => {
    const srv = fakeServer({ ...BASE, ...PLAN, ...IMPORT, [BY_DEAL]: { body: { rows: [draftRow()] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await userEvent.click(within(await screen.findByTestId("deal-start")).getByTestId("search-row"));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(srv.calls.find((c) => c.key === `POST /api/deals/${DEAL}/draft/import`)!.body).toEqual({ kind: "draft", id: DRAFT_ID, baseRevision: 0 });
  });

  it("deal with an autosaved draft AND stored documents: listed; the autosaved state opens on its own button; a row asks first", async () => {
    fakeServer({ ...BASE, ...PLAN, ...LEGACY, [`GET /api/deals/${DEAL}/draft`]: draftOf("bu"), [BY_DEAL]: { body: { rows: [draftRow()] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    const ds = await screen.findByTestId("deal-start");
    expect(ds).toHaveTextContent("Zu Auftrag 70001 gibt es einen automatisch gespeicherten Stand (Badumbau, 23.11.2026, 10:15, Version 3) und gespeicherte Entwürfe oder Angebote.");
    await userEvent.click(within(ds).getByTestId("search-row"));
    const q = await screen.findByTestId("takeover-question"); // U-057: the deal's draft differs → asked, nothing copied yet
    await userEvent.click(within(q).getByRole("button", { name: "Abbrechen" }));
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(within(screen.getByTestId("deal-start")).getByRole("button", { name: "Automatisch gespeicherten Stand öffnen (23.11.2026, 10:15, Version 3)" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
  });

  it("„Zurück“ goes back to the types", async () => {
    fakeServer({ ...BASE, ...PLAN, [BY_DEAL]: { body: { rows: [draftRow()] } } });
    renderApp("/");
    await pick("Badumbau");
    await userEvent.click(within(await screen.findByTestId("deal-start")).getByRole("button", { name: "Zurück" }));
    expect(await screen.findByRole("dialog", { name: "Welche Angebotsart möchten Sie öffnen?" })).toBeInTheDocument();
  });

  it("autosaved draft of ANOTHER type + stored documents: „Weiter mit …“ leads to the choice of ADR 027 B", async () => {
    fakeServer({ ...BASE, ...PLAN, [`GET /api/deals/${DEAL}/draft`]: draftOf("bu"), [BY_DEAL]: { body: { rows: [draftRow()] } } });
    const router = renderApp("/");
    await pick("Alltagshilfe");
    await userEvent.click(within(await screen.findByTestId("deal-start")).getByRole("button", { name: "Weiter mit Alltagshilfe" }));
    const c = await screen.findByTestId("picker-choice");
    expect(within(c).getByRole("button", { name: "Bestehendes Angebot (Badumbau) öffnen" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Weiteres Angebot (Alltagshilfe) für diesen Kunden anlegen" })).toBeInTheDocument();
    await userEvent.click(within(c).getByRole("button", { name: "Zurück" }));
    expect(await screen.findByTestId("deal-start")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });

  it("only the autosaved draft's own offer: opens at once, as before", async () => {
    fakeServer({ ...BASE, ...PLAN, [`GET /api/deals/${DEAL}/draft`]: draftOf("bu", { offerNumber: "ANG2026-1102-090000" }), [BY_DEAL]: { body: { rows: [offerRow()] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("deal-start")).toBeNull();
  });

  it("lookup fails: the offer starts as before", async () => {
    fakeServer({ ...BASE, ...PLAN, [BY_DEAL]: FAIL });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("deal-start")).toBeNull();
  });

  it("lookup never answers: the offer starts after the wait, as before", async () => {
    fakeServer({ ...BASE, ...PLAN });
    slowLookup();
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/), { timeout: DEAL_DOCS_WAIT_MS + 2000 });
    expect(screen.queryByTestId("deal-start")).toBeNull();
  });
});

describe("„Öffnen“ with a deal number", () => {
  const HOME = { "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/offers/v2/search*": { body: { rows: [] } } };
  const open = async () => { await userEvent.type(await screen.findByLabelText("Öffnen"), `${DEAL}{Enter}`); };

  it("autosaved draft, no stored documents: straight into the draft, as before", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt"), [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await open();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/));
  });

  it("no draft: the message, the tiles and the list, as before (one lookup)", async () => {
    const srv = fakeServer({ ...BASE, ...HOME, "GET /api/deals/*/draft": NO_DRAFT, [BY_DEAL]: { body: { rows: [draftRow()] } } });
    renderApp("/");
    await open();
    await screen.findByText(/Für Auftrag 70001 gibt es noch kein Angebot/);
    expect(await screen.findByTestId("deal-documents")).toHaveTextContent("Erika Muster");
    expect(screen.getByRole("link", { name: /Badumbau/ })).toHaveAttribute("href", "/deal/70001/bu");
    expect(screen.queryByTestId("deal-start")).toBeNull();
    expect(srv.count(BY_DEAL)).toBe(1);
  });

  it("autosaved draft AND stored documents: listed instead of jumping into the draft; its button opens it", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt"), [BY_DEAL]: { body: { rows: [draftRow(), offerRow()] } } });
    const router = renderApp("/");
    await open();
    const ds = await screen.findByTestId("deal-start");
    expect(router.state.location.pathname).toBe("/");
    expect(ds).toHaveTextContent("automatisch gespeicherten Stand (Badewannentür, 23.11.2026, 10:15, Version 3)");
    expect(within(ds).getAllByTestId("search-row")).toHaveLength(2);
    expect(within(ds).queryByRole("button", { name: "Zurück" })).toBeNull();
    await userEvent.click(within(ds).getByRole("button", { name: "Automatisch gespeicherten Stand öffnen (23.11.2026, 10:15, Version 3)" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/));
  });

  it("typing again closes the list", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt"), [BY_DEAL]: { body: { rows: [draftRow()] } } });
    renderApp("/");
    await open();
    await screen.findByTestId("deal-start");
    await userEvent.type(screen.getByLabelText("Öffnen"), "1");
    expect(screen.queryByTestId("deal-start")).toBeNull();
  });

  it("lookup fails: straight into the draft, as before", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt"), [BY_DEAL]: FAIL });
    const router = renderApp("/");
    await open();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/));
  });

  it("lookup never answers: straight into the draft after the wait, as before", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt") });
    slowLookup();
    const router = renderApp("/");
    await open();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/), { timeout: DEAL_DOCS_WAIT_MS + 2000 });
  });
});
