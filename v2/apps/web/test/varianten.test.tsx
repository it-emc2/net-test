// Variants of a deal's offer (ADR 027 A, step 2: the React app; UX-CHANGES U-044). A NEW feature —
// there is no recording of today's UI for it; the server is stubbed with the shapes of
// @oc/api-contract (dealVariants, createDealVariant, renameDealVariant, deleteDealVariant, ?variant=).
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT, nextVariantName, sendVariantOf, snapshotKey, statusText, variantOfSend } from "../src/features/offer/model/variants.js";
import { historyChanged } from "../src/features/steps/versand/Verlauf.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import sign from "./fixtures/versand-unterschrift.json" with { type: "json" };
import reference from "./fixtures/versand-post.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

process.env.TZ = "Europe/Berlin";
type Obj = Record<string, any>;
const DEAL = "4711", V1 = "v1", V2 = "v-0123456789ab", V3 = "v-abcdefabcdef";
const S = () => useOfferStore.getState();
const draftOf = (variantId: string, variantName: string, city: string, revision = 3, payload: Obj = {}): Reply =>
  ({ body: { dealId: DEAL, offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city }, ...payload }, revision, updatedAt: "2026-11-19T10:00:00Z", variantId, variantName } });
const row = (variantId: string, name: string, more: Obj = {}): Obj => ({
  variantId, name, offerType: "bu", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null,
  revision: 3, updatedAt: "2026-11-19T10:00:00Z", notChosenAt: null, isDefault: false, ...more,
});
const list = (...variants: Obj[]): Reply => ({ body: { dealId: DEAL, defaultVariantId: variants.find((v) => v.isDefault)?.variantId ?? variants[0]?.variantId ?? null, variants } });
const TWO = list(row(V1, "Variante 1", { status: "sent", sentAt: "2026-11-18T09:00:00Z", sentChannel: "email", total: 12345.5, offerNumber: "ANG2026-1118-090000" }), row(V2, "Günstig", { isDefault: true }));
const saved = (revision: number): Reply => ({ body: { dealId: DEAL, revision, changed: true } });
const search = (r: { state: { location: { search: string } } }) => r.state.location.search;
const panel = () => screen.getByTestId("variant-panel");
const rows = () => within(panel()).getAllByTestId("variant-row");
const openPanel = async () => { await userEvent.click(await screen.findByTestId("variant-switch")); return screen.findByTestId("variant-panel"); };

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  // jsdom has no showModal/close: the panel falls back to the open attribute (as the step drawer)
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
});
afterEach(() => vi.restoreAllMocks());

describe("variants — the rules", () => {
  it("status words", () => {
    expect(statusText({ status: "draft", sentAt: null })).toBe("Entwurf");
    expect(statusText({ status: "sent", sentAt: "2026-11-18T09:00:00Z" })).toBe("Gesendet am 18.11.2026");
    expect(statusText({ status: "signed", sentAt: "2026-11-18T09:00:00Z" })).toBe("Unterschrieben");
    expect(statusText({ status: "not-chosen", sentAt: null })).toBe("Nicht gewählt");
  });
  it("the suggested name follows the server's fallback rule", () => {
    expect(nextVariantName([{ name: "Variante 1" }])).toBe("Variante 2");
    expect(nextVariantName([{ name: "Variante 1" }, { name: "Variante 3" }])).toBe("Variante 4");
    expect(nextVariantName([])).toBe("Variante 2");
  });
  it("snapshot keys: the first variant keeps today's key", () => {
    expect(snapshotKey(DEAL, V1)).toBe("oc.snapshot.4711");
    expect(snapshotKey(DEAL, null)).toBe("oc.snapshot.4711");
    expect(snapshotKey(DEAL, V2)).toBe(`oc.snapshot.4711#${V2}`);
  });
  it("a send names the variant once the server named it, and only for the deal the draft is saved under", () => {
    expect(sendVariantOf({ dealId: DEAL, variantId: V2, variantKnown: true }, DEAL)).toBe(V2);
    expect(sendVariantOf({ dealId: DEAL, variantId: V1, variantKnown: false }, DEAL)).toBeUndefined();
    expect(sendVariantOf({ dealId: "t-0123456789abcdef01234567", variantId: V2, variantKnown: true }, DEAL)).toBeUndefined();
  });
  it("the variant of a send: its id, else by number, else the first", () => {
    const vs = TWO.body as Obj;
    expect(variantOfSend({ variantId: V2 }, vs.variants)?.name).toBe("Günstig");
    expect(variantOfSend({ offerNumber: "ANG2026-1118-090000" }, vs.variants)?.variantId).toBe(V1);
    expect(variantOfSend({ offerNumber: "ANG-OLD" }, vs.variants)?.variantId).toBe(V1);
  });
});

