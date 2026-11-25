// U-073: a deal with an offer in the React app, opened from an appointment (offer picker) or by its
// number, shows its variants, its stored documents of the old app and „Neue Variante beginnen“.
// A deal without a draft is unchanged; the variant list failing or slow → as before (U-063);
// a draft of ANOTHER type → the choice of ADR 027 B. Made-up deals and customers only.
process.env.TZ = "Europe/Berlin";
import { homeSearchRow, type DealVariant, type HomeSearchRow } from "@oc/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEAL_DOCS_WAIT_MS } from "../src/features/home/search-rules.js";
import { oldDocuments, overviewIntro, variantPath, variantRowView } from "../src/features/home/overview-rules.js";
import lean from "./fixtures/home-planung-v2.json" with { type: "json" };
import { BASE, NO_DRAFT, fakeServer, renderApp, type Reply } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const DEAL = "70001"; // the deal of appointment a1 in home-planung-v2.json
const DRAFT_ID = "65a000000000000000000001";
const draftRow = (): HomeSearchRow => homeSearchRow({ _type: "draft", _id: DRAFT_ID, name: "Entwurf Bad oben", firstName: "Test", lastName: "Kunde", offerType: "bu", updatedAt: "2026-11-02T09:00:00Z", payload: { auftragId: DEAL } }, "deal");
const offerRow = (nr: string): HomeSearchRow => homeSearchRow({ _type: "offer", offerNumber: nr, firstName: "Test", lastName: "Kunde", offerType: "bu", updatedAt: "2026-11-03T09:00:00Z", payload: { auftragId: DEAL } }, "deal");
const draftOf = (offerType: string): Reply => ({ body: { dealId: DEAL, offerType, payload: { activeOffer: offerType, Kundendaten: { firstName: "Test", lastName: "Kunde" } }, revision: 3, updatedAt: "2026-11-23T09:15:00.000Z", variantId: "v1", variantName: "" } });
const variant = (over: Partial<DealVariant> = {}): DealVariant => ({
  variantId: "v1", name: "Variante 1", offerType: "bu", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null,
  revision: 3, updatedAt: "2026-11-23T09:15:00.000Z", notChosenAt: null, isDefault: true, numbers: [], ...over,
});
const SENT = variant({ variantId: "v1", name: "Mit Wanne", offerNumber: "ANG2026-1120-100000", status: "sent", sentAt: "2026-11-20T10:00:00.000Z", numbers: ["ANG2026-1120-100000", "ANG2026-1118-090000"], isDefault: false });
const SIGNED = variant({ variantId: "v-0000000000a1", name: "Ohne Wanne", offerNumber: "ANG2026-1121-110000", status: "signed", numbers: ["ANG2026-1121-110000"], isDefault: true, updatedAt: "2026-11-21T11:00:00.000Z" });
const NOT_CHOSEN = variant({ variantId: "v-0000000000b2", name: "Variante 3", status: "not-chosen", isDefault: false, updatedAt: "2026-11-22T08:00:00.000Z" });
const listOf = (...variants: DealVariant[]): Reply => ({ body: { dealId: DEAL, defaultVariantId: variants.find((v) => v.isDefault)?.variantId ?? null, variants } });
const FAIL: Reply = { status: 500, body: { error: { code: "X", message: "x", requestId: "t" } } };
const BY_DEAL = `GET /api/offers/v2/by-deal/${DEAL}`;
const VARIANTS = `GET /api/deals/${DEAL}/variants`;
const DRAFT = `GET /api/deals/${DEAL}/draft`;
const PLAN = {
  "GET /api/planning/v2/today": { body: lean.today }, "GET /api/planning/v2/today?date=*": { body: lean.today }, "GET /api/planning/v2/week?from=*": { body: lean.week },
  "POST /api/bitrix/log-action": { body: { ok: true } }, "GET /api/offers/by-deal/*": { body: [] },
  "GET /api/deals/*/related": { body: { dealId: DEAL, related: [] } }, "GET /api/deals/*/customer": FAIL, "GET /api/bitrix/contact/*": FAIL,
};
const HOME = { "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/offers/v2/search*": { body: { rows: [] } } };

