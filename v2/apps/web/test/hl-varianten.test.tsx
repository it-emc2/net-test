// Handlauf with variants (ADR 027 A) and as a second offer type (ADR 027 B): one test each — the
// configurator follows the variant that is open, and a Handlauf can be created for the customer of
// another deal. Server stubbed as in varianten.test.tsx / zweitangebot.test.tsx.
import { CREATION_ID_RE } from "@oc/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { TEXT } from "../src/features/offer/model/second-offer.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { toast } from "../src/shared/ui/toaster.js";
import konf from "./fixtures/hl-konfigurator.json" with { type: "json" };
import old from "./fixtures/hl-old-offers.json" with { type: "json" };
import { BASE, fakeServer, renderApp, type Reply } from "./helpers.js";

type Obj = Record<string, any>;
const DEAL = "4711", V1 = "v1", V2 = "v-0123456789ab", NEW = "5001", at = "2026-11-20T09:00:00.000Z";
const OFFERS = old.offers as Record<string, { payload: Obj }>;
const S = () => useOfferStore.getState();
const draftOf = (variantId: string, variantName: string, payload: Obj, type = "hl", dealId = DEAL): Reply => ({ body: { dealId, offerType: type, payload, revision: 3, updatedAt: at, variantId, variantName } });
const row = (variantId: string, name: string, more: Obj = {}): Obj => ({ variantId, name, offerType: "hl", offerNumber: "", status: "draft", sentAt: null, sentChannel: null, signedAt: null, total: null, revision: 3, updatedAt: at, notChosenAt: null, isDefault: false, ...more });
const PRODUCTS = { "GET /api/products?source=flexofit&limit=500": { body: konf.products } };

beforeEach(() => {
  localStorage.clear(); usePrefs.getState().setAutosave(true);
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  for (const k of ["error", "success", "info", "warning"] as const) vi.spyOn(toast, k);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Handlauf — variants and second offer type", () => {
  it("variants: switching on „Handläufe“ shows the other variant's configurations (nothing of the first one is kept)", async () => {
    const a = structuredClone(OFFERS["drafts-hl-KK-bdd82d"]!.payload), b = structuredClone(OFFERS["offers-hl-KK-e04d66"]!.payload);
    b.hl.hlConfigurator.state = b.hl.hlConfigurator.state.map((c: Obj, i: number) => ({ ...c, name: `Günstig ${i + 1}` }));
    const namesA = (a.hl.hlConfigurator.state as Obj[]).map((c) => c.name), namesB = (b.hl.hlConfigurator.state as Obj[]).map((c) => c.name);
    fakeServer({ ...BASE, ...PRODUCTS, [`GET /api/deals/${DEAL}/draft?variant=${V1}`]: draftOf(V1, "Variante 1", a), [`GET /api/deals/${DEAL}/draft?variant=${V2}`]: draftOf(V2, "Günstig", b),
      [`GET /api/deals/${DEAL}/variants`]: { body: { dealId: DEAL, defaultVariantId: V1, variants: [row(V1, "Variante 1", { isDefault: true }), row(V2, "Günstig")] } },
      [`PUT /api/deals/${DEAL}/draft?variant=${V1}`]: { body: { dealId: DEAL, revision: 4, changed: true } } });
    const router = renderApp(`/deal/${DEAL}/hl/hlk?variante=${V1}`);
    const rail = await screen.findByTestId("hl-rail");
    await waitFor(() => expect(within(rail).getByText(namesA[0]!)).toBeTruthy());
    await userEvent.click(await screen.findByTestId("variant-switch"));
    const panel = await screen.findByTestId("variant-panel");
    await waitFor(() => expect(within(panel).getAllByTestId("variant-row")).toHaveLength(2));
    await userEvent.click(within(within(panel).getAllByTestId("variant-row")[1]!).getAllByRole("button")[0]!);
    await waitFor(() => expect(router.state.location.search).toBe(`?variante=${V2}`));
    expect(router.state.location.pathname).toBe(`/deal/${DEAL}/hl/hlk`);
    await waitFor(() => expect(within(screen.getByTestId("hl-rail")).getByText(namesB[0]!)).toBeTruthy());
    expect(within(screen.getByTestId("hl-rail")).queryByText(namesA[0]!)).toBeNull();
    expect(S().offer!.hl).toEqual(b.hl); // opened, not changed
  });

  it("second offer type: from a Badumbau deal a Handlauf is created and opens on Kundendaten", async () => {
    usePrefs.getState().setAutosave(false);
    const bu = { activeOffer: "bu", Kundendaten: { firstName: "Erika", lastName: "Muster", city: "Hof" } };
    const POST = `POST /api/deals/${DEAL}/second-offer`;
    const s = fakeServer({ ...BASE, [`GET /api/deals/${DEAL}/draft?variant=v1`]: draftOf("v1", "Variante 1", bu, "bu"), [`GET /api/deals/${DEAL}/draft`]: draftOf("v1", "Variante 1", bu, "bu"),
      [`GET /api/deals/${DEAL}/variants`]: { body: { dealId: DEAL, defaultVariantId: "v1", variants: [row("v1", "Variante 1", { offerType: "bu", isDefault: true })] } }, [`GET /api/deals/${DEAL}/related`]: { body: { dealId: DEAL, related: [] } },
      [`PUT /api/deals/${DEAL}/draft?variant=v1`]: { body: { dealId: DEAL, revision: 4, changed: true } },
      [`GET /api/deals/${NEW}/draft`]: draftOf("v1", "Variante 1", { activeOffer: "hl" }, "hl", NEW), [`GET /api/deals/${NEW}/draft?variant=v1`]: draftOf("v1", "Variante 1", { activeOffer: "hl" }, "hl", NEW),
      [POST]: (body) => ({ body: { ok: true, creationId: (body as Obj).creationId, sourceDealId: DEAL, sourceVariantId: "v1", dealId: NEW, offerType: "hl", variantId: "v1", revision: 1, comments: "ok", repeated: false } }) });
    const router = renderApp(`/deal/${DEAL}/bu/Kundendaten?variante=v1`);
    await userEvent.click(await screen.findByTestId("variant-switch"));
    await userEvent.click(within(await screen.findByTestId("related-section")).getByRole("button", { name: TEXT.button }));
    const dialog = await screen.findByTestId("second-offer-dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Handlauf" }));
    await userEvent.click(screen.getByTestId("second-offer-dialog").querySelector<HTMLElement>('[data-way="new-deal"]')!); // ADR 030: „Als neuer Deal“
    await userEvent.click(within(screen.getByTestId("second-offer-dialog")).getByRole("button", { name: TEXT.yes }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${NEW}/hl/Kundendaten`));
    const posts = s.calls.filter((c) => c.key === POST).map((c) => c.body as Obj);
    expect(posts).toEqual([{ offerType: "hl", creationId: expect.stringMatching(CREATION_ID_RE), variantId: "v1" }]);
    await waitFor(() => expect(S().dealId).toBe(NEW));
  });
});