describe("variants — address and state", () => {
  it("an address without the variant opens the server's last-opened one and then names it", async () => {
    const s = fakeServer({ ...BASE, "GET /api/deals/4711/draft": draftOf(V2, "Günstig", "Hof") });
    const router = renderApp("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(search(router)).toBe(`?variante=${V2}`));
    expect(router.state.location.pathname).toBe("/deal/4711/bu/Kundendaten");
    expect(screen.getByTestId("variant-switch")).toHaveTextContent("Günstig");
    expect([S().variantId, S().variantKnown]).toEqual([V2, true]);
    expect(s.count("GET /api/deals/4711/draft")).toBe(1);
  });

  it("an address with the variant opens that one; draft saves carry it", async () => {
    const s = fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Hof"), [`PUT /api/deals/4711/draft?variant=${V2}`]: saved(4) });
    renderApp(`/deal/4711/bu/Kundendaten?variante=${V2}`);
    expect(await screen.findByLabelText(/^Ort/)).toHaveValue("Hof");
    await userEvent.type(screen.getByLabelText("Vorname"), "Erika");
    await act(async () => { await (await import("../src/features/offer/index.js")).flushDraft(); });
    expect(s.count(`PUT /api/deals/4711/draft?variant=${V2}`)).toBe(1);
    expect(s.count("PUT /api/deals/4711/draft")).toBe(0);
  });

  it("a variant that is gone (an old link): the server's default opens and the address follows", async () => {
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V3}`]: { status: 404, body: { error: { code: "VARIANT_NOT_FOUND", message: "Diese Variante gibt es nicht (mehr).", requestId: "t" }, revision: 0 } },
      "GET /api/deals/4711/draft": draftOf(V1, "Variante 1", "Hof") });
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V3}`);
    await waitFor(() => expect(search(router)).toBe(`?variante=${V1}`));
    expect(router.state.location.pathname).toBe("/deal/4711/bu/Kundendaten");
    expect(await screen.findByLabelText(/^Ort/)).toHaveValue("Hof");
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(TEXT.gone, expect.anything());
  });

  it("reload keeps the variant: the address names it and its device snapshot is restored", async () => {
    const put = { [`PUT /api/deals/4711/draft?variant=${V2}`]: saved(4) };
    usePrefs.getState().setAutosave(false);
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Hof"), ...put });
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V2}`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "Erika");
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem(`oc.snapshot.4711#${V2}`)!).payload.Kundendaten.firstName).toBe("Erika");
    expect(localStorage.getItem("oc.snapshot.4711")).toBeNull(); // the first variant's snapshot is another one
    const at = router.state.location.pathname + router.state.location.search;
    cleanup(); S().close();
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Hof"), ...put });
    const again = renderApp(at);
    expect(await screen.findByLabelText("Vorname")).toHaveValue("Erika");
    expect(search(again)).toBe(`?variante=${V2}`);
    expect(S().variantId).toBe(V2);
  });

  it("the first variant keeps today's snapshot key (snapshots already on devices stay valid)", async () => {
    localStorage.setItem("oc.snapshot.4711", JSON.stringify({ at: 1, revision: 3, offerType: "bu", payload: { activeOffer: "bu", Kundendaten: { city: "vom Gerät" } } }));
    fakeServer({ ...BASE, "GET /api/deals/4711/draft": draftOf(V1, "Variante 1", "Server") });
    renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByLabelText(/^Ort/)).toHaveValue("vom Gerät");
    expect(S().version).toBeGreaterThan(S().savedVersion);
  });
});

