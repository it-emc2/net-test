// ADR 030: „Angebotsart wechseln“ — another offer type on the SAME deal as a new variant (the server
// copies the customer data by the rule of „Weiteres Angebot“). A NEW feature — no recording of today's
// UI; the server is stubbed with the shapes of @oc/api-contract (switchOfferType, dealVariants) and the
// messages of apps/server/src/modules/deal-drafts/type-switch.ts. Made-up deals and customers only.
process.env.TZ = "Europe/Berlin";
import { CREATION_ID_RE, type DealVariant } from "@oc/api-contract";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { overviewIntro } from "../src/features/home/overview-rules.js";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT } from "../src/features/offer/model/second-offer.js";
import { SWITCH_TEXT, signedOnDeal, switchOutcomeOf, switchedPath } from "../src/features/offer/model/type-switch.js";
import { typesOf, variantHref, variantOfType } from "../src/features/offer/model/variants.js";
import { ApiFailure } from "../src/shared/api/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

type Obj = Record<string, any>;
const DEAL = "4711", NEWV = "v-0000000000c3";
const at = "2026-11-26T09:00:00.000Z";
const KD = { firstName: "Kunde", lastName: "A", city: "Ort", payer: "Kassenkunde", pflegegrad: "3" };
const draftOf = (type: string, variantId = "v1", name = "Variante 1", kd: Obj = KD): Reply => ({ body: { dealId: DEAL, offerType: type, payload: { activeOffer: type, Kundendaten: kd, auftragId: DEAL }, revision: 3, updatedAt: at, variantId, variantName: name } });
const variant = (over: Partial<DealVariant> = {}): DealVariant => ({
  variantId: "v1", name: "Variante 1", offerType: "bu", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null,
  revision: 3, updatedAt: at, notChosenAt: null, isDefault: true, numbers: [], ...over,
});
const listOf = (...variants: DealVariant[]): Reply => ({ body: { dealId: DEAL, defaultVariantId: variants.find((v) => v.isDefault)?.variantId ?? null, variants } });
const ok = (b: Obj, more: Obj = {}): Reply => ({ body: { ok: true, creationId: b.creationId, dealId: DEAL, sourceVariantId: "v1", variantId: NEWV, variantName: "Badewannentür", offerType: b.offerType, revision: 9, repeated: false, ...more } });
const refusal = (status: number, code: string, message: string): Reply => ({ status, body: { error: { code, message, requestId: "t" } } });
const SIGNED_MSG = "Zu diesem Auftrag ist bereits ein Angebot unterschrieben. Die Angebotsart kann auf diesem Auftrag nicht mehr gewechselt werden – bitte legen Sie das Angebot als neuen Deal an („Weiteres Angebot“).";
const POST = `POST /api/deals/${DEAL}/type-switch`;
const SECOND = `POST /api/deals/${DEAL}/second-offer`;
const dialog = () => screen.getByTestId("second-offer-dialog");
const way = (w: "same-deal" | "new-deal") => dialog().querySelector<HTMLButtonElement>(`[data-way="${w}"]`)!;
const posts = (s: { calls: { key: string; body: unknown }[] }) => s.calls.filter((c) => c.key === POST).map((c) => c.body as Obj);

/** the open Badumbau offer of deal 4711 (first variant); after the switch the Badewannentür variant */
function offer(more: Record<string, Reply | ((b: unknown) => Reply)> = {}, list: Reply = listOf(variant())) {
  return fakeServer({
    ...BASE, [`GET /api/deals/${DEAL}/draft?variant=v1`]: draftOf("bu"), [`GET /api/deals/${DEAL}/draft`]: draftOf("bu"),
    [`GET /api/deals/${DEAL}/variants`]: list, [`GET /api/deals/${DEAL}/related`]: { body: { dealId: DEAL, related: [] } },
    [`PUT /api/deals/${DEAL}/draft?variant=v1`]: { body: { dealId: DEAL, revision: 4, changed: true } },
    [`GET /api/deals/${DEAL}/draft?variant=${NEWV}`]: draftOf("bwt", NEWV, "Badewannentür"),
    ...more,
  });
}
async function toWays(title = "Badewannentür") {
  await userEvent.click(await screen.findByTestId("variant-switch"));
  await userEvent.click(within(await screen.findByTestId("related-section")).getByRole("button", { name: TEXT.button }));
  await screen.findByTestId("second-offer-dialog");
  await userEvent.click(within(dialog()).getByRole("button", { name: title }));
  expect(dialog()).toHaveAttribute("data-step", "how");
}

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });

