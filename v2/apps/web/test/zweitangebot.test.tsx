// A second offer type for the same customer (ADR 027 B, step 2: the React app; UX-CHANGES U-046).
// A NEW feature — no recording of today's UI; the server is stubbed with the shapes of
// @oc/api-contract (createSecondOffer, dealRelated, the draft's `related`) and the error codes and
// German messages of apps/server/src/modules/deal-drafts/second-offer.ts.
import { CREATION_ID_RE } from "@oc/api-contract";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT, mergeRelated, newCreationId, otherTypes, outcomeOf, relatedStatusText } from "../src/features/offer/model/second-offer.js";
import { ApiFailure } from "../src/shared/api/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import lean from "./fixtures/home-planung-v2.json";
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

process.env.TZ = "Europe/Berlin";
type Obj = Record<string, any>;
const DEAL = "4711", NEW = "5001";
const at = "2026-11-20T09:00:00.000Z";
const REL = { dealId: NEW, offerType: "ah", role: "created", createdAt: at, creationId: "c".repeat(32) };
const draftOf = (more: Obj = {}, dealId = DEAL, type = "bu"): Reply => ({ body: { dealId, offerType: type, payload: { activeOffer: type, Kundendaten: { firstName: "Erika", lastName: "Muster", city: "Hof" } }, revision: 3, updatedAt: at, variantId: "v1", variantName: "Variante 1", ...more } });
const variants: Reply = { body: { dealId: DEAL, defaultVariantId: "v1", variants: [{ variantId: "v1", name: "Variante 1", offerType: "bu", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null, revision: 3, updatedAt: at, notChosenAt: null, isDefault: true }] } };
const related = (...rows: Obj[]): Reply => ({ body: { dealId: DEAL, related: rows } });
const ok = (b: Obj, more: Obj = {}): Reply => ({ body: { ok: true, creationId: b.creationId, sourceDealId: DEAL, sourceVariantId: "v1", dealId: NEW, offerType: b.offerType, variantId: "v1", revision: 1, comments: "ok", repeated: false, ...more } });
const refusal = (status: number, code: string, message: string, more: Obj = {}): Reply => ({ status, body: { error: { code, message, requestId: "t", ...more } } });
const M = {
  unclear: "Es ist unklar, ob Bitrix den neuen Auftrag angelegt hat. Bitte prüfen Sie in Bitrix unter „Neue Anfragen“, ob der Auftrag existiert, bevor Sie es erneut versuchen.",
  refused: "Bitrix hat das Anlegen des Auftrags abgelehnt. Es wurde kein neuer Auftrag angelegt. Bitte versuchen Sie es erneut oder wenden Sie sich an den Administrator.",
  noContact: "Zu diesem Auftrag ist in Bitrix kein Kontakt hinterlegt. Bitte verknüpfen Sie zuerst einen Kontakt mit dem Deal.",
  running: "Das weitere Angebot wird gerade angelegt. Bitte warten Sie einen Moment.",
  draftFailed: `Der Auftrag ${NEW} wurde in Bitrix angelegt, das Angebot dazu konnte aber nicht gespeichert werden. Bitte versuchen Sie es erneut – es wird kein weiterer Auftrag angelegt.`,
};
const POST = `POST /api/deals/${DEAL}/second-offer`;
const S = () => useOfferStore.getState();
const dialog = () => screen.getByTestId("second-offer-dialog");
const posts = (s: { calls: { key: string; body: unknown }[] }) => s.calls.filter((c) => c.key === POST).map((c) => c.body as Obj);

/** the open Badumbau offer of deal 4711 (first variant), the new deal's draft, the lists */
function offer(more: Record<string, Reply | ((b: unknown) => Reply)> = {}, draft: Obj = {}) {
  return fakeServer({
    ...BASE, [`GET /api/deals/${DEAL}/draft?variant=v1`]: draftOf(draft), [`GET /api/deals/${DEAL}/draft`]: draftOf(draft),
    [`GET /api/deals/${DEAL}/variants`]: variants, [`GET /api/deals/${DEAL}/related`]: related(),
    [`PUT /api/deals/${DEAL}/draft?variant=v1`]: { body: { dealId: DEAL, revision: 4, changed: true } },
    [`GET /api/deals/${NEW}/draft`]: draftOf({}, NEW, "ah"), [`GET /api/deals/${NEW}/draft?variant=v1`]: draftOf({}, NEW, "ah"),
    ...more,
  });
}
/** header panel → „Weiteres Angebot für diesen Kunden“ */
async function openDialog() {
  await userEvent.click(await screen.findByTestId("variant-switch"));
  await userEvent.click(within(await screen.findByTestId("related-section")).getByRole("button", { name: TEXT.button }));
  return screen.findByTestId("second-offer-dialog");
}
async function toConfirm(title = "Alltagshilfe") {
  await openDialog();
  await userEvent.click(within(dialog()).getByRole("button", { name: title }));
  expect(dialog()).toHaveAttribute("data-step", "confirm");
}
const confirm = () => userEvent.click(within(dialog()).getByRole("button", { name: TEXT.yes }));

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); });

