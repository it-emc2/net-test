// Kundendaten: the customer's data from the Bitrix deal, from „Kontakt aus Bitrix laden“ and from
// „Kunde suchen“ must land in the offer as in today's UI. The reference (fixtures/kundendaten-bitrix.json,
// invented data) is recorded from today's UI by v2/scripts/capture-kundendaten-bitrix.cjs; here the
// same answers go to the React screen. Deliberate differences (UX-CHANGES U-038) are asserted as such.
import { customerOfContact, type DealCustomerResponse } from "@oc/api-contract";
import { emptyOffer, type NewOfferType } from "@oc/domain";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { dealFill, hitLines, isFreshForDeal, landlordChanges, restoreChanges, savedKundendaten } from "../src/features/steps/kundendaten/fill.js";
import recorded from "./fixtures/kundendaten-bitrix.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

const KEY = "t-0123456789abcdef01234567";
type Scenario = Record<string, any>;
const S = recorded.scenarios as unknown as Scenario[];
const offer = () => useOfferStore.getState().offer as Record<string, any>;
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
afterEach(() => vi.unstubAllGlobals());

// what differs from `base` (dotted paths) — as the recorder writes it
function changed(base: unknown, now: unknown) {
  const out: Record<string, unknown> = {};
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  const walk = (a: unknown, b: unknown, p: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    out[p] = b === undefined ? "<removed>" : b;
  };
  walk(base, now, "");
  for (const k of Object.keys(out)) if (/^mail\.(subject|body)$|^offerNumber$|^Kundendaten\.(date|ansprechpartner|emc2_contact)$/.test(k)) delete out[k];
  return out;
}
const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/** today's GET /api/bitrix/deal/:id answer → the answer of the React app's route */
function dealAnswer(rec: [number, any]): Reply {
  const [status, body] = rec;
  if (status !== 200) return { status: status === 404 ? 404 : 502, body: { error: { code: status === 404 ? "DEAL_NOT_FOUND" : "BITRIX_UNAVAILABLE", message: "x", requestId: "req-1" } } };
  const r: DealCustomerResponse = { dealId: String(body.deal.id), dealTitle: body.deal.title, customer: body.contact ? customerOfContact(body.contact) : null, vermieter: body.vermieter, source: "batch", loadedAt: "2026-11-18T10:00:00.000Z" };
  return { body: r };
}
/** what was typed and answered in each recorded scenario */
const SCEN = Object.fromEntries(S.map((s) => [s.name, s.answers])) as Record<string, any>;

// ---- the setup of a filled form, made like a user ----
const TEXT: Record<string, string> = { firstName: "Vorname", lastName: "Nachname", phone: "Telefonnummer", email: "E-Mail", street: "Adresse", notes: "Notizen" };
const GROUP: Record<string, string> = {
  salutation: "Anrede", hasPflegegrad: "Kunde hat Pflegegrad?", pflegegrad: "Welchen Pflegegrad?",
  wohnumfeldDone: "Wurden Wohnumfeldverbessernde Maßnahmen schon mal durchgeführt?", kk_rechnungskopie: "Kassen-Rechnungskopie gewünscht?",
  kk_rechnungskopie_art: "Rechnungskopie per Post oder per E-Mail?",
};
const OPTION: Record<string, string> = { ja: "Ja", nein: "Nein", email: "Per E-Mail", post: "Per Post" };
async function setup(steps: [string, string, string][]) {
  for (const [kind, field, value] of steps) {
    if (kind === "text") { const el = screen.getByLabelText(TEXT[field]!); fireEvent.change(el, { target: { value } }); fireEvent.blur(el); }
    else if (kind === "radio") await userEvent.click(within(screen.getByRole("group", { name: GROUP[field]! })).getByRole("radio", { name: OPTION[value] ?? value }));
    else if (kind === "check") await userEvent.click(screen.getByRole("checkbox", { name: "4.180 € MAXIMAL" }));
  }
}
const shownText = (t: string) => screen.queryAllByText(t).length > 0;

