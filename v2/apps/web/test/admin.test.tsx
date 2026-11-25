// Admin area, slice 1 — settings and users. Replays the recordings of today's admin panel
// (fixtures/admin.json, v2/scripts/capture-admin.cjs): every change sends the same request with the
// same body as today; the confirmations of the React app (U-065) are answered with "yes".
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsDraft } from "../src/features/admin/settings-store.js";
import { changeCount, formatValue, parseInput, productBody, saveLabel, selfLockout, serviceBody, userBody, EMPTY_USER } from "../src/features/admin/rules.js";
import { fakeServer, renderApp, type Reply } from "./helpers.js";
import fx from "./fixtures/admin.json";

type Req = { method: string; path: string; body?: unknown };
type Scenario = { name: string; acts: [string, string, string?][]; fail?: string; requests: Req[]; alerts: string[]; view: Record<string, unknown> };
const SCENARIOS = fx.scenarios as unknown as Scenario[];
const ADMIN = { email: "admin@example.test", name: "AT", role: "admin" };
const err = (message: string, status = 400): Reply => ({ status, body: { error: { code: "BAD_REQUEST", message, requestId: "t" } } });

/** the answers today's panel got while recording, in the v2 envelope */
function server(extra: Record<string, Reply> = {}, user: Record<string, unknown> = ADMIN) {
  return fakeServer({
    "GET /api/auth/me": { body: { user } },
    "GET /admin/api/config": { body: fx.config },
    "PUT /admin/api/config": { body: { ok: true, updated: 1 } },
    "POST /admin/api/config/reset": { body: { ok: true, key: "LABOR_RATE_KK", value: 69.5 } },
    "GET /admin/api/users": { body: fx.users },
    "POST /admin/api/users": { body: { ok: true, email: "neu@example.test" } },
    "POST /admin/api/users/*/signature": { body: { ok: true, hasSignature: true } },
    ...extra,
  });
}
const writes = (calls: { key: string; body: unknown }[]) => calls.filter((c) => !c.key.startsWith("GET ")).map((c) => {
  const [method, path] = c.key.split(" ");
  return { method, path, ...(c.body === undefined ? {} : { body: c.body }) };
});
const recordedWrites = (s: Scenario) => s.requests.filter((r) => r.method !== "GET");

