// Header + user menu redesign (2026-11-16): initials only, offer lines, swatches, Modus.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initials } from "../src/app/Header.js";
import { dealLine, offerLine } from "../src/features/offer/HeaderOffer.js";
import { usePrefs } from "../src/shared/lib/prefs.js";
import { BASE, fakeServer, renderApp, USER } from "./helpers.js";

beforeEach(() => { localStorage.clear(); usePrefs.setState({ theme: "", mode: "light", dark: false }); document.documentElement.removeAttribute("data-theme"); });

describe("rules", () => {
  it("initials only", () => {
    expect(initials("t.raithel@example.test")).toBe("TR");
    expect(initials("ap@example.test")).toBe("AP");
  });
  it("offer line and deal line leave out empty parts", () => {
    expect(offerLine("bu", "Muster", "Max")).toBe("Badumbau · Muster, Max");
    expect(offerLine("bwt", "Muster", "")).toBe("Badewannentür · Muster");
    expect(offerLine("hl", "", "")).toBe("Handlauf");
    expect(dealLine("65462", "ANG-1")).toBe("Deal 65462 · ANG-1");
    expect(dealLine("t-0123456789abcdef01234567", "")).toBe("");
    expect(dealLine("65462", "")).toBe("Deal 65462");
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
  it("in an offer: home button, type · customer, deal line", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    expect(await screen.findByRole("link", { name: "Hauptmenü" })).toBeInTheDocument();
    expect(screen.getByTestId("header-offer")).toHaveTextContent(/^Badumbau$/);
    expect(screen.getByTestId("header-deal")).toHaveTextContent("Deal 65462");
    await userEvent.type(await screen.findByLabelText(/^Nachname/), "Muster");
    await userEvent.type(screen.getByLabelText(/^Vorname$/), "Max");
    expect(screen.getByTestId("header-offer")).toHaveTextContent("Badumbau · Muster, Max");
    expect(screen.getByRole("link", { name: "Versionen" })).toBeInTheDocument();
  });
});

describe("header room", () => {
  it("long save states are short in the pill (full text in the title), so the customer name keeps its room", async () => {
    fakeServer({ ...BASE });
    renderApp("/deal/65462/bu/Kundendaten");
    await userEvent.type(await screen.findByLabelText(/^Nachname/), "Muster-Lange-Name");
    const pill = await screen.findByTitle("Änderungen werden gleich gespeichert");
    expect(pill).toHaveTextContent(/^Speichert …$/);
    expect(screen.getByTestId("header-offer")).toHaveTextContent("Badumbau · Muster-Lange-Name");
    expect(screen.getByRole("link", { name: "Versionen" })).toHaveAttribute("title", "Versionen");
  });
  it("the logo has a light badge in dark mode", async () => {
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
    renderApp("/");
    expect((await screen.findByRole("img", { name: "EmC2" })).className).toContain("dark:bg-white");
  });
});

describe("user menu", () => {
  it("a swatch sets the theme; the multicolour one sets \"\"", async () => {
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Pflege", hidden: true }));
    expect(usePrefs.getState().theme).toBe("pflege");
    expect(document.documentElement.dataset.theme).toBe("pflege");
    expect(screen.getByRole("button", { name: "Pflege", hidden: true })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Je Angebotsart", hidden: true }));
    expect(usePrefs.getState().theme).toBe("");
  });
  it("Modus: Dunkel stores dark; System follows prefers-color-scheme", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark"), addEventListener() {}, removeEventListener() {} }));
    fakeServer({ ...BASE, "GET /api/planning/current": { body: { planning: null } } });
    renderApp("/");
    await userEvent.click(await screen.findByRole("button", { name: "Dunkel", hidden: true }));
    expect(localStorage.getItem("emc2.mode")).toBe("dark");
    expect(document.documentElement.dataset.mode).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Hell", hidden: true }));
    expect(document.documentElement.dataset.mode).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "System", hidden: true }));
    expect(localStorage.getItem("emc2.mode")).toBeNull();
    expect(document.documentElement.dataset.mode).toBe("dark"); // the system says dark
    vi.unstubAllGlobals();
  });
});