describe("a NEW offer of a Bitrix deal is filled as today's „Bitrix Deal laden“ fills it", () => {
  const filled = S.filter((s) => s.group === "deal" && s.opened);
  it.each(filled.map((s) => [`${s.type}: ${s.name}`, s] as const))("%s", async (_n, s) => {
    const srv = fakeServer({ ...BASE, "GET /api/deals/4711/customer": dealAnswer(SCEN[s.name].deal) });
    renderApp(`/deal/4711/${s.type}/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    const plain = emptyOffer(s.type as NewOfferType, { date: "" }) as Record<string, any>;
    await waitFor(() => expect(offer().auftragId).toBe("4711"));
    const now = copy(offer());
    delete now.pricingRules; delete plain.pricingRules; // the business settings snapshot is not part of this
    expect(sorted(changed(plain, now))).toEqual(sorted(s.opened.stored));
    // today: the deal is asked twice (dialog, then the landlord fields) — 2 to 4 Bitrix calls each; here once, one Bitrix request
    expect(srv.count("GET /api/deals/4711/customer")).toBe(1);
    expect(srv.calls.filter((c) => c.key.includes("/api/bitrix/"))).toEqual([]);
  });

  it("deal without contact (today: the offer cannot be opened that way): it opens, the deal number and landlord answers are stored, a note says it", async () => {
    fakeServer({ ...BASE, "GET /api/deals/4711/customer": dealAnswer(SCEN["deal: no contact"].deal) });
    renderApp("/deal/4711/bu/Kundendaten");
    await screen.findByText(/Zu diesem Deal ist kein Kontakt hinterlegt/);
    await waitFor(() => expect(offer().auftragId).toBe("4711"));
    expect(offer().Kundendaten).toMatchObject({ wohnsituation: "Miete", vermieterGenehmigungErforderlich: "Ja", firstName: "" });
  });

  it.each([["deal: Bitrix fails", "Bitrix ist gerade nicht erreichbar"], ["deal: not found", "Diesen Auftrag gibt es in Bitrix nicht"]])("%s: said in German with „Erneut versuchen“, the step goes on; the retry asks Bitrix again", async (name, text) => {
    const srv = fakeServer({ ...BASE, "GET /api/deals/4711/customer": dealAnswer(SCEN[name].deal), "GET /api/deals/4711/customer?fresh=1": dealAnswer(SCEN["deal: contact with address, landlord approval needed"].deal) });
    renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByText(new RegExp(text))).toBeTruthy();
    expect(screen.getByText(/von Hand eingeben/)).toBeTruthy();
    expect(srv.count("GET /api/deals/4711/customer")).toBe(1); // no retry of a Bitrix failure from the page
    await userEvent.type(screen.getByLabelText("Vorname"), "Erika"); // typing works
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(srv.count("GET /api/deals/4711/customer?fresh=1")).toBe(1));
    await waitFor(() => expect(screen.queryByTestId("kd-bitrix-error")).toBeNull());
    expect(offer().Kundendaten.firstName).toBe("Erika"); // typed meanwhile: nothing is overwritten
  });

  it("an offer that already has a customer (a draft, an appointment) is not touched", async () => {
    const draft = { ...emptyOffer("bu", { date: "" }), auftragId: "4711" } as Record<string, any>;
    draft.Kundendaten = { ...draft.Kundendaten, firstName: "Schon", lastName: "Da", bitrixContactId: "1" };
    const srv = fakeServer({ ...BASE, "GET /api/deals/*/draft": { body: { dealId: "4711", revision: 3, offerType: "bu", payload: draft, updatedAt: "2026-11-18T10:00:00.000Z", updatedBy: "ap@example.test" } }, "GET /api/deals/4711/customer": dealAnswer(SCEN["deal: contact with address, landlord approval needed"].deal) });
    renderApp("/deal/4711/bu/Kundendaten");
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await waitFor(() => expect(srv.count("GET /api/deals/4711/customer")).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(offer().Kundendaten).toMatchObject({ firstName: "Schon", lastName: "Da", email: "" });
  });

  it("a temporary offer (no deal number) asks Bitrix nothing", async () => {
    const srv = fakeServer(BASE);
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await new Promise((r) => setTimeout(r, 50));
    expect(srv.calls.filter((c) => /customer|bitrix/.test(c.key))).toEqual([]);
  });
});

describe("„Kontakt aus Bitrix laden“ fills as today", () => {
  const list = S.filter((s) => s.group === "contact");
  it.each(list.map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const sc = SCEN[s.name];
    const handlers: Record<string, Reply> = { ...BASE };
    if (sc.contact) handlers["GET /api/bitrix/contact/*"] = { status: sc.contact[0], body: sc.contact[1] };
    if (sc.deals) handlers["GET /api/bitrix/contact/*/deals"] = { status: sc.deals[0], body: sc.deals[1] };
    handlers["GET /api/deals/4711/customer"] = dealAnswer([200, { deal: { id: 4711, title: "" }, contact: null, vermieter: { erforderlich: null, liegtVor: null } }]);
    const srv = fakeServer(handlers);
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await setup(s.setup as [string, string, string][]);
    const base = copy(offer());
    fireEvent.change(screen.getByLabelText("Bitrix Kontakt ID"), { target: { value: sc.id } });
    await userEvent.click(screen.getByRole("button", { name: "Kontakt aus Bitrix laden" }));
    const toast = s.view.toasts[0]!.replace(/^[^:]+: /, "");
    if (/übernommen/.test(toast)) await waitFor(() => expect(shownText(toast)).toBe(true));
    else await waitFor(() => expect(within(screen.getByTestId("kd-contact-error")).getByText(toast)).toBeTruthy()); // U-038: said in the step, not as a toast
    await waitFor(() => expect(sorted(changed(base, offer()))).toEqual(sorted(s.stored)));
    // today the contact is asked twice (two handlers on the button); here once
    const asked = srv.calls.filter((c) => /\/api\/(bitrix|deals)\//.test(c.key) && !c.key.endsWith("/draft")).map((c) => c.key);
    const today = (s.requests as string[]).filter((r, i, a) => a.indexOf(r) === i).map((r) => r.replace("GET /api/bitrix/deal/4711", "GET /api/deals/4711/customer"));
    expect(asked).toEqual(today);
  });

  it("the deal's own contact is reloaded through the deal: one request, Bitrix asked again", async () => {
    const sc = SCEN["deal: contact with address, landlord approval needed"];
    const srv = fakeServer({ ...BASE, "GET /api/deals/4711/customer": dealAnswer(sc.deal), "GET /api/deals/4711/customer?fresh=1": dealAnswer(sc.deal) });
    renderApp("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(offer().Kundendaten.bitrixContactId).toBe("7001"));
    fireEvent.change(screen.getByLabelText("Vorname"), { target: { value: "Geändert" } });
    await userEvent.click(screen.getByRole("button", { name: "Kontakt aus Bitrix laden" }));
    await waitFor(() => expect(offer().Kundendaten.firstName).toBe("Erika")); // as today: the button overwrites
    expect(srv.count("GET /api/deals/4711/customer?fresh=1")).toBe(1);
    expect(srv.calls.filter((c) => c.key.includes("/api/bitrix/"))).toEqual([]); // no contact route, no deal lookup of the contact
  });
});

describe("„Kunde suchen“ (local list, no Bitrix) as today", () => {
  const list = S.filter((s) => s.group === "search");
  it.each(list.map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const sc = SCEN[s.name];
    const handlers: Record<string, Reply> = { ...BASE, "GET /api/customers/search?q=*": { status: sc.search[0], body: sc.search[1] } };
    if (sc.customer) handlers["GET /api/customers/*"] = { status: sc.customer[0], body: sc.customer[1] };
    const srv = fakeServer(handlers);
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    await setup(s.setup as [string, string, string][]);
    const base = copy(offer());
    const box = screen.getByLabelText("Kunde suchen");
    await userEvent.type(box, sc.q); // a user typing, key by key
    if (sc.clear) { await new Promise((r) => setTimeout(r, 400)); await userEvent.clear(box); }
    await new Promise((r) => setTimeout(r, 400));
    const searches = srv.calls.filter((c) => c.key.includes("/api/customers/search")).map((c) => c.key);
    expect(searches).toEqual(s.listRequests); // one request after the last key, none after clearing
    const results = screen.queryByTestId("kd-search-results");
    const lines = results ? [...results.querySelectorAll("li")].map((li) => ({ main: li.querySelector('[data-part="main"]')?.textContent ?? "", meta: li.querySelector('[data-part="meta"]')?.textContent ?? "" })) : null;
    if (s.name === "search: the search fails") {
      expect(lines).toBeNull();
      expect(screen.getByTestId("kd-search-error").getAttribute("data-code")).toBe("CUSTOMER_SEARCH_FAILED"); // U-038: today it says nothing
      return;
    }
    expect(lines).toEqual(s.list.results);
    if (sc.pick === undefined) return;
    await userEvent.click(within(results!).getAllByRole("button")[sc.pick]!);
    const toast = s.view.toasts[0]!.replace(/^[^:]+: /, "");
    await waitFor(() => expect(shownText(toast)).toBe(true));
    await waitFor(() => expect(sorted(changed(base, offer()))).toEqual(sorted(s.stored)));
    expect((box as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("kd-search-results")).toBeNull();
    expect(srv.calls.filter((c) => c.key.includes("/api/bitrix/"))).toEqual([]);
  });

  it("an older answer never wins: the previous search is aborted when a new one starts", async () => {
    let first: () => void = () => {};
    const seen: { url: string; signal: AbortSignal | undefined }[] = [];
    fakeServer({ ...BASE, "GET /api/customers/search?q=*": { body: { ok: true, items: [] } } });
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes("/search")) seen.push({ url, signal: init?.signal ?? undefined });
      if (url.endsWith("q=Mu")) { await new Promise<void>((go) => { first = go; }); if (init?.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" }); }
      return inner(url, init);
    });
    renderApp(`/deal/${KEY}/bu/Kundendaten`);
    await screen.findByRole("heading", { name: "Kontaktdaten des Kunden" });
    const box = screen.getByLabelText("Kunde suchen");
    await userEvent.type(box, "Mu");
    await new Promise((r) => setTimeout(r, 300));
    await userEvent.type(box, "ster");
    await new Promise((r) => setTimeout(r, 300));
    expect(seen.map((x) => x.url)).toEqual(["/api/customers/search?q=Mu", "/api/customers/search?q=Muster"]);
    expect(seen[0]!.signal!.aborted).toBe(true);
    act(() => first());
    await screen.findByText("Kein Kunde gefunden");
  });
});

describe("the fill rules", () => {
  const bu = () => emptyOffer("bu", { date: "" }) as Record<string, any>;
  it("a value of k — also an empty one — replaces what was typed; what k does not mention stays", () => {
    const o = bu(); o.Kundendaten = { ...o.Kundendaten, firstName: "Alt", phone: "1", deployment: "Garten" };
    const c = restoreChanges(o, { firstName: "Neu", phone: "" }, "bu").Kundendaten!;
    expect(c).toMatchObject({ firstName: "Neu", phone: "" });
    expect(c).not.toHaveProperty("deployment");
  });
  it("company and country are not on the page: not stored", () => {
    expect(restoreChanges(bu(), { company: "X", country: "DE" }, "bu").Kundendaten).toEqual({});
  });
  it("the landlord answers: only Badumbau, Badewannentür, Handlauf; not when the offer has another contact", () => {
    const v = { erforderlich: true, liegtVor: true };
    expect(landlordChanges("bu", v, {}, "1")).toEqual({ wohnsituation: "Miete", vermieterGenehmigungErforderlich: "Ja", vermieterGenehmigung: "Ja" });
    expect(landlordChanges("bl", v, {}, "1")).toEqual({});
    expect(landlordChanges("bu", v, { bitrixContactId: "2" }, "1")).toEqual({});
    expect(landlordChanges("hl", { erforderlich: false, liegtVor: null }, {}, null)).toEqual({ wohnsituation: "Eigentum", vermieterGenehmigung: undefined, vermieterGenehmigungErforderlich: "Nein" });
  });
  it("a new offer of a deal: no name, no contact number, no deal number yet", () => {
    expect(isFreshForDeal(bu())).toBe(true);
    expect(isFreshForDeal({ ...bu(), auftragId: "1" })).toBe(false);
    const o = bu(); o.Kundendaten.lastName = "X";
    expect(isFreshForDeal(o)).toBe(false);
  });
  it("a deal without contact fills only the deal number and the landlord answers", () => {
    const r = dealFill(bu(), { dealId: "9", dealTitle: "", customer: null, vermieter: { erforderlich: false, liegtVor: null }, source: "batch", loadedAt: "" }, "bu");
    expect(r.sections.Kundendaten).toEqual({ wohnsituation: "Eigentum", vermieterGenehmigungErforderlich: "Nein" });
    expect(r.top.auftragId).toBe("9");
  });
  it("search hits as today's list shows them; a customer's saved page is what is restored", () => {
    expect(hitLines({ company: "", firstName: "Max", lastName: "M", customerNumber: "7", city: "Hof" })).toEqual({ main: "Max • M", meta: "7 • Hof" });
    expect(hitLines({ email: "a@b.test" }).main).toBe("a@b.test");
    expect(savedKundendaten({ kundendaten: { firstName: "A" }, firstName: "B" })).toEqual({ firstName: "A" });
    expect(savedKundendaten({ firstName: "B" })).toEqual({ firstName: "B" });
  });
});
