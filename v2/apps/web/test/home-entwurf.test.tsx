// Hauptmenü „Öffnen“: the search in stored drafts and offers, opening a result, and the pick list of
// a Bitrix contact's deals — replayed against the recording of today's UI (fixtures/home-entwurf.json,
// v2/scripts/capture-home-entwurf.cjs; made-up test customers). Deliberate differences (UX-CHANGES
// U-057) are asserted as such.
process.env.TZ = "Europe/Berlin"; // the recording's dates and times
import { homeSearchRow, type HomeSearchRow } from "@oc/api-contract";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { moveActive, rowView, sameState } from "../src/features/home/search-rules.js";
import recorded from "./fixtures/home-entwurf.json" with { type: "json" };
import lean from "./fixtures/home-planung-v2.json" with { type: "json" };
import sendBases from "./fixtures/versand-senden.json" with { type: "json" };
import { BASE, NO_DRAFT, fakeServer, renderApp, type Reply } from "./helpers.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const capture = await import("../../../scripts/capture-home-entwurf.cjs" as string) as { default: { seedDocs: (b: unknown) => { drafts: any[]; offers: any[] }; CONTACT: (id: string, who: unknown) => unknown; ERIKA: unknown } };
const { seedDocs, CONTACT, ERIKA } = capture.default;
const DOCS = seedDocs((sendBases as any).bases);
const S = (recorded as { scenarios: any[] }).scenarios;
const scen = (name: string) => S.find((s) => s.name === name)!;
const FAIL = (code = "X", status = 500): Reply => ({ status, body: { error: { code, message: "Die Suche ist gerade nicht möglich.", requestId: "t" } } });
afterEach(() => vi.unstubAllGlobals());

const rowsOf = (s: any): HomeSearchRow[] => s.answer.rows.map((r: Record<string, unknown>) => homeSearchRow(r, "search"));
const searchKey = (q: string) => `GET /api/offers/v2/search?q=${encodeURIComponent(q)}&limit=20`;
const shownRows = () => screen.queryAllByTestId("search-row").map((b) => ({
  title: b.querySelector('[data-part="title"]')!.textContent,
  badges: [...b.querySelectorAll('[data-part="badges"] > span')].map((x) => x.textContent),
  meta: b.querySelector('[data-part="meta"]')?.textContent ?? "",
  snippet: b.querySelector('[data-part="snippet"]')?.textContent ?? "",
  active: b.className.includes("border-primary"),
}));
const today = { "GET /api/planning/v2/today": { body: { ok: true, plan: null } } };