beforeEach(() => {
  useSettingsDraft.getState().clear();
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

const SECTION_LABEL: Record<string, string> = { shared: "Allgemein", bwt: "BWT – Badewannentür", bu: "BU – Badumbau", zuschuss: "Zuschüsse & Boni" };
const confirm = async (label: RegExp) => {
  const dlg = await screen.findByTestId("admin-confirm");
  fireEvent.click(within(dlg).getByRole("button", { name: label }));
  await waitFor(() => expect(screen.queryByTestId("admin-confirm")).toBeNull());
};

/** today's acts on the React page */
async function play(acts: Scenario["acts"]) {
  for (const [kind, sel, val] of acts) {
    if (kind === "fill") {
      const el = document.getElementById(sel.replace(/^#/, ""));
      if (!el) throw new Error(`no field ${sel}`);
      fireEvent.change(el, { target: { value: val } });
    } else if (kind === "click" && sel === "#save-btn") {
      fireEvent.click(screen.getByRole("button", { name: /^Speichern/ }));
      await confirm(/^Speichern/);
    } else if (kind === "click" && sel === "#u-save") {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
      if (await screen.findByTestId("admin-confirm").catch(() => null)) await confirm(/^Speichern$/);
    } else if (kind === "click" && sel.startsWith("#reset-")) {
      const key = sel.slice("#reset-".length);
      const item = fx.config.find((c) => c.key === key)!;
      fireEvent.click(screen.getByRole("button", { name: `${item.label} auf Standardwert zurücksetzen` }));
      await confirm(/^Zurücksetzen$/);
    } else if (kind === "click" && sel.startsWith("#field-")) {
      fireEvent.click(document.getElementById(sel.slice(1))!);
    } else if (kind === "nav") {
      fireEvent.click(screen.getByRole("link", { name: sel === "users" ? "Benutzer" : new RegExp(`^${SECTION_LABEL[sel]}`) }));
      await screen.findByRole("heading", { level: 2, name: sel === "users" ? "Benutzer" : SECTION_LABEL[sel] });
      if (sel === "users") await screen.findByTestId("user-testnutzer@example.test");
      else await screen.findByTestId(`card-${fx.config.find((c) => c.section === sel)!.key}`);
    } else if (kind === "select") {
      fireEvent.change(document.getElementById(sel.slice(1))!, { target: { value: val } });
    } else if (kind === "file") {
      const bytes = Uint8Array.from(atob(fx.png.split(",")[1]!), (c) => c.charCodeAt(0));
      fireEvent.change(screen.getByLabelText("Unterschrift für testnutzer@example.test hochladen"), { target: { files: [new File([bytes], "u.png", { type: "image/png" })] } });
      await confirm(/^Hochladen$/);
    } else throw new Error(`act not handled: ${kind} ${sel}`);
  }
}

describe("admin · rules (today's handleInput)", () => {
  it("numbers, lists, JSON, switches", () => {
    const num = { type: "euro", value: 72 };
    expect(parseInput(num, "74.5")).toEqual({ kind: "change", value: 74.5 });
    expect(parseInput(num, "74,5")).toEqual({ kind: "change", value: 74.5 }); // U-065: comma as decimal point
    expect(parseInput(num, "72")).toEqual({ kind: "same" });
    expect(parseInput(num, "")).toEqual({ kind: "same" });
    expect(parseInput({ type: "integer", value: 15 }, "12.7")).toEqual({ kind: "change", value: 12 });
    expect(parseInput({ type: "text-list", value: ["HG-1"] }, "HG-1\nHG-2, HG-3\n\n")).toEqual({ kind: "change", value: ["HG-1", "HG-2", "HG-3"] });
    expect(parseInput({ type: "json", value: { a: 1 } }, "{ a: ")).toEqual({ kind: "invalid" });
    expect(parseInput({ type: "json", value: { a: 1 } }, '{"a":1}')).toEqual({ kind: "same" });
    expect(parseInput({ type: "boolean", value: false }, true)).toEqual({ kind: "change", value: true });
    expect([formatValue(0.19, "percent"), formatValue(1 / 3, "euro"), formatValue(true, "boolean"), formatValue(["a"], "text-list")]).toEqual(["0.19", "0.3333", "Aktiv", "[1 Einträge]"]);
    expect([changeCount(0), changeCount(1), changeCount(2), saveLabel(0), saveLabel(3)]).toEqual(["", "1 Änderung", "2 Änderungen", "Speichern", "Speichern (3)"]);
  });
  it("users: today's body, e-mail required, no own lock-out", () => {
    expect(userBody({ ...EMPTY_USER, firstName: " Neu ", email: "neu@example.test ", password: " p " })).toEqual({ body: { firstName: "Neu", lastName: "", email: "neu@example.test", password: " p ", role: "user" } });
    expect(userBody({ ...EMPTY_USER, email: "x@example.test", active: false })).toEqual({ body: { firstName: "", lastName: "", email: "x@example.test", password: "", role: "user", active: false } });
    expect(userBody(EMPTY_USER)).toEqual({ error: "E-Mail erforderlich" });
    expect(selfLockout({ ...EMPTY_USER, email: "Admin@example.test", role: "user" }, "admin@example.test")).toMatch(/Admin-Rolle/);
    expect(selfLockout({ ...EMPTY_USER, email: "admin@example.test", role: "admin", active: false }, "admin@example.test")).toMatch(/deaktivieren/);
    expect(selfLockout({ ...EMPTY_USER, email: "other@example.test", role: "user" }, "admin@example.test")).toBe("");
  });
  it("catalogue: today's checks and bodies", () => {
    const p = { productId: " P1 ", name: "Kleber", price: "1.234,50", widthCm: "", lengthCm: "12,5", heightCm: "", source: "", manufacturer: "" };
    expect(productBody(p)).toEqual({ body: { productId: "P1", name: "Kleber", price: 1234.5, lengthCm: 12.5, manufacturer: null } });
    expect(productBody({ ...p, price: "0" })).toEqual({ error: "Preis ist ungültig oder 0." });
    expect(productBody({ ...p, name: "" })).toEqual({ error: "Bitte mindestens Produkt-ID, Name und Preis ausfüllen." });
    const s = { serviceId: "S1", name: "Montage", internal_name: "", description: " Text ", price: "79,90", time: "30", source: "emc2" };
    expect(serviceBody(s)).toEqual({ body: { serviceId: "S1", name: "Montage", price: 79.9, time: 30, description: "Text", source: "emc2" } });
    expect(serviceBody({ ...s, time: "" })).toEqual({ error: "Bitte mindestens Service-ID, Name, Preis und Zeit (Minuten) ausfüllen." });
    expect(serviceBody({ ...s, time: "-1" })).toEqual({ error: "Zeit ist ungültig." });
  });
});

describe("admin · settings replay (today's requests)", () => {
  it.each(SCENARIOS.filter((s) => s.name.startsWith("settings:")).map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const srv = server(s.fail ? { [s.fail]: err("Abgelehnt (Test)") } : {});
    renderApp("/admin");
    await screen.findByTestId("card-TAX_RATE");
    await play(s.acts);
    await waitFor(() => expect(writes(srv.calls)).toEqual(recordedWrites(s)));
    expect(srv.count("GET /admin/api/config")).toBeGreaterThanOrEqual(1);
    const v = s.view as { changeCount: string; saveLabel: string; changedCards: string[]; errorFields: string[]; status: string };
    expect(screen.queryByTestId("change-count")?.textContent ?? "").toBe(v.changeCount);
    expect(screen.getByRole("button", { name: /^Speichern/ })).toHaveTextContent(v.saveLabel);
    expect([...document.querySelectorAll('[data-changed="true"]')].map((c) => c.getAttribute("data-testid")!.replace("card-", ""))).toEqual(v.changedCards);
    expect([...document.querySelectorAll('[aria-invalid="true"]')].map((c) => c.id.replace("field-", ""))).toEqual(v.errorFields);
    if (v.status) expect(await screen.findByText(v.status)).toBeInTheDocument();
  });

  it("the confirmation lists old → new; cancelling sends nothing", async () => {
    const srv = server();
    renderApp("/admin/einstellungen/shared");
    fireEvent.change(await screen.findByLabelText("Stundensatz Kassenkunde"), { target: { value: "74,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern (1)" }));
    expect(await screen.findByTestId("change-lines")).toHaveTextContent("Stundensatz Kassenkunde: 72 €/h → 74.5 €/h");
    fireEvent.click(within(screen.getByTestId("admin-confirm")).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByTestId("admin-confirm")).toBeNull());
    expect(writes(srv.calls)).toEqual([]);
    expect(screen.getByTestId("change-count")).toHaveTextContent("1 Änderung");
  });

  it("changes stay while switching sections; the section shows a badge", async () => {
    server();
    renderApp("/admin/einstellungen/shared");
    fireEvent.change(await screen.findByLabelText("Rundung"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("link", { name: /^BWT/ }));
    await screen.findByTestId("card-BWT_KM_FREE");
    expect(screen.getByRole("link", { name: /^Allgemein/ })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("link", { name: /^Allgemein/ }));
    expect(await screen.findByLabelText("Rundung")).toHaveValue("20");
  });
});

describe("admin · users replay (today's requests)", () => {
  it.each(SCENARIOS.filter((s) => s.name.startsWith("users:")).map((s) => [s.name, s] as const))("%s", async (_n, s) => {
    const srv = server(s.fail ? { [s.fail]: err("Abgelehnt (Test)") } : {});
    renderApp("/admin");
    await screen.findByTestId("card-TAX_RATE");
    await play(s.acts);
    await waitFor(() => expect(writes(srv.calls)).toEqual(recordedWrites(s)));
    const v = s.view as { userMsg: string; userForm: string[] };
    if (v.userMsg) expect(await screen.findByText(v.userMsg)).toBeInTheDocument();
    expect(["u-first", "u-last", "u-email", "u-pass"].map((id) => (document.getElementById(id) as HTMLInputElement).value)).toEqual(v.userForm);
    expect(screen.getByTestId("admin-users")).not.toHaveTextContent(/passwordHash|\$2[aby]\$|scrypt/);
  });

  it("Bearbeiten keeps the stored names and role; a role change and a new password are named", async () => {
    const srv = server();
    renderApp("/admin/benutzer");
    fireEvent.click(await screen.findByRole("button", { name: "testnutzer@example.test bearbeiten" }));
    expect(screen.getByLabelText("Vorname")).toHaveValue("Test");
    expect(screen.getByLabelText("E-Mail")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("Passwort (neu/ändern)"), { target: { value: "neu-456" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    const lines = await screen.findByTestId("user-change-lines");
    expect(lines).toHaveTextContent("Rolle: Benutzer → Admin");
    expect(lines).toHaveTextContent("Passwort wird neu gesetzt");
    await confirm(/^Speichern$/);
    await waitFor(() => expect(writes(srv.calls)).toEqual([{ method: "POST", path: "/admin/api/users", body: { firstName: "Test", lastName: "Nutzer", email: "testnutzer@example.test", password: "neu-456", role: "admin" } }]));
    expect(screen.getByLabelText("Passwort (neu/ändern)")).toHaveValue("");
  });

  it("deactivating sends active: false after the question", async () => {
    const srv = server();
    renderApp("/admin/benutzer");
    fireEvent.click(await screen.findByRole("button", { name: "testnutzer@example.test bearbeiten" }));
    fireEvent.click(screen.getByRole("switch", { name: "Konto aktiv" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByTestId("user-change-lines")).toHaveTextContent("Konto wird deaktiviert");
    await confirm(/^Speichern$/);
    await waitFor(() => expect(writes(srv.calls)[0]?.body).toEqual({ firstName: "Test", lastName: "Nutzer", email: "testnutzer@example.test", password: "", role: "user", active: false }));
  });

  it("an admin cannot demote or deactivate the own account", async () => {
    const srv = server();
    renderApp("/admin/benutzer");
    fireEvent.click(await screen.findByRole("button", { name: "admin@example.test bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Rolle"), { target: { value: "user" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(await screen.findByText("Sie können sich die eigene Admin-Rolle nicht entziehen.")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-confirm")).toBeNull();
    expect(writes(srv.calls)).toEqual([]);
  });
});

describe("admin · users: the server's own lock-out check (U-070)", () => {
  it("a save the server refuses shows the server's message, the form stays", async () => {
    server({ "POST /admin/api/users": err("Das ist nicht möglich: Es muss mindestens ein aktiver Admin bleiben.", 409) });
    renderApp("/admin/benutzer");
    fireEvent.click(await screen.findByRole("button", { name: "testnutzer@example.test bearbeiten" }));
    fireEvent.click(screen.getByRole("switch", { name: "Konto aktiv" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await confirm(/^Speichern$/);
    expect(await screen.findByText("Das ist nicht möglich: Es muss mindestens ein aktiver Admin bleiben.")).toBeInTheDocument();
    expect(screen.getByLabelText("Vorname")).toHaveValue("Test");
  });
});

describe("admin · who sees it", () => {
  it("a user without the admin role: no menu entry, /admin shows no data and asks nothing", async () => {
    const srv = server({ "GET /api/planning/v2/today": { body: { ok: true, plan: null } } }, { email: "testnutzer@example.test", name: "TN", role: "user" });
    renderApp("/admin/benutzer");
    expect(await screen.findByText("Die Verwaltung ist nur für Administratoren.")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav")).toBeNull();
    expect(screen.queryByTestId("menu-admin")).toBeNull();
    expect(srv.calls.filter((c) => c.key.includes("/admin/api/"))).toEqual([]);
  });
  it("an admin finds „Verwaltung“ in the user menu", async () => {
    server({ "GET /api/planning/v2/today": { body: { ok: true, plan: null } }, "GET /api/version": { body: { buildId: "t" } } });
    const router = renderApp("/");
    fireEvent.click(await screen.findByTestId("menu-admin"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/admin/einstellungen/shared"));
    expect(await screen.findByTestId("card-TAX_RATE")).toBeInTheDocument();
  });
  it("the server's 403 is shown as it is (role checked on the server, not only here)", async () => {
    server({ "GET /admin/api/config": err("Admin-Zugriff erforderlich", 403), "GET /admin/api/users": err("Admin-Zugriff erforderlich", 403) });
    renderApp("/admin/benutzer");
    expect((await screen.findAllByText("Admin-Zugriff erforderlich")).length).toBeGreaterThan(0);
  });
});