describe("second offer — the rules", () => {
  it("creation ids match the contract and differ", () => {
    const a = newCreationId(), b = newCreationId();
    expect(a).toMatch(CREATION_ID_RE); expect(a).not.toBe(b);
  });
  it("the other types: never the open one", () => {
    expect(otherTypes("bu")).toEqual(["bwt", "hl", "bl", "ah"]);
    expect(otherTypes("ah")).not.toContain("ah");
  });
  it("relations: draft and /related once per deal, the status from /related", () => {
    const rows = mergeRelated([REL as never, { ...REL, dealId: "5002", offerType: "hl", createdAt: "2026-11-20T10:00:00.000Z" } as never], [{ ...REL, status: "sent" } as never]);
    expect(rows.map((r) => [r.dealId, r.offerType, r.status])).toEqual([[NEW, "ah", "sent"], ["5002", "hl", undefined]]);
    expect(["draft", "sent", "signed", "not-chosen", null].map((s) => relatedStatusText(s as never))).toEqual(["Entwurf", "Gesendet", "Unterschrieben", "Nicht gewählt", ""]);
  });
  it("outcomes: which failures keep the id and which action they allow", () => {
    const f = (code: string, more: Obj = {}, status = 409) => outcomeOf(new ApiFailure("m", status, code, "t", more));
    expect(f("SECOND_OFFER_UNCLEAR").kind).toBe("unclear");
    expect(f("SECOND_OFFER_DRAFT_FAILED", { newDealId: NEW })).toMatchObject({ kind: "draft-failed", newDealId: NEW });
    expect(f("SECOND_OFFER_BITRIX_FAILED").kind).toBe("retry");
    expect(f("SECOND_OFFER_RUNNING").kind).toBe("running");
    for (const c of ["SECOND_OFFER_NO_CONTACT", "SECOND_OFFER_SAME_TYPE", "SECOND_OFFER_TEMP_DEAL", "SECOND_OFFER_SOURCE_MISSING", "SECOND_OFFER_ID_MISMATCH"]) expect(f(c).kind).toBe("final");
    expect(f("OFFLINE", {}, 0).kind).toBe("no-answer");
  });
});