describe("rules", () => {
  it("a row: today's texts from a search-all result; quirks kept", () => {
    const s = scen("search by name, several results");
    expect(rowsOf(s).map(rowView)).toEqual(s.view.rows.map(({ active: _a, ...r }: any) => r));
    const r = homeSearchRow({ _type: "draft", _id: "abc", name: "", offerType: "hl", payload: { postal: { auftragId: "4711" } } });
    expect(r).toMatchObject({ kind: "draft", title: "Entwurf ohne Titel", ref: "abc", deal: "4711" });
    expect(homeSearchRow({ _type: "offer", offerNumber: "ANG1", firstName: "Max", lastName: "Muster", updatedAt: "2026-11-01T00:00:00Z" }, "deal")).toMatchObject({ title: "Max Muster", ref: "ANG1" });
    expect(homeSearchRow({ _type: "offer", offerNumber: "ANG1", payload: { auftragId: "t-1" } }).deal).toBe(""); // only a deal number
  });
  it("arrows clamp; same state ignores key order", () => {
    expect([moveActive(0, "ArrowUp", 3), moveActive(2, "ArrowDown", 3), moveActive(0, "ArrowDown", 3)]).toEqual([0, 2, 1]);
    expect(sameState({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 })).toBe(true);
    expect(sameState({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("search (parity with today's UI)", () => {
  it.each(S.filter((s) => s.kind === "search").map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const srv = fakeServer({ ...BASE, ...today, [searchKey(s.q)]: s.answer ? { body: { rows: rowsOf(s) } } : FAIL("OFFER_SEARCH_FAILED") });
    renderApp("/");
    const input = await screen.findByLabelText("Öffnen");
    expect(input).toHaveAttribute("placeholder", s.placeholder);
    await userEvent.type(input, s.q);
    if (!s.answer) {
      // U-057: said in the app's words, with a retry (today: „Suche fehlgeschlagen. Prüfen Sie /api/offers/search-all.“)
      await screen.findByText("Die Suche hat gerade nicht geklappt. Bitte versuchen Sie es erneut.");
      expect(s.view.status).toBe("Suche fehlgeschlagen. Prüfen Sie /api/offers/search-all.");
      await userEvent.click(within(screen.getByTestId("search-error")).getByRole("button", { name: "Erneut versuchen" }));
      await waitFor(() => expect(srv.count(searchKey(s.q))).toBe(2));
      return;
    }
    if (s.view.status) await screen.findByText(s.view.status);
    else await waitFor(() => expect(shownRows()).toEqual(s.view.rows));
    // one request per pause in typing, as today (the recording typed one key every 60 ms)
    expect(srv.calls.filter((c) => c.key.startsWith("GET /api/offers/v2/search")).map((c) => c.key)).toEqual([searchKey(s.q)]);
    expect(s.searchRequests).toEqual([`/api/offers/search-all?q=${encodeURIComponent(s.q).replace(/%20/g, "+")}&limit=20`]);
    expect(srv.count("POST /api/price")).toBe(0);
  });

  it("arrows move the active row, Escape closes the list, an empty field closes it", async () => {
    const s = scen("search by name, several results");
    fakeServer({ ...BASE, ...today, [searchKey(s.q)]: { body: { rows: rowsOf(s) } } });
    renderApp("/");
    const input = await screen.findByLabelText("Öffnen");
    await userEvent.type(input, s.q);
    await waitFor(() => expect(shownRows()).toHaveLength(7));
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}");
    expect(shownRows().findIndex((r) => r.active)).toBe(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTestId("search-results")).toBeNull();
    await userEvent.clear(input);
    expect(screen.queryByTestId("search-results")).toBeNull();
  });
});

/** a fake server that keeps the deal drafts written by the import */
function dealServer(extra: Record<string, Reply> = {}, drafts: Record<string, any> = {}) {
  const store: Record<string, any> = { ...drafts };
  const imports: { key: string; body: any }[] = [];
  const srcOf = (b: any) => (b.kind === "draft" ? DOCS.drafts.find((d) => d._id === b.id) : DOCS.offers.find((o) => o.offerNumber === b.offerNumber));
  const handlers: Record<string, Reply | ((body: unknown) => Reply)> = {
    ...BASE, ...today,
    "GET /api/deals/*/draft": NO_DRAFT,
    "GET /api/deals/*/sends": { body: { ok: true, sends: [] } },
    "GET /api/deals/*/related": { body: { dealId: "x", related: [] } },
    "GET /api/drafts/*": { status: 404, body: { error: { code: "NOT_FOUND", message: "x", requestId: "t" } } },
    ...extra,
  };
  const srv = fakeServer(handlers);
  const impl = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const m = url.match(/^\/api\/deals\/([^/?]+)\/draft(\/import)?(\?.*)?$/);
    if (m) {
      const key = m[1]!;
      if (m[2] && init.method === "POST") {
        srv.calls.push({ key: `POST ${url}`, body: JSON.parse(String(init.body)), signal: undefined });
        const b = JSON.parse(String(init.body));
        imports.push({ key: url, body: b });
        const cur = store[key];
        if ((cur?.revision ?? 0) !== b.baseRevision) return new Response(JSON.stringify({ error: { code: "REVISION_CONFLICT", message: "geändert", requestId: "t" } }), { status: 409 });
        const src = srcOf(b);
        store[key] = { dealId: key, offerType: src.offerType, payload: structuredClone(src.payload), revision: (cur?.revision ?? 0) + 1, updatedAt: "2026-11-23T10:00:00.000Z", variantId: "v1", variantName: "", related: [] };
        return new Response(JSON.stringify({ dealId: key, revision: store[key].revision, changed: true }), { status: 200 });
      }
      if (!init.method || init.method === "GET") {
        srv.calls.push({ key: `GET ${url}`, body: undefined, signal: undefined });
        if (store[key]) return new Response(JSON.stringify(store[key]), { status: 200 });
      }
    }
    const d = url.match(/^\/api\/drafts\/([0-9a-f]{24})$/);
    if (d) { const doc = DOCS.drafts.find((x) => x._id === d[1]); if (doc) return new Response(JSON.stringify({ id: doc._id, name: doc.name, offerType: doc.offerType, payload: doc.payload }), { status: 200 }); }
    const o = url.match(/^\/api\/offers\/(ANG[^/?]+)$/);
    if (o) { const doc = DOCS.offers.find((x) => x.offerNumber === decodeURIComponent(o[1]!)); return doc ? new Response(JSON.stringify({ ok: true, offer: doc }), { status: 200 }) : new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Angebot nicht gefunden", requestId: "t" } }), { status: 404 }); }
    return impl(url, init);
  }));
  return { srv, store, imports };
}

async function search(s: any) {
  const input = await screen.findByLabelText("Öffnen");
  await userEvent.type(input, s.q);
  await waitFor(() => expect(shownRows()).toEqual(s.view.rows));
  return screen.getAllByTestId("search-row")[s.opened]!;
}

describe("opening a result", () => {
  const offer = () => useOfferStore.getState().offer as Record<string, any>;
  const openScenarios = S.filter((s) => s.kind === "open" && !s.name.includes("different autosaved") && !s.name.includes("hms"));
  it.each(openScenarios.map((s) => [s.name, s] as const))("%s: becomes the deal's draft and opens", async (_n, s) => {
    const { imports } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } });
    const router = renderApp("/");
    await userEvent.click(await search(s));
    const key = s.after.expectedDeal || "t-[0-9a-f]{24}";
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${key}/${s.after.offerType}`)));
    const row = rowsOf(s)[s.opened]!;
    expect(imports.map((i) => i.body)).toEqual([row.kind === "draft" ? { kind: "draft", id: row.id, baseRevision: 0 } : { kind: "offer", offerNumber: row.offerNumber, baseRevision: 0 }]);
    // the same customer and deal number as today's form after the restore
    await waitFor(() => expect(offer()?.Kundendaten).toMatchObject({ firstName: s.after.firstName, lastName: s.after.lastName }));
    expect(offer().auftragId ?? "").toBe(s.after.auftragId);
    // a stored offer keeps its number (today too); a draft without number gets one later (today: at once)
    if (row.kind === "offer" || /^ANG2026/.test(s.after.offerNumber)) expect(offer().offerNumber).toBe(s.after.offerNumber);
    // today the autosave then saves the same state into the deal draft: revision 1 there and here
    expect(s.after.server.revision).toBe(1);
  });

  it("hms and wd results are React rows now (U-066 / U-067): buttons, no link to today's view", async () => {
    const s = scen("open an hms draft");
    const { imports } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } });
    renderApp("/");
    const row = await search(s);
    expect(row.tagName).toBe("BUTTON"); // the HMS draft
    expect(within(row).queryByText("In der bisherigen Ansicht öffnen")).toBeNull();
    const wd = screen.getAllByTestId("search-row")[0]!;
    expect(wd.tagName).toBe("BUTTON"); // the WD offer: Winterdienst is built in React (U-066)
    expect(imports).toEqual([]);
    expect(s.after.offerType).toBe("hms"); // today opens it in its own form
  });

  describe("the deal already has an autosaved draft that differs (U-057: asked, today overwritten)", () => {
    const s = scen("open a draft whose deal has a different autosaved draft");
    const src = DOCS.drafts.find((d) => d._id === rowsOf(s)[s.opened]!.id)!;
    const autosaved = () => ({ "70014": { dealId: "70014", offerType: "bwt", payload: { ...structuredClone(src.payload), Kundendaten: { ...src.payload.Kundendaten, notes: "Stand vom Gerät" } }, revision: 1, updatedAt: "2026-11-23T09:15:00.000Z", variantId: "v1", variantName: "", related: [] } });
    it("today: the autosave replaced it silently (revision 2, the device's note gone)", () => {
      expect(s.requests).toContainEqual({ method: "PUT", path: "/api/deals/70014/draft", baseRevision: 1 });
      expect(s.after.server).toMatchObject({ revision: 2, notes: "" });
    });
    it("„… übernehmen“ copies it as a new version", async () => {
      const { imports, store } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } }, autosaved());
      const router = renderApp("/");
      await userEvent.click(await search(s));
      const q = await screen.findByTestId("takeover-question");
      expect(q).toHaveTextContent("Zu Auftrag 70014 gibt es bereits einen automatisch gespeicherten Stand (Badewannentür, 23.11.2026, 10:15, Version 1).");
      expect(imports).toEqual([]);
      await userEvent.click(within(q).getByRole("button", { name: "Entwurf „ANG-BWT-Max-Muster-04112026-090000“ übernehmen" }));
      await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70014\/bwt/));
      expect(imports).toEqual([{ key: "/api/deals/70014/draft/import?variant=v1", body: { kind: "draft", id: src._id, baseRevision: 1 } }]);
      expect(store["70014"].revision).toBe(2);
    });
    it("„Automatisch gespeicherten Stand öffnen“ opens it unchanged; „Abbrechen“ does nothing", async () => {
      const { imports } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } }, autosaved());
      const router = renderApp("/");
      await userEvent.click(await search(s));
      await userEvent.click(within(await screen.findByTestId("takeover-question")).getByRole("button", { name: "Abbrechen" }));
      expect(screen.queryByTestId("takeover-question")).toBeNull();
      await userEvent.click(screen.getByLabelText("Öffnen")); // the list comes back with the focus
      await userEvent.click((await screen.findAllByTestId("search-row"))[s.opened]!);
      await userEvent.click(await screen.findByRole("button", { name: /^Automatisch gespeicherten Stand öffnen \(23\.11\.2026, 10:15, Version 1\)/ }));
      await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70014\/bwt/));
      await waitFor(() => expect(useOfferStore.getState().offer?.Kundendaten).toMatchObject({ notes: "Stand vom Gerät" }));
      expect(imports).toEqual([]);
    });
    it("changed meanwhile (REVISION_CONFLICT): asked again with the new state, nothing overwritten", async () => {
      const { store, imports } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } }, autosaved());
      renderApp("/");
      await userEvent.click(await search(s));
      const q = await screen.findByTestId("takeover-question");
      store["70014"] = { ...store["70014"], revision: 2 }; // another device saved
      await userEvent.click(within(q).getByRole("button", { name: /übernehmen$/ }));
      await screen.findByText("Der Stand dieses Auftrags wurde gerade an anderer Stelle geändert.");
      expect(screen.getByTestId("takeover-question")).toHaveTextContent("Version 2");
      expect(imports.map((i) => i.body.baseRevision)).toEqual([1]);
      expect(store["70014"].payload.Kundendaten.notes).toBe("Stand vom Gerät");
    });
    it("the deal's draft IS this document already: opened, nothing asked or copied", async () => {
      const same = { "70014": { ...autosaved()["70014"], payload: structuredClone(src.payload) } };
      const { imports } = dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } } }, same);
      const router = renderApp("/");
      await userEvent.click(await search(s));
      await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70014\/bwt/));
      expect(imports).toEqual([]);
      expect(screen.queryByTestId("takeover-question")).toBeNull();
    });
  });

  it("a sent offer opens as stored: its number, and the deal's sends make it read as sent", async () => {
    const s = scen("open a sent offer");
    const sends = { body: { ok: true, sends: [{ sendId: "s-1", status: "done", channel: "email", offerNumber: "ANG2026-1106-100000", dealId: "70016" }] } };
    dealServer({ [searchKey(s.q)]: { body: { rows: rowsOf(s) } }, "GET /api/deals/70016/sends": sends });
    const router = renderApp("/");
    await userEvent.click(await search(s));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70016\/bwt/));
    await waitFor(() => expect((useOfferStore.getState().offer as any)?.offerNumber).toBe("ANG2026-1106-100000"));
    expect(s.after).toMatchObject({ sent: true, offerNumber: "ANG2026-1106-100000" }); // today: read-only with „Neue Version erstellen“
  });

  it("today shows EVERY stored offer as sent (likely bug); React only a sent one", () => {
    expect(scen("open a stored offer (not sent)").after.sent).toBe(true);
  });

  it("ANG number + Enter opens that offer; an unknown number says so", async () => {
    const { imports } = dealServer({ "GET /api/offers/v2/search*": { body: { rows: [] } } });
    const router = renderApp("/");
    const input = await screen.findByLabelText("Öffnen");
    await userEvent.type(input, "ANG2026-0000-000000{Enter}");
    await screen.findByText("Angebot wurde nicht gefunden.");
    await userEvent.clear(input);
    await userEvent.type(input, `ANG2026-1105-100000{Enter}`);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70015\/bu/));
    expect(imports.map((i) => i.body)).toEqual([{ kind: "offer", offerNumber: "ANG2026-1105-100000", baseRevision: 0 }]);
  });

  it("a deal without React draft lists its stored drafts and offers (today's deal dialog)", async () => {
    const row = homeSearchRow({ _type: "draft", _id: DOCS.drafts[0]._id, name: DOCS.drafts[0].name, firstName: "Erika", lastName: "Muster", offerType: "bu", updatedAt: "2026-11-01T09:00:00Z", payload: { auftragId: "70011" } }, "deal");
    const { imports } = dealServer({ "GET /api/offers/v2/by-deal/70011": { body: { rows: [row] } } });
    const router = renderApp("/");
    await userEvent.type(await screen.findByLabelText("Öffnen"), "70011{Enter}");
    await screen.findByText("Vorhandene Entwürfe / Angebote für diesen Deal");
    const r = screen.getByTestId("deal-documents").querySelector('[data-testid="search-row"]') as HTMLElement;
    expect(r).toHaveTextContent("Erika Muster");
    await userEvent.click(r);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70011\/bu/));
    expect(imports).toHaveLength(1);
  });
});

describe("a contact with several deals: the pick list (today: summary widget „Deal:“)", () => {
  const KEY = "t-0123456789abcdef01234567";
  const offer = () => useOfferStore.getState().offer as Record<string, any>;
  const deals = (name: string) => ({ several: [{ id: "70021", title: "Badumbau Muster" }, { id: "70022", title: "Handlauf Muster" }, { id: "70023", title: "" }], one: [{ id: "70021", title: "Badumbau Muster" }], none: [], fail: null }[scen(name).deals as string]);
  const contactNames = S.filter((s) => s.kind === "pick" && !s.name.startsWith("appointment")).map((s) => s.name);
  it.each(contactNames)("%s", async (name) => {
    const s = scen(name);
    const list = deals(name);
    const srv = fakeServer({
      ...BASE,
      "GET /api/bitrix/contact/5001": { body: { result: CONTACT("5001", ERIKA) } },
      "GET /api/bitrix/contact/5001/deals": list ? { body: { deals: list } } : FAIL("BITRIX_ERROR"),
      "GET /api/deals/*/customer": FAIL("BITRIX_UNAVAILABLE", 502),
    });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    fireEvent.change(screen.getByLabelText("Bitrix Kontakt ID"), { target: { value: "5001" } });
    await userEvent.click(screen.getByRole("button", { name: "Kontakt aus Bitrix laden" }));
    await waitFor(() => expect(offer().Kundendaten.firstName).toBe("Erika"));
    await waitFor(() => expect(srv.count("GET /api/bitrix/contact/5001/deals")).toBe(1));
    if (s.view.buttons.length) {
      const pick = await screen.findByTestId("kd-deal-pick");
      // the same deals in the same order; the title as Bitrix gives it beside the number (U-057)
      expect(within(pick).getAllByRole("button").map((b) => b.getAttribute("data-deal"))).toEqual(s.view.buttons);
      expect(within(pick).getAllByRole("button")[0]).toHaveTextContent("70021 · Badumbau Muster");
      expect(offer().auftragId ?? "").toBe(s.view.auftragId);
      await userEvent.click(within(pick).getByRole("button", { name: new RegExp(`^${s.picked}`) }));
      await waitFor(() => expect([offer().auftragId, offer().mail.auftragId, offer().postal.auftragId]).toEqual([s.after.auftragId, s.after.mailAuftragId, s.after.postAuftragId]));
      expect(screen.queryByTestId("kd-deal-pick")).toBeNull();
    } else {
      await waitFor(() => expect(offer().auftragId ?? "").toBe(s.view.auftragId));
      expect(screen.queryByTestId("kd-deal-pick")).toBeNull();
    }
    // asked once; a second load of the same contact within 60 s asks Bitrix no more for its deals
    if (list) {
      await userEvent.click(screen.getByRole("button", { name: "Kontakt aus Bitrix laden" }));
      await waitFor(() => expect(srv.count("GET /api/bitrix/contact/5001")).toBe(2));
      expect(srv.count("GET /api/bitrix/contact/5001/deals")).toBe(1);
    }
  });

  it("appointment without deal, contact with several deals", async () => {
    const s = scen("appointment without deal, contact with several deals");
    const srv = fakeServer({
      ...BASE,
      "GET /api/planning/v2/today": { body: (lean as any).today },
      "GET /api/planning/v2/today?date=*": { body: (lean as any).today },
      "GET /api/planning/v2/week?from=*": { body: (lean as any).week },
      "POST /api/bitrix/log-action": { body: { ok: true } },
      "GET /api/bitrix/contact/5002": { body: { result: CONTACT("5002", ERIKA) } },
      "GET /api/bitrix/contact/5002/deals": { body: { deals: deals(s.name) } },
    });
    const router = renderApp("/");
    const card = await waitFor(() => { const c = document.querySelector('[data-testid="appointment"][data-id="b2"]') as HTMLElement; expect(c).toBeTruthy(); return c; });
    await userEvent.click(within(card).getByRole("button", { name: "In Konfigurator öffnen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Badumbau" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/t-[0-9a-f]{24}\/bu/));
    const pick = await screen.findByTestId("kd-deal-pick");
    expect(within(pick).getAllByRole("button").map((b) => b.getAttribute("data-deal"))).toEqual(s.view.buttons);
    expect(offer().auftragId).toBe(s.view.auftragId); // as today: the contact number until a deal is picked
    await userEvent.click(within(pick).getByRole("button", { name: new RegExp(`^${s.picked}`) }));
    await waitFor(() => expect([offer().auftragId, offer().mail.auftragId, offer().postal.auftragId]).toEqual([s.after.auftragId, s.after.mailAuftragId, s.after.postAuftragId]));
    expect(srv.count("GET /api/bitrix/contact/5002/deals")).toBe(1);
  });
});
