// Admin area, slice 3 — signing links (replayed from fixtures/admin.json), the catalogue editor
// (today's AdminManager.js bodies) and "Diagnose Planung" (replaces the Hauptmenü's debug link).
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { countOf } from "../src/features/admin/PlanningDebug.js";
import { fakeServer, renderApp, type Reply } from "./helpers.js";
import fx from "./fixtures/admin.json";

type Req = { method: string; path: string; body?: unknown };
const recorded = (name: string) => (fx.scenarios.find((s) => s.name === name)!.requests as Req[]).filter((r) => r.path !== "/admin/api/config");
const ADMIN = { email: "admin@example.test", name: "AT", role: "admin" };
const USER = { email: "testnutzer@example.test", name: "TN", role: "user" };
const PRODUCTS = [{ productId: "P-1", name: "Kleber", price: 12.5, widthCm: null, lengthCm: 10, heightCm: null, source: "seed", manufacturer: "Hassmann" }];
const SERVICES = [{ serviceId: "S-1", name: "Montage", internal_name: "mont", description: "Text", price: 79.9, time: 30, source: "emc2" }];

function server(extra: Record<string, Reply> = {}, user: Record<string, unknown> = ADMIN) {
  return fakeServer({
    "GET /api/auth/me": { body: { user } },
    "GET /admin/api/config": { body: fx.config },
    "GET /admin/api/signing": { body: fx.signing },
    "GET /admin/api/signing?q=ANG": { body: fx.signing },
    "GET /admin/api/signing?q=ANG&status=sent": { body: fx.signing },
    "POST /admin/api/signing/*/send-bitrix": { body: { ok: true, sent: ["abtretung"] } },
    "GET /api/products": { body: PRODUCTS },
    "GET /api/products?q=Kle": { body: PRODUCTS },
    "POST /api/products/bulk": { body: { ok: true, result: {} } },
    "GET /api/services": { body: SERVICES },
    "POST /api/services/bulk": { body: { ok: true, result: {} } },
    ...extra,
  });
}
const own = (calls: { key: string; body: unknown }[], part: string) => calls.filter((c) => c.key.includes(part) && c.key !== "GET /admin/api/config").map((c) => {
  const [method, path] = c.key.split(" ");
  return { method, path, ...(c.body === undefined ? {} : { body: c.body }) };
});
const yes = async (label: RegExp) => fireEvent.click(within(await screen.findByTestId("admin-confirm")).getByRole("button", { name: label }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

describe("admin · Signatur-Links", () => {
  it("counters, search, status filter and 'An Bitrix senden' ask as today", async () => {
    const srv = server();
    renderApp("/admin/signatur-links");
    await screen.findByText("ANG-T-1");
    expect(screen.getByTestId("admin-stats")).toHaveTextContent("1Teilw. unterschrieben");
    expect(screen.getByRole("link", { name: "abtretung" })).toHaveAttribute("href", "/admin/api/signing/tok-1/documents/abtretung/pdf");
    expect(screen.getAllByRole("button", { name: /an Bitrix senden$/ })).toHaveLength(1); // only a link with a signed document
    fireEvent.change(screen.getByLabelText("Suche"), { target: { value: "ANG" } });
    await waitFor(() => expect(srv.count("GET /admin/api/signing?q=ANG")).toBe(1));
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "sent" } });
    await waitFor(() => expect(srv.count("GET /admin/api/signing?q=ANG&status=sent")).toBe(1));
    fireEvent.click(await screen.findByRole("button", { name: "ANG-T-1 an Bitrix senden" }));
    await yes(/^An Bitrix senden$/);
    await waitFor(() => expect(own(srv.calls, "/admin/api/")).toEqual(recorded("signing: filters and send")));
    expect(await screen.findByText("Gesendet (1)")).toBeInTheDocument();
  });
  it("cancelling sends nothing", async () => {
    const srv = server();
    renderApp("/admin/signatur-links");
    fireEvent.click(await screen.findByRole("button", { name: "ANG-T-1 an Bitrix senden" }));
    fireEvent.click(within(await screen.findByTestId("admin-confirm")).getByRole("button", { name: "Abbrechen" }));
    expect(own(srv.calls, "send-bitrix")).toEqual([]);
  });
});