describe("second offer — entry points", () => {
  it("the header panel: a section apart from the variant actions with the button; the dialog offers the four other types", async () => {
    offer();
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await openDialog();
    expect(dialog()).toHaveAttribute("data-step", "type");
    expect(within(screen.getByTestId("second-offer-types")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Badewannentür", "Handlauf", "Badelift", "Alltagshilfe"]);
    expect(within(dialog()).getByTestId("second-offer-same-type")).toHaveTextContent("Ein weiteres Angebot derselben Art (Badumbau) ist eine Variante.");
    expect(screen.queryByTestId("variant-panel")).toBeNull(); // the panel gave way to the dialog
  });

  it("the same-type hint opens „Variante erstellen“", async () => {
    offer();
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await openDialog();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Variante erstellen" }));
    expect(await screen.findByTestId("variant-panel")).toHaveAttribute("data-mode", "create");
    expect(screen.queryByTestId("second-offer-dialog")).toBeNull();
  });

  it("an offer without a Bitrix deal (temporary key): disabled, with the reason", async () => {
    fakeServer({ ...BASE, "GET /api/config/public": { body: {} } });
    renderApp("/deal/t-0123456789abcdef01234567/bu/Kundendaten");
    await userEvent.click(await screen.findByTestId("variant-switch"));
    const sec = await screen.findByTestId("related-section");
    expect(within(sec).getByRole("button", { name: TEXT.button })).toBeDisabled();
    expect(sec).toHaveTextContent(TEXT.tempReason);
  });

  it("the Versand page: beside „Variante erstellen“, opens the same dialog", async () => {
    offer({ "GET /api/users": { body: { users: [], me: null } } });
    renderApp(`/deal/${DEAL}/bu/Zusammenfassung?variante=v1`);
    const box = await screen.findByTestId("zf-variant");
    expect(within(box).getByRole("button", { name: "Variante erstellen" })).toBeInTheDocument();
    await userEvent.click(within(box).getByRole("button", { name: TEXT.button }));
    expect(await screen.findByTestId("second-offer-dialog")).toHaveAttribute("data-step", "type");
  });
});

describe("second offer — confirmation and creation", () => {
  it("the confirmation says what will happen; nothing is sent before „Ja, anlegen“", async () => {
    const s = offer();
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    const text = screen.getByTestId("second-offer-summary").textContent ?? "";
    for (const t of [TEXT.confirmDeal("Erika Muster"), "Angebotsart: Alltagshilfe", TEXT.confirmAuto, TEXT.confirmCopy, TEXT.confirmSource(DEAL)]) expect(text).toContain(t);
    expect(text).toContain("„Neue Anfragen“");
    expect(within(dialog()).getByRole("button", { name: TEXT.cancel })).toBeInTheDocument();
    expect(s.count(POST)).toBe(0);
  });

  it("success: the open offer is saved first, one request, then the new deal opens on Kundendaten with a notice", async () => {
    usePrefs.getState().setAutosave(false);
    const s = offer({ [POST]: (b) => ok(b as Obj) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "x");
    await toConfirm();
    await confirm();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/ah/Kundendaten`));
    const keys = s.calls.map((c) => c.key);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeGreaterThan(-1);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeLessThan(keys.indexOf(POST));
    expect(posts(s)).toHaveLength(1);
    expect(posts(s)[0]).toEqual({ offerType: "ah", creationId: expect.stringMatching(CREATION_ID_RE), variantId: "v1" });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(TEXT.created(NEW), undefined);
    await waitFor(() => expect(S().dealId).toBe(NEW));
    expect(screen.queryByTestId("second-offer-dialog")).toBeNull();
  });

  it("success with the timeline note failed: said in the notice", async () => {
    offer({ [POST]: (b) => ok(b as Obj, { comments: "failed" }) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/ah/Kundendaten`));
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(TEXT.created(NEW), expect.objectContaining({ description: TEXT.commentsFailed }));
  });

  it("the save of the open offer fails: nothing is created, the dialog says why", async () => {
    usePrefs.getState().setAutosave(false);
    const s = offer({ [`PUT /api/deals/${DEAL}/draft?variant=v1`]: refusal(409, "REVISION_CONFLICT", "x"), [POST]: (b) => ok(b as Obj) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "x");
    await toConfirm();
    await confirm();
    expect(await within(dialog()).findByText(/Es wurde nichts angelegt, weil das geöffnete Angebot nicht gespeichert werden konnte/)).toBeInTheDocument();
    expect(s.count(POST)).toBe(0);
    expect(dialog()).toHaveAttribute("data-step", "confirm");
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
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    const yes = within(dialog()).getByRole("button", { name: TEXT.yes });
    await userEvent.click(yes); await userEvent.click(yes);
    await waitFor(() => expect(dialog()).toHaveAttribute("data-busy", "create"));
    expect(within(dialog()).getByRole("button", { name: TEXT.close })).toBeDisabled(); // not closable by accident
    act(() => { dialog().dispatchEvent(new Event("cancel", { cancelable: true })); }); // Esc
    expect(screen.getByTestId("second-offer-dialog")).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByTestId("second-offer-dialog")).toBeNull());
    expect(posts(s)).toHaveLength(1);
  });

  it("offline: refused up front, nothing saved or sent", async () => {
    const s = offer({ [POST]: (b) => ok(b as Obj) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await confirm();
    expect(within(dialog()).getByText(TEXT.offline)).toBeInTheDocument();
    expect(s.count(POST)).toBe(0);
  });
});

describe("second offer — failures and their one action", () => {
  it("UNCLEAR: only „In Bitrix prüfen“ — the same id with checkBitrix; no blind retry", async () => {
    let n = 0;
    const s = offer({ [POST]: (b) => (++n === 1 ? refusal(502, "SECOND_OFFER_UNCLEAR", M.unclear, { creationId: (b as Obj).creationId }) : ok(b as Obj)) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    const r = await screen.findByTestId("second-offer-result");
    expect(r).toHaveAttribute("data-kind", "unclear");
    expect(r).toHaveTextContent(TEXT.unclear);
    expect(within(r).getAllByRole("button").map((b) => b.textContent)).toEqual([TEXT.close, TEXT.checkBitrix]);
    await userEvent.click(within(r).getByRole("button", { name: TEXT.checkBitrix }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/ah/Kundendaten`));
    const [a, b] = posts(s);
    expect(b).toEqual({ ...a, checkBitrix: true });
    expect(a!.checkBitrix).toBeUndefined();
  });

  it("UNCLEAR, closed and opened again: the same creation continues (kept on the device)", async () => {
    const s = offer({ [POST]: (b) => refusal(502, "SECOND_OFFER_UNCLEAR", M.unclear, { creationId: (b as Obj).creationId }) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    await userEvent.click(within(await screen.findByTestId("second-offer-result")).getByRole("button", { name: TEXT.close }));
    expect(screen.queryByTestId("second-offer-dialog")).toBeNull();
    await openDialog();
    expect(dialog()).toHaveAttribute("data-step", "result");
    await userEvent.click(within(dialog()).getByRole("button", { name: TEXT.checkBitrix }));
    await waitFor(() => expect(posts(s)).toHaveLength(2));
    expect(posts(s)[1]).toMatchObject({ creationId: posts(s)[0]!.creationId, checkBitrix: true, offerType: "ah" });
  });

  it("DRAFT_FAILED: names the deal that exists; „Erneut versuchen“ repeats with the same id", async () => {
    let n = 0;
    const s = offer({ [POST]: (b) => (++n === 1 ? refusal(500, "SECOND_OFFER_DRAFT_FAILED", M.draftFailed, { newDealId: NEW, creationId: (b as Obj).creationId }) : ok(b as Obj, { repeated: false })) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    const r = await screen.findByTestId("second-offer-result");
    expect(r).toHaveTextContent(TEXT.draftFailed(NEW));
    await userEvent.click(within(r).getByRole("button", { name: TEXT.retry }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/ah/Kundendaten`));
    expect(posts(s).map((p) => p.creationId)).toEqual([posts(s)[0]!.creationId, posts(s)[0]!.creationId]);
    expect(posts(s)[1]!.checkBitrix).toBeUndefined();
  });

  it("BITRIX_FAILED (definite): the server's message and „Erneut versuchen“ with the same id", async () => {
    let n = 0;
    const s = offer({ [POST]: (b) => (++n === 1 ? refusal(502, "SECOND_OFFER_BITRIX_FAILED", M.refused) : ok(b as Obj)) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    const r = await screen.findByTestId("second-offer-result");
    expect(r).toHaveTextContent(M.refused);
    await userEvent.click(within(r).getByRole("button", { name: TEXT.retry }));
    await waitFor(() => expect(posts(s)).toHaveLength(2));
    expect(posts(s)[1]!.creationId).toBe(posts(s)[0]!.creationId);
  });

  it.each([
    ["SECOND_OFFER_NO_CONTACT", M.noContact],
    ["SECOND_OFFER_SAME_TYPE", "Für dieselbe Angebotsart legen Sie bitte eine Variante an. Ein weiteres Angebot ist nur für eine andere Angebotsart möglich."],
    ["SECOND_OFFER_TEMP_DEAL", "Das Angebot hat noch keine Deal-Nummer. Bitte speichern Sie es zuerst unter einem Bitrix-Auftrag."],
    ["SECOND_OFFER_SOURCE_MISSING", "Für diesen Auftrag gibt es noch keinen Entwurf."],
  ])("%s: the server's message, no retry; closing gives the id up", async (code, message) => {
    const s = offer({ [POST]: refusal(409, code, message) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    const r = await screen.findByTestId("second-offer-result");
    expect(r).toHaveTextContent(message);
    expect(within(r).getAllByRole("button").map((b) => b.textContent)).toEqual([TEXT.close]);
    await userEvent.click(within(r).getByRole("button", { name: TEXT.close }));
    expect(localStorage.getItem(`oc.secondOffer.${DEAL}`)).toBeNull();
    await toConfirm("Badelift");
    await confirm();
    await waitFor(() => expect(posts(s)).toHaveLength(2));
    expect(posts(s)[1]!.creationId).not.toBe(posts(s)[0]!.creationId); // a new dialog after a definite failure: a new id
  });

  it("RUNNING: „Bitte kurz warten und erneut prüfen“ → the same id", async () => {
    let n = 0;
    const s = offer({ [POST]: (b) => (++n === 1 ? refusal(409, "SECOND_OFFER_RUNNING", M.running) : ok(b as Obj)) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await toConfirm();
    await confirm();
    const r = await screen.findByTestId("second-offer-result");
    expect(r).toHaveTextContent(`${M.running} ${TEXT.running}`);
    await userEvent.click(within(r).getByRole("button", { name: TEXT.checkAgain }));
    await waitFor(() => expect(posts(s)).toHaveLength(2));
    expect(posts(s)[1]!.creationId).toBe(posts(s)[0]!.creationId);
  });
});

describe("second offer — relations", () => {
  it("panel lists the related deals with type, deal and status; the header pill shows a count; a tap saves and opens it", async () => {
    usePrefs.getState().setAutosave(false);
    const s = offer({ [`GET /api/deals/${DEAL}/related`]: related({ ...REL, status: "sent" }) }, { related: [REL] });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    expect(await screen.findByTestId("variant-switch")).toHaveAccessibleName(/1 weiteres Angebot dieses Kunden/);
    expect(screen.getByTestId("variant-switch").querySelector('[data-part="related"]')).toHaveTextContent("+1");
    expect(s.count(`GET /api/deals/${DEAL}/related`)).toBe(0); // opening the offer asks nothing more
    await userEvent.type(screen.getByLabelText("Vorname"), "x");
    await userEvent.click(screen.getByTestId("variant-switch"));
    const row = await screen.findByTestId("related-row");
    await waitFor(() => expect(row).toHaveTextContent("Gesendet"));
    expect(row).toHaveTextContent(`Alltagshilfe · Auftrag ${NEW}`);
    await userEvent.click(row);
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${NEW}/ah`)));
    const keys = s.calls.map((c) => c.key);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeGreaterThan(-1);
    expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=v1`)).toBeLessThan(keys.indexOf(`GET /api/deals/${NEW}/draft`));
  });

  it("statuses, and asked again on window focus", async () => {
    let signed = false;
    const s = offer({ [`GET /api/deals/${DEAL}/related`]: () => related({ ...REL, status: signed ? "signed" : "draft" }, { ...REL, dealId: "5002", offerType: "hl", status: null }) });
    renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.click(await screen.findByTestId("variant-switch"));
    await waitFor(() => expect(screen.getAllByTestId("related-row").map((r) => r.dataset.status)).toEqual(["draft", ""]));
    expect(screen.getAllByTestId("related-row")[1]!.querySelector('[data-part="status"]')).toBeNull(); // no draft yet: no status word
    signed = true;
    await new Promise((r) => setTimeout(r, 5_100));
    act(() => { window.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.getAllByTestId("related-row")[0]).toHaveTextContent("Unterschrieben"));
    expect(s.count(`GET /api/deals/${DEAL}/related`)).toBeGreaterThanOrEqual(2);
  }, 15_000);

  it("type choice: a type that exists already is marked; „Öffnen“ is the first action, „Trotzdem neu anlegen“ explicit", async () => {
    const s = offer({ [`GET /api/deals/${DEAL}/related`]: related({ ...REL, status: "draft" }), [POST]: (b) => ok(b as Obj) }, { related: [REL] });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await openDialog();
    const ah = within(screen.getByTestId("second-offer-types")).getByText("Alltagshilfe").closest("li")!;
    expect(ah).toHaveTextContent(TEXT.exists(NEW));
    expect(within(ah).getAllByRole("button").map((b) => b.textContent)).toEqual([TEXT.open, TEXT.createAnyway]);
    await userEvent.click(within(ah).getByRole("button", { name: TEXT.createAnyway }));
    expect(dialog()).toHaveAttribute("data-step", "confirm");
    await userEvent.click(within(dialog()).getByRole("button", { name: TEXT.cancel }));
    await openDialog();
    await userEvent.click(within(within(screen.getByTestId("second-offer-types")).getByText("Alltagshilfe").closest("li")!).getByRole("button", { name: TEXT.open }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${NEW}/ah`)));
    expect(s.count(POST)).toBe(0);
  });
});

describe("second offer — planning and addresses", () => {
  const PLAN = {
    "GET /api/planning/v2/today": { body: lean.today }, "GET /api/planning/v2/today?date=*": { body: lean.today }, "GET /api/planning/v2/week?from=*": { body: lean.week },
    "POST /api/bitrix/log-action": { body: { ok: true } }, "GET /api/offers/by-deal/*": { body: [] },
  };
  const card = (id: string) => document.querySelector(`[data-testid="appointment"][data-id="${id}"]`) as HTMLElement;
  async function pick(title: string) {
    await waitFor(() => expect(card("a1")).toBeTruthy());
    await userEvent.click(within(card("a1")).getByRole("button", { name: "In Konfigurator öffnen" }));
    await userEvent.click(await screen.findByRole("button", { name: title }));
  }
  const DRAFT70 = { body: { dealId: "70001", offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { firstName: "Erika", lastName: "Muster" } }, revision: 2, updatedAt: at, variantId: "v1", variantName: "Variante 1" } };

  it("another type than the deal's draft: a choice instead of a silent redirect — open the existing one", async () => {
    fakeServer({ ...BASE, ...PLAN, "GET /api/deals/70001/draft": DRAFT70, "GET /api/deals/70001/related": { body: { dealId: "70001", related: [] } } });
    const router = renderApp("/");
    await pick("Alltagshilfe");
    const c = await screen.findByTestId("picker-choice");
    expect(within(c).getByRole("button", { name: "Bestehendes Angebot (Badumbau) öffnen" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Weiteres Angebot (Alltagshilfe) für diesen Kunden anlegen" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    await userEvent.click(within(c).getByRole("button", { name: "Bestehendes Angebot (Badumbau) öffnen" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
  });

  it("„Weiteres Angebot“ from the planning opens the confirmation with the existing draft as source", async () => {
    const s = fakeServer({ ...BASE, ...PLAN, "GET /api/deals/70001/draft": DRAFT70, "GET /api/deals/70001/related": { body: { dealId: "70001", related: [] } },
      "POST /api/deals/70001/second-offer": (b) => ({ body: { ...(ok(b as Obj).body as Obj), sourceDealId: "70001" } }), [`GET /api/deals/${NEW}/draft`]: draftOf({}, NEW, "ah") });
    const router = renderApp("/");
    await pick("Alltagshilfe");
    await userEvent.click(within(await screen.findByTestId("picker-choice")).getByRole("button", { name: /^Weiteres Angebot/ }));
    expect(await screen.findByTestId("second-offer-dialog")).toHaveAttribute("data-step", "confirm");
    expect(screen.getByTestId("second-offer-summary")).toHaveTextContent("Angebotsart: Alltagshilfe");
    expect(screen.getByTestId("second-offer-summary")).toHaveTextContent("(Erika Muster)");
    await confirm();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/ah/Kundendaten`));
    expect(s.calls.find((c) => c.key === "POST /api/deals/70001/second-offer")!.body).toEqual({ offerType: "ah", creationId: expect.stringMatching(CREATION_ID_RE), variantId: "v1" });
  });

  it("the customer already has an offer of the picked type: offered to open THAT", async () => {
    fakeServer({ ...BASE, ...PLAN, "GET /api/deals/70001/draft": DRAFT70,
      "GET /api/deals/70001/related": { body: { dealId: "70001", related: [{ ...REL, status: "draft" }] } }, [`GET /api/deals/${NEW}/draft`]: draftOf({}, NEW, "ah") });
    const router = renderApp("/");
    await pick("Alltagshilfe");
    const c = await screen.findByTestId("picker-choice");
    expect(c).toHaveTextContent(`Für diesen Kunden gibt es auch schon ein Angebot Alltagshilfe: Auftrag ${NEW}.`);
    expect(within(c).getAllByRole("button")[0]).toHaveTextContent(`Angebot Alltagshilfe öffnen (Auftrag ${NEW})`);
    await userEvent.click(within(c).getAllByRole("button")[0]!);
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${NEW}/ah`)));
  });

  it("the same type as the draft, or no draft: opens as before (no choice)", async () => {
    fakeServer({ ...BASE, ...PLAN, "GET /api/deals/70001/draft": DRAFT70, "GET /api/deals/70001/related": { body: { dealId: "70001", related: [] } } });
    const router = renderApp("/");
    await pick("Badumbau");
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/deal\/70001\/bu/));
    expect(screen.queryByTestId("picker-choice")).toBeNull();
  });

  it("a direct address with another type keeps today's redirect and says why (nothing is created)", async () => {
    const s = fakeServer({ ...BASE, [`GET /api/deals/${DEAL}/draft`]: draftOf({}, DEAL, "bwt") });
    const router = renderApp(`/deal/${DEAL}/ah/Kundendaten`);
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${DEAL}/bwt`)));
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(TEXT.otherTypeNotice(DEAL, "Badewannentür", "Alltagshilfe"), expect.anything());
    expect(s.calls.some((c) => c.key.includes("second-offer"))).toBe(false);
  });
});
