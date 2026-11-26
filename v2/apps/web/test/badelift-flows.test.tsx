// Variants (ADR 027 A) and „Weiteres Angebot“ (ADR 027 B) are type-independent; these two check
// that they work for a Badelift offer too (stubbed as in varianten.test.tsx / zweitangebot.test.tsx).
import { CREATION_ID_RE } from "@oc/api-contract";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT as SECOND } from "../src/features/offer/model/second-offer.js";
import { TEXT } from "../src/features/offer/model/variants.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

process.env.TZ = "Europe/Berlin";
type Obj = Record<string, any>;
const DEAL = "4711", NEW = "5001", V1 = "v1", V3 = "v-abcdefabcdef", at = "2026-11-20T09:00:00.000Z";
const S = () => useOfferStore.getState();
const BL = { quickAdd: [{ kind: "bl-item", group: "Badelift", label: "Juwel Tuchlift Premium", productId: "BRS-912", qty: 1 }, { kind: "bl-item", group: "Badelift", label: "Gleittuch", productId: "BRS-909", qty: 1 }], blNote: "", sketch: { json: "", dataUrl: "" } };
const draftOf = (type: string, variantId = V1, variantName = "Variante 1", revision = 3, dealId = DEAL): Reply =>
  ({ body: { dealId, offerType: type, payload: { activeOffer: type, Kundendaten: { firstName: "Erika", lastName: "Muster", city: "Hof" }, ...(type === "bl" ? { bl: BL } : {}) }, revision, updatedAt: at, variantId, variantName } });
const row = (variantId: string, name: string, type: string, more: Obj = {}): Obj => ({
  variantId, name, offerType: type, offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null,
  revision: 3, updatedAt: at, notChosenAt: null, isDefault: false, ...more,
});
const list = (type: string, ...variants: Obj[]): Reply => ({ body: { dealId: DEAL, defaultVariantId: variants.find((v) => v.isDefault)?.variantId ?? variants[0]?.variantId ?? null, variants: variants.map((v) => ({ ...v, offerType: type })) } });

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(new Proxy({}, { get: (_t, n) => (typeof n === "string" ? () => {} : undefined), set: () => true }) as never); // the sketch pad (no canvas here)
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("a Badelift offer gets a variant: the open one is saved, then copied; the new variant opens on the Badelift step", async () => {
  let created: Obj | null = null;
  const s = fakeServer({ ...BASE, [`GET /api/deals/${DEAL}/draft?variant=${V1}`]: draftOf("bl"), [`GET /api/deals/${DEAL}/draft?variant=${V3}`]: draftOf("bl", V3, "Mit Akku", 5),
    [`GET /api/deals/${DEAL}/variants`]: list("bl", row(V1, "Variante 1", "bl", { isDefault: true })), [`GET /api/deals/${DEAL}/related`]: { body: { dealId: DEAL, related: [] } },
    [`PUT /api/deals/${DEAL}/draft?variant=${V1}`]: { body: { dealId: DEAL, revision: 4, changed: true } },
    [`POST /api/deals/${DEAL}/variants`]: (b) => { created = b as Obj; return { body: { dealId: DEAL, variant: row(V3, "Mit Akku", "bl", { isDefault: true }), revision: 5 } }; } });
  usePrefs.getState().setAutosave(false);
  const router = renderApp(`/deal/${DEAL}/bl/bl?variante=${V1}`);
  await screen.findByTestId("bl-step");
  await userEvent.click(within(screen.getAllByTestId("bl-card").find((c) => c.dataset.id === "BRS-802")!).getByRole("checkbox"));
  await userEvent.click(await screen.findByTestId("variant-switch"));
  const panel = await screen.findByTestId("variant-panel");
  await userEvent.click(within(panel).getByRole("button", { name: "Variante erstellen" }));
  const name = within(panel).getByLabelText(TEXT.name);
  await userEvent.clear(name); await userEvent.type(name, "Mit Akku");
  await userEvent.click(within(panel).getByRole("button", { name: "Variante erstellen" }));
  await waitFor(() => expect(router.state.location.search).toBe(`?variante=${V3}`));
  expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bl/bl`);
  expect(created).toEqual({ from: V1, name: "Mit Akku" });
  const put = s.calls.find((c) => c.key === `PUT /api/deals/${DEAL}/draft?variant=${V1}`)!;
  expect((put.body as Obj).payload.bl.quickAdd.map((q: Obj) => q.productId)).toEqual(["BRS-912", "BRS-909", "BRS-802"]);
  const keys = s.calls.map((c) => c.key);
  expect(keys.indexOf(`PUT /api/deals/${DEAL}/draft?variant=${V1}`)).toBeLessThan(keys.indexOf(`POST /api/deals/${DEAL}/variants`));
  await waitFor(() => expect(S().variantId).toBe(V3));
  await screen.findByTestId("bl-step");
});

it("„Weiteres Angebot“ can make a Badelift: one request with offerType bl, the new deal opens on Kundendaten of a Badelift", async () => {
  usePrefs.getState().setAutosave(false);
  const POST = `POST /api/deals/${DEAL}/second-offer`;
  const s = fakeServer({
    ...BASE, [`GET /api/deals/${DEAL}/draft?variant=v1`]: draftOf("bu"), [`GET /api/deals/${DEAL}/draft`]: draftOf("bu"),
    [`GET /api/deals/${DEAL}/variants`]: list("bu", row("v1", "Variante 1", "bu", { isDefault: true })), [`GET /api/deals/${DEAL}/related`]: { body: { dealId: DEAL, related: [] } },
    [`PUT /api/deals/${DEAL}/draft?variant=v1`]: { body: { dealId: DEAL, revision: 4, changed: true } },
    [`GET /api/deals/${NEW}/draft`]: draftOf("bl", "v1", "Variante 1", 1, NEW), [`GET /api/deals/${NEW}/draft?variant=v1`]: draftOf("bl", "v1", "Variante 1", 1, NEW),
    [POST]: (b) => ({ body: { ok: true, creationId: (b as Obj).creationId, sourceDealId: DEAL, sourceVariantId: "v1", dealId: NEW, offerType: "bl", variantId: "v1", revision: 1, comments: "ok", repeated: false } }),
  });
  const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
  await userEvent.click(await screen.findByTestId("variant-switch"));
  await userEvent.click(within(await screen.findByTestId("related-section")).getByRole("button", { name: SECOND.button }));
  const dialog = await screen.findByTestId("second-offer-dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Badelift" }));
  await userEvent.click(screen.getByTestId("second-offer-dialog").querySelector<HTMLElement>('[data-way="new-deal"]')!); // ADR 030: „Als neuer Deal“
  await act(async () => { await userEvent.click(within(screen.getByTestId("second-offer-dialog")).getByRole("button", { name: SECOND.yes })); });
  await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/bl/Kundendaten`));
  const posts = s.calls.filter((c) => c.key === POST).map((c) => c.body);
  expect(posts).toEqual([{ offerType: "bl", creationId: expect.stringMatching(CREATION_ID_RE), variantId: "v1" }]);
  await waitFor(() => expect(S().dealId).toBe(NEW));
  expect(S().offer?.activeOffer).toBe("bl");
});