describe("admin · Produkte & Leistungen", () => {
  it("product: Bearbeiten fills the form; save asks (old → new price) and sends today's body", async () => {
    const srv = server();
    renderApp("/admin/katalog");
    fireEvent.click(await screen.findByRole("button", { name: "P-1 bearbeiten" }));
    expect(screen.getByLabelText(/^Produkt-ID/)).toHaveValue("P-1");
    expect(screen.getByLabelText(/^Preis/)).toHaveValue("12,5");
    fireEvent.change(screen.getByLabelText(/^Preis/), { target: { value: "13,90" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern / Aktualisieren" }));
    expect(await screen.findByTestId("admin-confirm")).toHaveTextContent("Preis: 12,50 € → 13,90 €");
    await yes(/^Speichern$/);
    await waitFor(() => expect(own(srv.calls, "/bulk")).toEqual([{ method: "POST", path: "/api/products/bulk", body: [{ productId: "P-1", name: "Kleber", price: 13.9, lengthCm: 10, source: "seed", manufacturer: "Hassmann" }] }]));
    expect(await screen.findByText("Produkt P-1 gespeichert.")).toBeInTheDocument();
  });
  it("product: today's check of the price; search after the last key stroke", async () => {
    const srv = server();
    renderApp("/admin/katalog");
    await screen.findByText("Kleber");
    fireEvent.change(screen.getByLabelText(/^Produkt-ID/), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText(/^Bezeichnung/), { target: { value: "Neu" } });
    fireEvent.change(screen.getByLabelText(/^Preis/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern / Aktualisieren" }));
    expect(await screen.findByText("Preis ist ungültig oder 0.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Suche (Produkt-ID oder Name)"), { target: { value: "K" } });
    fireEvent.change(screen.getByLabelText("Suche (Produkt-ID oder Name)"), { target: { value: "Kle" } });
    await waitFor(() => expect(srv.count("GET /api/products?q=Kle")).toBe(1));
    expect(srv.count("GET /api/products?q=K")).toBe(0);
    expect(own(srv.calls, "/bulk")).toEqual([]);
  });
  it("service: new service with today's body", async () => {
    const srv = server();
    renderApp("/admin/katalog");
    fireEvent.click(await screen.findByRole("tab", { name: "Leistungen" }));
    await screen.findByText("Montage");
    fireEvent.change(document.getElementById("as_serviceId")!, { target: { value: "S-2" } });
    fireEvent.change(document.getElementById("as_name")!, { target: { value: "Abbau" } });
    fireEvent.change(document.getElementById("as_price")!, { target: { value: "0" } });
    fireEvent.change(document.getElementById("as_time")!, { target: { value: "15" } });
    fireEvent.click(within(screen.getByRole("tabpanel", { name: "Leistungen" })).getByRole("button", { name: "Speichern / Aktualisieren" }));
    expect(await screen.findByTestId("admin-confirm")).toHaveTextContent("(neuer Service)");
    await yes(/^Speichern$/);
    await waitFor(() => expect(own(srv.calls, "/bulk")).toEqual([{ method: "POST", path: "/api/services/bulk", body: [{ serviceId: "S-2", name: "Abbau", price: 0, time: 15 }] }]));
  });
});

describe("admin · Diagnose Planung", () => {
  it("counts what the Hauptmenü gets and shows the raw data on the page", async () => {
    server({
      "GET /api/planning/v2/today": { body: { ok: true, plan: { date: "2026-11-24", termine: [{ id: "a" }, { id: "b" }] } } },
      "GET /api/bitrix/activities/today": { body: { byDealId: { 4711: { startMinutes: 540 } } } },
      "GET /api/planning/v2/week?from=*": { body: { ok: true, days: [{ date: "2026-11-24", entries: [{ id: "a" }] }] } },
    });
    globalThis.fetch = ((orig) => (async (url: string, init?: RequestInit) => (url === "/health" ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : orig(url, init))) as typeof fetch)(globalThis.fetch);
    renderApp("/admin/planung");
    expect(await within(await screen.findByTestId("diag-today")).findByText("2 Einträge")).toBeInTheDocument();
    expect(await within(screen.getByTestId("diag-activities")).findByText("1 Einträge")).toBeInTheDocument();
    expect(await within(screen.getByTestId("diag-week")).findByText("1 Einträge")).toBeInTheDocument();
    expect(await within(screen.getByTestId("diag-health")).findByText("geladen")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("diag-today")).getByRole("button", { name: "Rohdaten anzeigen" }));
    expect(screen.getByTestId("diag-today-raw")).toHaveTextContent('"termine"');
  });
  it("counts: plan list, week days, map by deal, unknown", () => {
    expect([countOf({ plan: null }), countOf({ days: [{ entries: [1, 2] }, {}] }), countOf({ byDealId: { a: 1 } }), countOf({ ok: true }), countOf(null)]).toEqual([0, 2, 1, null, null]);
  });
  it("Hauptmenü: admins get „Diagnose Planung“ (React) instead of today's debug view; others get nothing", async () => {
    server({ "GET /api/planning/v2/today": { body: { ok: true, plan: null } } });
    const router = renderApp("/");
    const link = await screen.findByTestId("debug-link");
    expect(link).toHaveTextContent("Diagnose Planung");
    fireEvent.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/planung"));
  });
  it("Hauptmenü of a user without the admin role: no diagnosis link", async () => {
    server({ "GET /api/planning/v2/today": { body: { ok: true, plan: null } } }, USER);
    renderApp("/");
    await screen.findByText("Neues Angebot");
    expect(screen.queryByTestId("debug-link")).toBeNull();
  });
});

describe("admin · catalogue and signing are admins only", () => {
  it.each(["/admin/katalog", "/admin/signatur-links", "/admin/planung"])("%s: no request without the admin role", async (path) => {
    const srv = server({}, USER);
    renderApp(path);
    expect(await screen.findByText("Die Verwaltung ist nur für Administratoren.")).toBeInTheDocument();
    expect(srv.calls.filter((c) => c.key !== "GET /api/auth/me" && c.key !== "GET /api/version")).toEqual([]);
  });
});