const card = (id: string) => document.querySelector(`[data-testid="appointment"][data-id="${id}"]`) as HTMLElement;
async function pick(title: string) {
  await waitFor(() => expect(card("a1")).toBeTruthy());
  await userEvent.click(within(card("a1")).getByRole("button", { name: "In Konfigurator öffnen" }));
  await userEvent.click(await screen.findByRole("button", { name: title }));
}
const openByNumber = async () => { await userEvent.type(await screen.findByLabelText("Öffnen"), `${DEAL}{Enter}`); };
const rowsOf = (el: HTMLElement) => within(el).getAllByTestId("overview-variant").map((r) => [
  r.querySelector('[data-part="name"]')!.textContent, [...r.querySelectorAll('[data-part="badges"] > span')].map((b) => b.textContent).join(" | "),
  r.querySelector('[data-part="meta"]')?.textContent ?? "", !!r.querySelector('[data-part="last"]'),
]);
/** the variant list never answers (slow server) */
function slowVariants() {
  const impl = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (url.endsWith("/variants") && (init?.method ?? "GET") === "GET" ? new Promise<Response>(() => {}) : impl(url, init))));
}

describe("rules", () => {
  it("old documents: an offer whose number any variant carries or carried is that variant; drafts always count", () => {
    const rows = [draftRow(), offerRow("ANG2026-1118-090000"), offerRow("ANG2026-1121-110000"), offerRow("ANG2025-0101-080000")];
    expect(oldDocuments(rows, [SENT, SIGNED]).map((r) => r.kind + r.offerNumber)).toEqual(["draft", "offerANG2025-0101-080000"]);
    expect(oldDocuments(null, [SENT])).toEqual([]);
    expect(oldDocuments([offerRow("ANG1")], [{ offerNumber: "ANG1" }])).toEqual([]); // an older server: the current number still counts
  });
  it("texts of the intro and a row", () => {
    expect(overviewIntro(DEAL, [SENT], 0)).toBe("Zu Auftrag 70001 gibt es ein Angebot Badumbau. Tippen Sie auf eine Variante, um sie zu öffnen, oder beginnen Sie eine neue Variante.");
    expect(overviewIntro(DEAL, [SENT, SIGNED], 2)).toBe("Zu Auftrag 70001 gibt es ein Angebot Badumbau in 2 Varianten und gespeicherte Entwürfe oder Angebote aus der bisherigen Ansicht. Tippen Sie auf eine Variante, um sie zu öffnen, oder beginnen Sie eine neue Variante.");
    expect(variantRowView(SENT)).toEqual({ name: "Mit Wanne", badges: ["Badumbau", "Gesendet am 20.11.2026"], meta: "ANG2026-1120-100000 · zuletzt geändert 23.11.2026, 10:15" });
    expect(variantPath(DEAL, SIGNED)).toBe("/deal/70001/bu?variante=v-0000000000a1");
  });
});