describe("variants — the selector", () => {
  it("a one-variant deal: as today, plus the selector with its name and „Variante erstellen“ (no delete)", async () => {
    const s = fakeServer({ ...BASE, "GET /api/deals/4711/draft": draftOf(V1, "Variante 1", "Hof"), "GET /api/deals/4711/variants": list(row(V1, "Variante 1", { isDefault: true })) });
    renderApp("/deal/4711/bu/Kundendaten");
    expect(await screen.findByTestId("variant-switch")).toHaveTextContent("Variante 1");
    expect(screen.getByTestId("header-deal")).toHaveTextContent("Deal 4711");
    expect(s.count("GET /api/deals/4711/variants")).toBe(0); // opening an offer asks for no list
    await openPanel();
    await waitFor(() => expect(s.count("GET /api/deals/4711/variants")).toBe(1));
    expect(rows()).toHaveLength(1);
    expect(within(panel()).queryByRole("button", { name: /^Löschen/ })).toBeNull();
    expect(within(panel()).getByRole("button", { name: "Variante erstellen" })).toBeInTheDocument();
  });

  it("lists name, total and status; tapping one saves the open variant first, then opens the other on the same step", async () => {
    const s = fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"), [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Selb"),
      "GET /api/deals/4711/variants": TWO, [`PUT /api/deals/4711/draft?variant=${V1}`]: saved(4) });
    usePrefs.getState().setAutosave(false); // pending input: only the switch saves it
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V1}`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "Erika");
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map((r) => r.textContent)).toEqual(["Variante 1(geöffnet)Gesendet am 18.11.202612.345,50 €ANG2026-1118-090000", "GünstigEntwurf"]);
    await userEvent.click(within(rows()[1]!).getByRole("button", { name: /Günstig/ }));
    await waitFor(() => expect(search(router)).toBe(`?variante=${V2}`));
    expect(router.state.location.pathname).toBe("/deal/4711/bu/Kundendaten");
    await waitFor(() => expect(screen.getByLabelText(/^Ort/)).toHaveValue("Selb"));
    const keys = s.calls.map((c) => c.key);
    expect(keys.indexOf(`PUT /api/deals/4711/draft?variant=${V1}`)).toBeGreaterThan(-1);
    expect(keys.indexOf(`PUT /api/deals/4711/draft?variant=${V1}`)).toBeLessThan(keys.indexOf(`GET /api/deals/4711/draft?variant=${V2}`));
    expect((s.calls.find((c) => c.key === `PUT /api/deals/4711/draft?variant=${V1}`)!.body as Obj).payload.Kundendaten.firstName).toBe("Erika");
    expect(screen.getByTestId("variant-switch")).toHaveTextContent("Günstig");
  });

  it("a save that fails stops the switch: the input stays, the variant stays", async () => {
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"), "GET /api/deals/4711/variants": TWO,
      [`PUT /api/deals/4711/draft?variant=${V1}`]: { status: 409, body: { error: { code: "REVISION_CONFLICT", message: "x", requestId: "t" } } } });
    usePrefs.getState().setAutosave(false);
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V1}`);
    await userEvent.type(await screen.findByLabelText("Vorname"), "Erika");
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(within(rows()[1]!).getByRole("button", { name: /Günstig/ }));
    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith(TEXT.notSaved, expect.anything()));
    expect(search(router)).toBe(`?variante=${V1}`);
    expect(screen.getByLabelText("Vorname")).toHaveValue("Erika");
  });

  it("create: asks for a name (suggested), copies the OPEN variant after saving it, lands on the same step", async () => {
    let created: Obj | null = null;
    const s = fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"), [`GET /api/deals/4711/draft?variant=${V3}`]: draftOf(V3, "Mit Wanne", "Hof", 5),
      "GET /api/deals/4711/variants": TWO, [`PUT /api/deals/4711/draft?variant=${V1}`]: saved(4),
      "POST /api/deals/4711/variants": (b) => { created = b as Obj; return { body: { dealId: DEAL, variant: row(V3, "Mit Wanne", { isDefault: true }), revision: 5 } }; } });
    usePrefs.getState().setAutosave(false);
    const router = renderApp(`/deal/4711/bu/Arbeitszeit?variante=${V1}`);
    await screen.findByTestId("variant-switch");
    act(() => { S().patch("Kundendaten" as never, { notes: "noch nicht gespeichert" } as never); });
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(within(panel()).getByRole("button", { name: "Variante erstellen" }));
    const name = within(panel()).getByLabelText(TEXT.name);
    expect(name).toHaveValue("Variante 3");
    await userEvent.clear(name); await userEvent.type(name, "Mit Wanne");
    await userEvent.click(within(panel()).getByRole("button", { name: "Variante erstellen" }));
    await waitFor(() => expect(search(router)).toBe(`?variante=${V3}`));
    expect(router.state.location.pathname).toBe("/deal/4711/bu/Arbeitszeit");
    expect(created).toEqual({ from: V1, name: "Mit Wanne" });
    const keys = s.calls.map((c) => c.key);
    expect(keys.indexOf(`PUT /api/deals/4711/draft?variant=${V1}`)).toBeLessThan(keys.indexOf("POST /api/deals/4711/variants"));
    await waitFor(() => expect(screen.getByTestId("variant-switch")).toHaveTextContent("Mit Wanne"));
    expect(S().variantId).toBe(V3);
  });

  it("create: a refusal of the server is said in the panel (and nothing is opened)", async () => {
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"), "GET /api/deals/4711/variants": TWO,
      "POST /api/deals/4711/variants": { status: 503, body: { error: { code: "VARIANT_CREATE_FAILED", message: "Varianten sind auf diesem Server noch nicht eingerichtet. Bitte wenden Sie sich an den Administrator.", requestId: "t" } } } });
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V1}`);
    await openPanel();
    await userEvent.click(within(panel()).getByRole("button", { name: "Variante erstellen" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Variante erstellen" }));
    expect(await within(panel()).findByText(/noch nicht eingerichtet/)).toBeInTheDocument();
    expect(search(router)).toBe(`?variante=${V1}`);
  });

  it("rename: the new name is in the list and in the header", async () => {
    let renamed: Obj | null = null;
    const s = fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Hof"), "GET /api/deals/4711/variants": TWO,
      [`PATCH /api/deals/4711/variants/${V2}`]: (b) => { renamed = b as Obj; return { body: { dealId: DEAL, variant: row(V2, "Sparvariante") } }; } });
    renderApp(`/deal/4711/bu/Kundendaten?variante=${V2}`);
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(within(panel()).getByRole("button", { name: "Umbenennen: Günstig" }));
    const name = within(panel()).getByLabelText(TEXT.name);
    await userEvent.clear(name); await userEvent.type(name, "Sparvariante");
    await userEvent.click(within(panel()).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(renamed).toEqual({ name: "Sparvariante" }));
    await waitFor(() => expect(screen.getByTestId("variant-switch")).toHaveTextContent("Sparvariante"));
    expect(s.count(`PATCH /api/deals/4711/variants/${V2}`)).toBe(1);
  });

  it("delete the open variant: asks, deletes, opens the one the server now treats as last opened", async () => {
    const s = fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V2}`]: draftOf(V2, "Günstig", "Selb"), [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"),
      "GET /api/deals/4711/variants": TWO, [`DELETE /api/deals/4711/variants/${V2}`]: { body: { ok: true, dealId: DEAL, variantId: V2, defaultVariantId: V1 } } });
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V2}`);
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(within(panel()).getByRole("button", { name: "Löschen: Günstig" }));
    expect(within(panel()).getByText(TEXT.removeText("Günstig"))).toBeInTheDocument();
    expect(s.count(`DELETE /api/deals/4711/variants/${V2}`)).toBe(0); // nothing before the answer
    await userEvent.click(within(panel()).getByRole("button", { name: "Ja, löschen" }));
    await waitFor(() => expect(search(router)).toBe(`?variante=${V1}`));
    await waitFor(() => expect(screen.getByLabelText(/^Ort/)).toHaveValue("Hof"));
    expect(s.count(`DELETE /api/deals/4711/variants/${V2}`)).toBe(1);
  });

  it.each([
    ["VARIANT_SENT", "Diese Variante wurde bereits versendet und kann nicht gelöscht werden.", TEXT.sentRefused],
    ["VARIANT_LAST", "Die einzige Variante eines Auftrags kann nicht gelöscht werden.", TEXT.lastRefused],
  ])("delete refused (%s): a plain message, the variant stays open", async (code, message, said) => {
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"), "GET /api/deals/4711/variants": TWO,
      [`DELETE /api/deals/4711/variants/${V1}`]: { status: 409, body: { error: { code, message, requestId: "t" } } } });
    const router = renderApp(`/deal/4711/bu/Kundendaten?variante=${V1}`);
    await openPanel();
    await waitFor(() => expect(rows()).toHaveLength(2));
    await userEvent.click(within(panel()).getByRole("button", { name: "Löschen: Variante 1" }));
    await userEvent.click(within(panel()).getByRole("button", { name: "Ja, löschen" }));
    expect(await within(panel()).findByText(said)).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Ja, löschen" })).toBeNull();
    expect(search(router)).toBe(`?variante=${V1}`);
  });

  it("not chosen: shown so in the list, and still the source of a new variant", async () => {
    fakeServer({ ...BASE, [`GET /api/deals/4711/draft?variant=${V1}`]: draftOf(V1, "Variante 1", "Hof"),
      "GET /api/deals/4711/variants": list(row(V1, "Variante 1", { status: "not-chosen", notChosenAt: "2026-11-19T08:00:00Z" }), row(V2, "Günstig", { status: "signed", signedAt: "2026-11-19T08:00:00Z", isDefault: true })) });
    renderApp(`/deal/4711/bu/Kundendaten?variante=${V1}`);
    await openPanel();
    await waitFor(() => expect(rows().map((r) => r.dataset.status)).toEqual(["not-chosen", "signed"]));
    expect(within(rows()[0]!).getByText("Nicht gewählt")).toBeInTheDocument();
    expect(within(rows()[1]!).getByText("Unterschrieben")).toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Variante erstellen" })).toBeInTheDocument();
  });
});

describe("variants — Versand", () => {
  const offer = { ...(reference.bases as unknown as Record<string, Obj>).bu, offerNumber: "ANG2026-1119-100000", auftragId: DEAL, mail: { ...(reference.bases as any).bu.mail, auftragId: DEAL } };
  const versand = (variantId: string, more: Record<string, Reply | ((b: unknown) => Reply)> = {}) => {
    const s = fakeServer({ ...BASE, "GET /api/users": { body: reference.users }, [`GET /api/deals/4711/draft?variant=${variantId}`]: draftOf(variantId, variantId === V1 ? "Variante 1" : "Günstig", "Hof", 3, offer), ...more });
    renderApp(`/deal/4711/bu/Zusammenfassung?variante=${variantId}`);
    return s;
  };
  const SENDS = { body: { ok: true, sends: [
    { sendId: "s2", channel: "email", status: "done", variantId: V2, offerNumber: "ANG2026-1119-100000", to: "kunde@example.test", finishedAt: "2026-11-19T09:00:00.000Z" },
    { sendId: "s1", channel: "email", status: "done", offerNumber: "ANG2026-1118-090000", to: "kunde@example.test", finishedAt: "2026-11-18T09:00:00.000Z" },
  ] } };

  it("„Variante erstellen“ sits on the page and opens the create panel", async () => {
    versand(V2, { "GET /api/deals/4711/variants": TWO });
    await userEvent.click(within(await screen.findByTestId("zf-variant")).getByRole("button", { name: "Variante erstellen" }));
    expect(await screen.findByTestId("variant-panel")).toHaveAttribute("data-mode", "create");
  });

  it("Versandverlauf names the variant of each line when the deal has more than one", async () => {
    versand(V2, { "GET /api/deals/4711/variants": TWO, "GET /api/deals/4711/sends": SENDS });
    await waitFor(() => expect(screen.getAllByTestId("zf-history-row").map((r) => r.querySelector('[data-part="variant"]')?.textContent ?? "")).toEqual(["Günstig", "Variante 1"]));
  });

  it("with one variant the lines are as today (no variant named)", async () => {
    versand(V1, { "GET /api/deals/4711/variants": list(row(V1, "Variante 1", { isDefault: true })), "GET /api/deals/4711/sends": SENDS });
    await waitFor(() => expect(screen.getAllByTestId("zf-history-row")).toHaveLength(2));
    await waitFor(() => expect(document.querySelector('[data-part="variant"]')).toBeNull());
  });

  it("not chosen: a note, no way to send, the offer stays readable", async () => {
    versand(V1, { "GET /api/deals/4711/variants": list(row(V1, "Variante 1", { status: "not-chosen", notChosenAt: "2026-11-19T08:00:00Z" }), row(V2, "Günstig", { status: "signed", isDefault: true })) });
    expect(await screen.findByTestId("zf-not-chosen")).toHaveTextContent(TEXT.notChosen);
    expect(screen.queryByRole("region", { name: "Versandart" })).toBeNull();
    expect(screen.queryByTestId("zf-post")).toBeNull();
    expect(screen.getByLabelText("Ansprechpartner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Variante erstellen" })).toBeInTheDocument();
  });

  it("after a send the selector's status is asked again (no reload)", async () => {
    const s = versand(V2, { "GET /api/deals/4711/variants": TWO });
    await screen.findByTestId("zf-variant");
    await waitFor(() => expect(s.count("GET /api/deals/4711/variants")).toBe(1));
    act(() => historyChanged());
    await waitFor(() => expect(s.count("GET /api/deals/4711/variants")).toBe(2));
  });

  it("signing carries the open variant", async () => {
    const onSite = (sign.scenarios as unknown as Obj[]).find((x) => x.name === "bwt: signed on site")!;
    const base: Obj = structuredClone((sign.bases as unknown as Record<string, Obj>)[onSite.type]!);
    for (const [k, v] of Object.entries(onSite.offer as Obj)) { if (v === "<removed>") delete base[k]; else base[k] = structuredClone(v); }
    const payload = { ...base, auftragId: DEAL, mail: { ...(base.mail ?? {}), auftragId: DEAL } };
    let asked: Obj | null = null;
    vi.stubGlobal("open", vi.fn(() => ({})));
    fakeServer({ ...BASE, "GET /api/users": { body: sign.users }, "GET /api/auth/me": { body: { user: { email: "capture@local.test", name: "Capture", role: "user" } } },
      [`GET /api/deals/4711/draft?variant=${V2}`]: { body: { dealId: DEAL, offerType: onSite.type, payload, revision: 3, updatedAt: "2026-11-19T10:00:00Z", variantId: V2, variantName: "Günstig" } },
      [`PUT /api/deals/4711/draft?variant=${V2}`]: saved(4), "POST /api/offers": { body: { ok: true } }, "POST /api/offer-numbers/claim": (b) => ({ body: { offerNumber: (b as Obj).current, changed: false } }),
      "POST /api/signing": (b) => { asked = b as Obj; return { status: 201, body: sign.signing }; } });
    renderApp(`/deal/4711/${onSite.type}/Zusammenfassung?variante=${V2}`);
    await userEvent.click((await screen.findByTestId("zf-sign-mail")).querySelector<HTMLElement>('[data-action="sign"]')!);
    await waitFor(() => expect(asked).not.toBeNull(), { timeout: 3000 });
    expect(asked!.variantId).toBe(V2);
    expect(asked!.dealId).toBe(DEAL);
    expect(JSON.stringify(asked!.payload)).not.toContain("Günstig"); // the variant's name never goes to the customer
  });
});