describe("rules", () => {
  it("signed on the deal: any signed variant", () => {
    expect(signedOnDeal([variant(), variant({ status: "sent" })])).toBe(false);
    expect(signedOnDeal([variant(), variant({ status: "signed" })])).toBe(true);
    expect(signedOnDeal(null)).toBe(false);
  });
  it("outcomes: a refusal is final (its text), no answer can be repeated with the same id", () => {
    expect(switchOutcomeOf(new ApiFailure(SIGNED_MSG, 409, "TYPE_SWITCH_SIGNED", "t", {}))).toEqual({ kind: "final", message: SIGNED_MSG });
    expect(switchOutcomeOf(new ApiFailure("x", 0, "OFFLINE", "t", {}))).toEqual({ kind: "no-answer", message: SWITCH_TEXT.noAnswer });
    expect(switchOutcomeOf(new Error("x")).kind).toBe("no-answer");
    expect(switchOutcomeOf(new ApiFailure("Serverfehler.", 500, "X", "t", {})).kind).toBe("no-answer");
  });
  it("the new variant opens on its type's first step with the variant in the address", () => {
    expect(switchedPath({ dealId: DEAL, offerType: "bwt", variantId: NEWV })).toBe(`/deal/4711/bwt/Kundendaten?variante=${NEWV}`);
    expect(switchedPath({ dealId: DEAL, offerType: "ah", variantId: NEWV })).toMatch(/^\/deal\/4711\/ah\/[A-Za-z]+\?variante=/);
  });
  it("another variant opens on its own type: same step for the same type, the type's start otherwise", () => {
    expect(variantHref("/deal/4711/bu/Rabatt", { variantId: "v-0000000000a1", offerType: "bu" })).toBe("/deal/4711/bu/Rabatt?variante=v-0000000000a1");
    expect(variantHref("/deal/4711/bu/Rabatt", { variantId: NEWV, offerType: "bwt" })).toBe(`/deal/4711/bwt?variante=${NEWV}`);
    expect(variantHref("/deal/4711/bu/Rabatt", { variantId: "v1", offerType: "" })).toBe("/deal/4711/bu/Rabatt?variante=v1");
  });
  it("an address of a type: the last-opened variant of it, else the newest of it", () => {
    const a = variant({ variantId: "v1", offerType: "bu", isDefault: true });
    const b = variant({ variantId: "v-0000000000a1", offerType: "bwt", isDefault: false, updatedAt: "2026-11-20T09:00:00.000Z" });
    const c = variant({ variantId: "v-0000000000a2", offerType: "bwt", isDefault: false, updatedAt: "2026-11-25T09:00:00.000Z" });
    expect(variantOfType([a, b, c], "bwt")?.variantId).toBe("v-0000000000a2");
    expect(variantOfType([a, b, c], "bu")?.variantId).toBe("v1");
    expect(variantOfType([a], "ah")).toBeUndefined();
    expect(typesOf([a, b, c])).toEqual(["bu", "bwt"]);
  });
  it("the deal overview names every type of a mixed deal", () => {
    expect(overviewIntro(DEAL, [variant(), variant({ offerType: "bwt" })], 0)).toBe("Zu Auftrag 4711 gibt es Angebote Badumbau und Badewannentür in 2 Varianten. Tippen Sie auf eine Variante, um sie zu öffnen, oder beginnen Sie eine neue Variante.");
    expect(overviewIntro(DEAL, [variant(), variant({ offerType: "bwt" }), variant({ offerType: "ah" })], 0)).toMatch(/^Zu Auftrag 4711 gibt es Angebote Badumbau, Badewannentür und Alltagshilfe in 3 Varianten\./);
  });
});

