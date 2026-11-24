// Header + user menu redesign (2026-11-16): initials only, offer lines, swatches, Modus.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initials } from "../src/app/Header.js";
import { dealLine, offerLine } from "../src/features/offer/HeaderOffer.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { BASE, fakeServer, renderApp, USER } from "./helpers.js";

beforeEach(() => { localStorage.clear(); usePrefs.setState({ theme: "", mode: "light", dark: false }); document.documentElement.removeAttribute("data-theme"); });

describe("rules", () => {
  it("initials only", () => {
    expect(initials("m.muster@example.test")).toBe("MM");
    expect(initials("ap@example.test")).toBe("AP");
  });
  it("offer line and deal line leave out empty parts", () => {
    expect(offerLine("bu", "Muster", "Max")).toBe("Muster, Max");
    expect(offerLine("bwt", "Muster", "")).toBe("Muster");
    expect(offerLine("hl", "", "")).toBe("Handlauf");
    expect(dealLine("bu", "Muster", "Max", "65462", "ANG-1")).toBe("Badumbau · Deal 65462 · ANG-1");
    expect(dealLine("bu", "Muster", "", "t-0123456789abcdef01234567", "")).toBe("Badumbau");
    expect(dealLine("bu", "", "", "65462", "")).toBe("Deal 65462");
  });
});

describe("header", () => {
  it("Hauptmenü: brand + status pill + avatar with initials, never the name", async () => {
    fakeServer({ ...BASE, "GET /api/auth/me": { body: { user: { ...USER, name: "Anna Planer" } } }, "GET /api/planning/current": { body: { planning: null } }, "GET /api/version": { body: { buildId: "abc123" } } });
    renderApp("/");
    expect(await screen.findByText("Alles gespeichert")).toBeInTheDocument();
    expect(screen.getByText("Angebotskonfigurator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Benutzermenü öffnen: AP" })).toHaveTextContent("AP");
    expect(screen.queryByText(/Anna Planer/)).toBeNull();
    await waitFor(() => expect(screen.getByText("Version abc123 · v2")).toBeInTheDocument());
  });
  it("in an offer: burger, customer on line 1, type · deal on line 2", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    expect(await screen.findByRole("button", { name: "Schritte öffnen" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("header-offer")).toHaveTextContent(/^Badumbau$/);
    expect(screen.getByTestId("header-deal")).toHaveTextContent("Deal 65462");
    await userEvent.type(await screen.findByLabelText(/^Nachname/), "Muster");
    await userEvent.type(screen.getByLabelText(/^Vorname$/), "Max");
    expect(screen.getByTestId("header-offer")).toHaveTextContent(/^Muster, Max$/);
    expect(screen.getByTestId("header-deal")).toHaveTextContent("Badumbau · Deal 65462");
    expect(screen.getByRole("button", { name: "Versionen" })).toBeInTheDocument();
  });
  it("in an offer that is saved the pill is there (icon, full text in title)", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    expect(await screen.findByTitle("Alles gespeichert")).toBeInTheDocument();
  });
});

describe("step drawer and step bar", () => {
  beforeEach(() => { // jsdom has no showModal/close: the component falls back to the open attribute
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  });
  it("burger opens it, Hauptmenü row present, choosing a step closes it and navigates", async () => {
    fakeServer({ ...BASE });
    const router = renderApp("/deal/65462/bu/Kundendaten");
    await userEvent.click(await screen.findByRole("button", { name: "Schritte öffnen" }));
    const drawer = await screen.findByRole("dialog", { name: "Schritte" });
    expect(screen.getByRole("button", { name: "Schritte öffnen" })).toHaveAttribute("aria-expanded", "true");
    expect(within(drawer).getByRole("button", { name: "Hauptmenü" })).toBeInTheDocument();
    expect(within(drawer).getByRole("link", { name: /^Kundendaten/ })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(drawer).getByRole("link", { name: /^Arbeitszeit/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Schritte" })).toBeNull());
    expect(router.state.location.pathname).toBe("/deal/65462/bu/Arbeitszeit");
  });
  it("the X and the backdrop close it", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    await userEvent.click(await screen.findByRole("button", { name: "Schritte öffnen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Schritte schließen" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Schritte schließen" })).toBeNull());
    await userEvent.click(screen.getByRole("button", { name: "Schritte öffnen" }));
    await userEvent.click(await screen.findByRole("dialog", { name: "Schritte" })); // the dialog itself = the backdrop
    await waitFor(() => expect(screen.queryByRole("button", { name: "Schritte schließen" })).toBeNull());
  });
  it("‹ › move through the steps", async () => {
    fakeServer({ ...BASE });
    const router = renderApp("/deal/65462/bl/Kundendaten");
    await userEvent.click(within(await screen.findByRole("group", { name: "Anrede" })).getByLabelText("Frau"));
    await userEvent.type(screen.getByLabelText(/^Vorname$/), "Max");
    await userEvent.type(screen.getByLabelText(/^Nachname/), "Muster");
    await userEvent.click(await screen.findByRole("link", { name: "Nächster Schritt" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/deal/65462/bl/Arbeitszeit"));
    await userEvent.click(await screen.findByRole("link", { name: "Vorheriger Schritt" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/deal/65462/bl/Kundendaten"));
  });
});

describe("header room", () => {
  it("long save states are short in the pill (full text in the title), so the customer name keeps its room", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    await userEvent.type(await screen.findByLabelText(/^Nachname/), "Muster-Lange-Name");
    const pill = await screen.findByTitle("Änderungen werden gleich gespeichert");
    expect(pill).toHaveTextContent(/^Speichert …$/);
    expect(screen.getByTestId("header-offer")).toHaveTextContent("Muster-Lange-Name");
    expect(screen.getByRole("button", { name: "Versionen" })).toHaveAttribute("title", "Versionen");
  });
  it("the logo sits on a light tile (readable in dark mode too)", async () => {
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
    renderApp("/");
    expect((await screen.findByTestId("logo-tile")).className).toContain("bg-white");
    expect(screen.getByText("EmC² · Hauptmenü")).toBeInTheDocument();
  });
});
