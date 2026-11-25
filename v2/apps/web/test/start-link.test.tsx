// U-075 (with U-074): the Hauptmenü opens what its address names — `?offer=<ANG number>` (the Bitrix
// offer link, sent here by the server with START_UI=react; „Versionen“) through the same path as
// „Öffnen“ with that number, `?deal=<deal number>[&step=…]` (the Bitrix deal link) as „Öffnen“ with a
// deal number. The app's login shows in place of the page and keeps the address, so the target is
// opened after the login. Only these two values are read, and only as API parameters or paths inside
// the app: a foreign or malformed target opens nothing. Made-up deals and customers only.
process.env.TZ = "Europe/Berlin";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openOfferNumber } from "../src/features/home/open.js";
import { startTarget } from "../src/features/home/rules.js";
import { BASE, NO_DRAFT, USER, fakeServer, renderApp, type Reply } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const ANG = "ANG2026-1125-101530";
const DEAL = "70051";
const HOME = { "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/offers/v2/search*": { body: { rows: [] } } };
const stored = (offerType: string): Reply => ({ body: { offer: { offerNumber: ANG, offerType, payload: { activeOffer: offerType, offerNumber: ANG, auftragId: DEAL, Kundendaten: { lastName: "Kunde" } } } } });
const LOGGED_OUT = { "GET /api/auth/me": { status: 401, body: { error: { code: "UNAUTHORIZED", message: "Unauthorized", requestId: "r" } } }, "POST /api/auth/login": { body: { token: "t", user: USER } } };
const login = async () => {
  await screen.findByRole("heading", { name: "Anmeldung" });
  await userEvent.type(screen.getByLabelText("E-Mail"), "ap@example.test");
  await userEvent.type(screen.getByLabelText("Passwort"), "geheim");
  await userEvent.click(screen.getByRole("button", { name: "Anmelden" }));
};

describe("rules", () => {
  it("reads only an ANG number or a deal number (+ step); anything else is no target", () => {
    expect(startTarget(`?offer=${ANG}`)).toEqual({ kind: "offer", number: ANG });
    expect(startTarget("?offer=ang2026-1125-101530")).toEqual({ kind: "offer", number: ANG });
    expect(startTarget(`?deal=${DEAL}`)).toEqual({ kind: "deal", id: DEAL, step: "" });
    expect(startTarget(`?deal=${DEAL}&step=Kosten`)).toEqual({ kind: "deal", id: DEAL, step: "Kosten" });
    expect(startTarget(`?deal=${DEAL}&step=..%2F..%2Fadmin`)).toEqual({ kind: "deal", id: DEAL, step: "" });
    for (const foreign of ["", "?next=https%3A%2F%2Fevil.example", "?offer=https%3A%2F%2Fevil.example%2FANG1", "?offer=%2F%2Fevil.example", "?offer=1",
      "?deal=%2F%2Fevil.example", "?deal=javascript%3Aalert(1)", "?deal=t-0123456789abcdef01234567", "?offer=x&deal=70051"]) {
      expect([foreign, startTarget(foreign)]).toEqual([foreign, null]);
    }
  });

  it("an offer of a type this app cannot edit goes to that very offer in today's UI", async () => {
    fakeServer({ ...BASE, [`GET /api/offers/${ANG}`]: stored("dusche") });
    expect(await openOfferNumber(ANG)).toEqual({ kind: "legacy", href: `/?classic=1&offer=${ANG}` });
  });
});

describe("the address of the Hauptmenü", () => {
  it("not logged in: the app's login, then the offer opens (copied into its deal's draft as „Öffnen“ does)", async () => {
    const srv = fakeServer({ ...BASE, ...HOME, ...LOGGED_OUT, [`GET /api/offers/${ANG}`]: stored("bu"), [`POST /api/deals/${DEAL}/draft/import`]: { body: { dealId: DEAL, revision: 1, changed: true } } });
    const router = renderApp(`/?offer=${ANG}`);
    await login();
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/deal/${DEAL}/bu`)));
    expect(srv.calls.filter((c) => c.key === `POST /api/deals/${DEAL}/draft/import`).map((c) => c.body)).toEqual([{ kind: "offer", offerNumber: ANG, baseRevision: 0 }]);
  });

  it("an offer that is not stored: „Angebot wurde nicht gefunden.“ on the Hauptmenü; the address is cleaned", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/offers/${ANG}`]: { status: 404, body: { error: { code: "NOT_FOUND", message: "x", requestId: "t" } } } });
    const router = renderApp(`/?offer=${ANG}`);
    expect(await screen.findByTestId("start-error")).toHaveTextContent("Angebot wurde nicht gefunden.");
    expect(router.state.location.search).toBe("");
  });

  it("deal link: opens as „Öffnen“ with the deal number — straight into its draft, on the step of the link", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: { body: { dealId: DEAL, offerType: "bu", payload: { activeOffer: "bu" }, revision: 2, updatedAt: "2026-11-24T09:00:00.000Z", variantId: "v1", variantName: "" } },
      [`GET /api/offers/v2/by-deal/${DEAL}`]: { body: { rows: [] } } });
    const router = renderApp(`/?deal=${DEAL}&step=Kosten`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/deal/${DEAL}/bu/Kosten`));
  });

  it("deal link to a deal without an offer: the message and the tiles, as „Öffnen“", async () => {
    fakeServer({ ...BASE, ...HOME, [`GET /api/deals/${DEAL}/draft`]: NO_DRAFT, [`GET /api/offers/v2/by-deal/${DEAL}`]: { body: { rows: [] } } });
    const router = renderApp(`/?deal=${DEAL}`);
    expect(await screen.findByText(`Für Auftrag ${DEAL} gibt es noch kein Angebot. Wählen Sie unten die Angebotsart.`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Badumbau/ })).toHaveAttribute("href", `/deal/${DEAL}/bu`);
    expect(router.state.location.pathname).toBe("/");
  });

  it("a foreign target opens nothing and goes nowhere", async () => {
    const srv = fakeServer({ ...BASE, ...HOME });
    const router = renderApp("/?offer=https%3A%2F%2Fevil.example%2F&deal=%2F%2Fevil.example");
    await screen.findByRole("heading", { name: "Hauptmenü" });
    await new Promise((r) => setTimeout(r, 50));
    expect(router.state.location.pathname).toBe("/");
    expect(srv.calls.filter((c) => c.key.startsWith("GET /api/offers/") || c.key.includes("/api/deals/"))).toEqual([]);
    expect(screen.queryByTestId("start-opening")).toBeNull();
  });
});