describe("the dialog: type, then the way", () => {
  it("two ways, each with one plain sentence; nothing is sent by choosing the type", async () => {
    const s = offer();
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    expect(way("same-deal")).toHaveTextContent(SWITCH_TEXT.sameDeal);
    expect(way("same-deal")).toHaveTextContent(SWITCH_TEXT.sameDealHint(DEAL));
    expect(way("new-deal")).toHaveTextContent(SWITCH_TEXT.newDeal);
    expect(way("new-deal")).toHaveTextContent(SWITCH_TEXT.newDealHint);
    expect(way("same-deal")).toBeEnabled();
    expect(s.count(POST) + s.count(SECOND)).toBe(0);
    // „Als neuer Deal“ is today's path: the confirmation of „Weiteres Angebot“
    await userEvent.click(way("new-deal"));
    expect(dialog()).toHaveAttribute("data-step", "confirm");
    expect(screen.getByTestId("second-offer-summary")).toHaveTextContent("In Bitrix wird ein neuer Auftrag in „Neue Anfragen“ angelegt");
  });

  it("„Auf diesem Deal“: the open offer is saved first, ONE request, the new variant opens on Kundendaten with the customer data", async () => {
    usePrefs.getState().setAutosave(false);
    const s = offer({ [POST]: (b) => ok(b as Obj) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "x");
    await toWays();
    await userEvent.click(way("same-deal"));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bwt/Kundendaten`));
    expect(router.state.location.search).toBe(`?variante=${NEWV}`);
    // saved first, then the switch
    const keys = s.calls.map((c) => c.key);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeLessThan(keys.indexOf(POST));
    expect(posts(s)).toHaveLength(1);
    expect(posts(s)[0]).toEqual({ offerType: "bwt", creationId: expect.stringMatching(CREATION_ID_RE), variantId: "v1" });
    expect(s.count(SECOND)).toBe(0);
    expect(await screen.findByLabelText("Vorname")).toHaveValue("Kunde");
    expect(useOfferStore.getState()).toMatchObject({ dealId: DEAL, variantId: NEWV, variantName: "Badewannentür" });
    expect(toast.success).toHaveBeenCalledWith(SWITCH_TEXT.switched("Badewannentür"));
    expect(screen.queryByTestId("second-offer-dialog")).toBeNull();
  });

  it("a double tap sends once", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = offer();
    const real = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (u: string, i: RequestInit = {}) => {
      if (`${i.method} ${u}` === POST) { s.calls.push({ key: POST, body: JSON.parse(String(i.body)), signal: undefined }); await gate; return new Response(JSON.stringify(ok(JSON.parse(String(i.body))).body), { status: 200 }); }
      return real(u, i);
    }));
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    const b = way("same-deal");
    await userEvent.click(b); await userEvent.click(b);
    await waitFor(() => expect(dialog()).toHaveAttribute("data-busy", "switch"));
    act(() => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); }); // Esc: stays while running
    expect(screen.getByTestId("second-offer-dialog")).toBeInTheDocument();
    release();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bwt/Kundendaten`));
    expect(posts(s)).toHaveLength(1);
  });

  it("no answer: „Erneut versuchen“ repeats with the SAME id (the server answers the variant it made)", async () => {
    let n = 0;
    const s = offer({ [POST]: (b) => (++n === 1 ? { status: 502, body: { error: { code: "BAD_GATEWAY", message: "Server nicht erreichbar.", requestId: "t" } } } : ok(b as Obj, { repeated: true })) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    await userEvent.click(way("same-deal"));
    const r = await screen.findByTestId("type-switch-result");
    expect(r).toHaveAttribute("data-kind", "no-answer");
    expect(r).toHaveTextContent(SWITCH_TEXT.noAnswer);
    await userEvent.click(within(r).getByRole("button", { name: SWITCH_TEXT.retry }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bwt/Kundendaten`));
    const [a, b] = posts(s);
    expect(b!.creationId).toBe(a!.creationId);
  });

  it("no answer, closed and opened again: the same switch continues (kept on the device)", async () => {
    const s = offer({ [POST]: { status: 502, body: { error: { code: "BAD_GATEWAY", message: "Server nicht erreichbar.", requestId: "t" } } } });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    await userEvent.click(way("same-deal"));
    await screen.findByTestId("type-switch-result");
    await userEvent.click(within(dialog()).getAllByRole("button", { name: TEXT.close }).at(-1)!);
    await userEvent.click(await screen.findByTestId("variant-switch"));
    await userEvent.click(within(await screen.findByTestId("related-section")).getByRole("button", { name: TEXT.button }));
    expect(await screen.findByTestId("type-switch-result")).toHaveAttribute("data-kind", "no-answer");
    await userEvent.click(within(dialog()).getByRole("button", { name: SWITCH_TEXT.retry }));
    await waitFor(() => expect(posts(s)).toHaveLength(2));
    expect(posts(s)[1]!.creationId).toBe(posts(s)[0]!.creationId);
  });
});

describe("signed deal", () => {
  it("a signed offer on the deal: „Auf diesem Deal“ is closed with the reason; „Als neuer Deal“ stays", async () => {
    const s = offer({}, listOf(variant({ status: "signed" })));
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    await waitFor(() => expect(way("same-deal")).toBeDisabled());
    expect(screen.getByTestId("type-switch-signed")).toHaveTextContent(SWITCH_TEXT.signed);
    expect(way("new-deal")).toBeEnabled();
    expect(s.count(POST)).toBe(0);
  });

  it("the server refuses (signed in the old app, unknown to the list): its message, no retry, nothing opened", async () => {
    const s = offer({ [POST]: refusal(409, "TYPE_SWITCH_SIGNED", SIGNED_MSG) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toWays();
    await userEvent.click(way("same-deal"));
    const r = await screen.findByTestId("type-switch-result");
    expect(r).toHaveAttribute("data-kind", "final");
    expect(r).toHaveTextContent(SIGNED_MSG);
    expect(within(r).queryByRole("button", { name: SWITCH_TEXT.retry })).toBeNull();
    expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bu/Kundendaten`);
    expect(s.count(POST)).toBe(1);
  });
});

describe("a deal with variants of different types", () => {
  const MIXED = listOf(variant({ isDefault: false }), variant({ variantId: NEWV, name: "Badewannentür", offerType: "bwt", isDefault: true }));

  it("the variant panel names each type; picking the other type's variant opens it on its type", async () => {
    offer({}, MIXED);
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.click(await screen.findByTestId("variant-switch"));
    await waitFor(() => expect(screen.getAllByTestId("variant-row")).toHaveLength(2));
    expect(screen.getAllByTestId("variant-row").map((r) => r.querySelector('[data-part="type"]')?.textContent)).toEqual(["Badumbau", "Badewannentür"]);
    await userEvent.click(screen.getAllByTestId("variant-row")[1]!.querySelector("button")!);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/4711\/bwt/));
    expect(router.state.location.search).toBe(`?variante=${NEWV}`);
    expect(toast.info).not.toHaveBeenCalled(); // no "the deal has another offer" notice for an explicit variant
  });

  it("an address of a type without a variant opens the deal's variant of that type", async () => {
    offer({ [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt", NEWV, "Badewannentür") }, MIXED);
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten`);
    await waitFor(() => expect(router.state.location.search).toBe("?variante=v1"));
    expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bu/Kundendaten`);
    expect(toast.info).not.toHaveBeenCalled();
  });
});

describe("the deal overview (Hauptmenü „Öffnen“ with the deal number)", () => {
  const HOME = { "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/offers/v2/search*": { body: { rows: [] } }, [`GET /api/offers/v2/by-deal/${DEAL}`]: { body: { rows: [] } } };
  const MIXED = listOf(variant({ isDefault: false, status: "sent", sentAt: "2026-11-20T10:00:00.000Z" }), variant({ variantId: NEWV, name: "Badewannentür", offerType: "bwt", isDefault: true }));

  it("shows both variants with their types; „Weiteres Angebot“ there offers both ways", async () => {
    offer({ ...HOME, [`GET /api/deals/${DEAL}/draft`]: draftOf("bwt", NEWV, "Badewannentür") }, MIXED);
    renderApp("/");
    await userEvent.type(await screen.findByLabelText("Öffnen"), `${DEAL}{Enter}`);
    const ov = await screen.findByTestId("deal-overview");
    expect(within(ov).getByText(/^Zu Auftrag 4711 gibt es Angebote Badumbau und Badewannentür in 2 Varianten/)).toBeInTheDocument();
    expect(within(ov).getAllByTestId("overview-variant").map((r) => [...r.querySelectorAll('[data-part="badges"] > span')].map((b) => b.textContent).join(" | "))).toEqual(["Badumbau | Gesendet am 20.11.2026", "Badewannentür | Entwurf"]);
    await userEvent.click(within(ov).getByRole("button", { name: TEXT.button }));
    await screen.findByTestId("second-offer-dialog");
    // the source is the variant opened last (Badewannentür): the other four types
    expect(within(screen.getByTestId("second-offer-types")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Badumbau", "Handlauf", "Badelift", "Alltagshilfe"]);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Alltagshilfe" }));
    expect(way("same-deal")).toBeEnabled();
    expect(way("new-deal")).toBeEnabled();
  });
});