describe("offer picker from an appointment", () => {
  it("one draft variant, no stored documents: the overview with that variant and „Neue Variante beginnen“; a tap opens it", async () => {
    fakeServer({ ...BASE, ...PLAN, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(variant()), [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    const ov = await screen.findByTestId("deal-overview");
    expect(screen.getByRole("dialog", { name: "Varianten und Angebote" })).toBeInTheDocument();
    expect(rowsOf(ov)).toEqual([["Variante 1", "Badumbau | Entwurf", "zuletzt geändert 23.11.2026, 10:15", true]]);
    expect(within(ov).queryByTestId("deal-documents")).toBeNull();
    expect(within(ov).getByRole("button", { name: "Neue Variante beginnen" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(within(ov).getByTestId("overview-variant"));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(router.state.location.search).toBe("?variante=v1");
  });

  it("several variants with their statuses; „Zurück“ goes back to the types", async () => {
    fakeServer({ ...BASE, ...PLAN, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(SENT, SIGNED, NOT_CHOSEN), [BY_DEAL]: { body: { rows: [] } } });
    renderApp("/");
    await pick("Badumbau");
    const ov = await screen.findByTestId("deal-overview");
    expect(rowsOf(ov)).toEqual([
      ["Mit Wanne", "Badumbau | Gesendet am 20.11.2026", "ANG2026-1120-100000 · zuletzt geändert 23.11.2026, 10:15", false],
      ["Ohne Wanne", "Badumbau | Unterschrieben", "ANG2026-1121-110000 · zuletzt geändert 21.11.2026, 12:00", true],
      ["Variante 3", "Badumbau | Nicht gewählt", "zuletzt geändert 22.11.2026, 09:00", false],
    ]);
    await userEvent.click(within(ov).getByRole("button", { name: "Zurück" }));
    expect(await screen.findByRole("dialog", { name: "Welche Angebotsart möchten Sie öffnen?" })).toBeInTheDocument();
  });

  it("a draft of ANOTHER type: no overview — the choice of ADR 027 B as before", async () => {
    fakeServer({ ...BASE, ...PLAN, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(variant()), [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await pick("Alltagshilfe");
    const c = await screen.findByTestId("picker-choice");
    expect(within(c).getByRole("button", { name: "Bestehendes Angebot (Badumbau) öffnen" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Weiteres Angebot (Alltagshilfe) für diesen Kunden anlegen" })).toBeInTheDocument();
    expect(screen.queryByTestId("deal-overview")).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });

  it("no draft and no stored documents: the offer starts at once, as before", async () => {
    fakeServer({ ...BASE, ...PLAN, [VARIANTS]: listOf(), [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("deal-overview")).toBeNull();
  });

  it("variant list fails: as before (no stored documents → straight into the draft)", async () => {
    fakeServer({ ...BASE, ...PLAN, [DRAFT]: draftOf("bu"), [VARIANTS]: FAIL, [BY_DEAL]: { body: { rows: [] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("deal-overview")).toBeNull();
  });
});

describe("„Öffnen“ with a deal number", () => {
  it("variants AND stored documents: the old app's documents only once, the variants' own numbers not doubled", async () => {
    const signedDraft = draftOf("bu");
    fakeServer({ ...BASE, ...HOME, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(SENT, SIGNED),
      [`${DRAFT}?variant=${SIGNED.variantId}`]: { body: { ...(signedDraft.body as object), variantId: SIGNED.variantId, variantName: SIGNED.name } },
      [BY_DEAL]: { body: { rows: [draftRow(), offerRow("ANG2026-1118-090000"), offerRow("ANG2026-1121-110000"), offerRow("ANG2025-0101-080000")] } } });
    const router = renderApp("/");
    await openByNumber();
    const ov = await screen.findByTestId("deal-overview");
    expect(router.state.location.pathname).toBe("/");
    expect(ov).toHaveTextContent("Zu Auftrag 70001 gibt es ein Angebot Badumbau in 2 Varianten und gespeicherte Entwürfe oder Angebote aus der bisherigen Ansicht.");
    expect(rowsOf(ov).map((r) => r[0])).toEqual(["Mit Wanne", "Ohne Wanne"]);
    const docs = within(ov).getByTestId("deal-documents");
    expect(within(docs).getByRole("heading")).toHaveTextContent("Gespeicherte Entwürfe / Angebote aus der bisherigen Ansicht");
    expect(within(docs).getAllByTestId("search-row").map((r) => r.querySelector('[data-part="meta"]')!.textContent)).toEqual(["2.11.2026, 10:00:00", "ANG2025-0101-080000 · 3.11.2026, 10:00:00"]);
    expect(within(ov).queryByRole("button", { name: "Zurück" })).toBeNull();
    await userEvent.click(within(ov).getAllByTestId("overview-variant")[1]!);
    await waitFor(() => expect(router.state.location.search).toBe("?variante=v-0000000000a1"));
  });

  it("„Neue Variante beginnen“: the existing creation (name suggested, copy of the chosen variant), then the new variant opens", async () => {
    const created = variant({ variantId: "v-0000000000c3", name: "Variante 3 günstig", isDefault: true });
    const srv = fakeServer({ ...BASE, ...HOME, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(SENT, SIGNED), [BY_DEAL]: { body: { rows: [] } },
      [`POST /api/deals/${DEAL}/variants`]: { body: { dealId: DEAL, variant: created, revision: 9 } },
      [`${DRAFT}?variant=${created.variantId}`]: { body: { ...(draftOf("bu").body as object), variantId: created.variantId, variantName: created.name } } });
    const router = renderApp("/");
    await openByNumber();
    const ov = await screen.findByTestId("deal-overview");
    await userEvent.click(within(ov).getByRole("button", { name: "Neue Variante beginnen" }));
    const form = within(ov).getByTestId("overview-new");
    expect(form.querySelector('[data-part="lead"]')).toHaveTextContent("Die neue Variante ist eine Kopie von „Ohne Wanne“ – ohne Angebotsnummer und Versandstatus.");
    const name = within(form).getByLabelText("Name der Variante");
    expect(name).toHaveValue("Variante 3");
    await userEvent.click(within(form).getByRole("radio", { name: "Mit Wanne" }));
    expect(form.querySelector('[data-part="lead"]')).toHaveTextContent("Kopie von „Mit Wanne“");
    await userEvent.clear(name);
    await userEvent.type(name, "Variante 3 günstig");
    await userEvent.click(within(form).getByRole("button", { name: "Variante erstellen" }));
    await waitFor(() => expect(router.state.location.search).toBe("?variante=v-0000000000c3"));
    expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/);
    expect(srv.calls.filter((c) => c.key === `POST /api/deals/${DEAL}/variants`).map((c) => c.body)).toEqual([{ from: "v1", name: "Variante 3 günstig" }]);
  });

  it("„Neue Variante beginnen“ refused by the server: its message, nothing opens; „Abbrechen“ goes back", async () => {
    fakeServer({ ...BASE, ...HOME, [DRAFT]: draftOf("bu"), [VARIANTS]: listOf(variant()), [BY_DEAL]: { body: { rows: [] } },
      [`POST /api/deals/${DEAL}/variants`]: { status: 503, body: { error: { code: "VARIANT_CREATE_FAILED", message: "Varianten sind auf diesem Server noch nicht eingerichtet. Bitte wenden Sie sich an den Administrator.", requestId: "t" } } } });
    const router = renderApp("/");
    await openByNumber();
    const ov = await screen.findByTestId("deal-overview");
    await userEvent.click(within(ov).getByRole("button", { name: "Neue Variante beginnen" }));
    expect(within(ov).queryByRole("radio")).toBeNull(); // one variant: nothing to choose
    expect(within(ov).getByLabelText("Name der Variante")).toHaveValue("Variante 2");
    await userEvent.click(within(ov).getByRole("button", { name: "Variante erstellen" }));
    expect(await within(ov).findByText(/Varianten sind auf diesem Server noch nicht eingerichtet/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(within(ov).getByRole("button", { name: "Abbrechen" }));
    expect(within(ov).getByRole("button", { name: "Neue Variante beginnen" })).toBeInTheDocument();
  });

  it("no draft: the message, the tiles and the list, as before", async () => {
    fakeServer({ ...BASE, ...HOME, [DRAFT]: NO_DRAFT, [VARIANTS]: listOf(), [BY_DEAL]: { body: { rows: [draftRow()] } } });
    renderApp("/");
    await openByNumber();
    await screen.findByText(/Für Auftrag 70001 gibt es noch kein Angebot/);
    expect(await screen.findByTestId("deal-documents")).toHaveTextContent("Test Kunde");
    expect(screen.queryByTestId("deal-overview")).toBeNull();
  });

  it("variant list never answers: after the wait as before (U-063 list with the autosaved state)", async () => {
    fakeServer({ ...BASE, ...HOME, [DRAFT]: draftOf("bwt"), [BY_DEAL]: { body: { rows: [draftRow()] } } });
    slowVariants();
    const router = renderApp("/");
    await openByNumber();
    const ds = await screen.findByTestId("deal-start", {}, { timeout: DEAL_DOCS_WAIT_MS + 2000 });
    expect(screen.queryByTestId("deal-overview")).toBeNull();
    await userEvent.click(within(ds).getByRole("button", { name: "Automatisch gespeicherten Stand öffnen (23.11.2026, 10:15, Version 3)" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/));
  });

  it("variant list and documents never answer: straight into the draft after the wait, as before", async () => {
    fakeServer({ ...BASE, ...HOME, [DRAFT]: draftOf("bwt") });
    const impl = vi.mocked(fetch).getMockImplementation()!;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (url.endsWith("/variants") || url.startsWith("/api/offers/v2/by-deal/") ? new Promise<Response>(() => {}) : impl(url, init))));
    const router = renderApp("/");
    await openByNumber();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bwt/), { timeout: DEAL_DOCS_WAIT_MS + 2000 });
  });
});
