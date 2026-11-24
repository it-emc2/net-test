// Admin area, slice 2 — logs and statistics (check level Light, plus the one action "Erneut senden").
// Same requests as today's panel (fixtures/admin.json), today's columns and texts.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fmtDur, fmtMs, pdfSummary, queryOf, sortPdfRows } from "../src/features/admin/rules.js";
import { fakeServer, renderApp, type Reply } from "./helpers.js";
import fx from "./fixtures/admin.json";

type Req = { method: string; path: string; body?: unknown };
const scenario = (name: string) => fx.scenarios.find((s) => s.name === name)! as unknown as { requests: Req[]; view: { rows: string[] } };
const ADMIN = { email: "admin@example.test", name: "AT", role: "admin" };
const err = (message: string, status = 500): Reply => ({ status, body: { error: { code: "BITRIX_ERROR", message, requestId: "t" } } });

function server(extra: Record<string, Reply> = {}, user: Record<string, unknown> = ADMIN) {
  return fakeServer({
    "GET /api/auth/me": { body: { user } },
    "GET /admin/api/config": { body: fx.config },
    "GET /admin/api/bitrix-logs": { body: fx.bitrixLogs },
    "POST /admin/api/bitrix-logs/*/retry": { body: { ok: true, result: {} } },
    "GET /admin/api/user-action-logs": { body: fx.userLogs },
    "GET /admin/api/user-action-logs?event=offer_sent": { body: fx.userLogs },
    "GET /admin/api/user-action-logs?event=offer_sent&dealId=4711": { body: fx.userLogs },
    "GET /admin/api/pdf-stats?days=30": { body: fx.pdfStats },
    "GET /admin/api/pdf-stats?days=7": { body: fx.pdfStats },
    ...extra,
  });
}
/** the requests besides the settings list every admin page loads (today: on opening the panel) */
const own = (calls: { key: string; body: unknown }[]) => calls.filter((c) => c.key.includes("/admin/api/") && c.key !== "GET /admin/api/config").map((c) => {
  const [method, path] = c.key.split(" ");
  return { method, path, ...(c.body === undefined ? {} : { body: c.body }) };
});
const recorded = (name: string) => scenario(name).requests.filter((r) => r.path !== "/admin/api/config");
const rowTexts = (label: string) => within(screen.getByRole("table", { name: label })).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()).join(" | "));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

describe("admin · log rules", () => {
  it("today's formats and counters", () => {
    expect([fmtMs(null), fmtMs(800), fmtMs(2400), fmtDur(30_000), fmtDur(46_700), fmtDur(5_400_000)]).toEqual(["–", "800 ms", "2.4 s", "30 s", "47 s", "1 h 30 min"]);
    expect(pdfSummary(fx.pdfStats as never)).toEqual([
      { value: "14", label: "PDFs erzeugt" }, { value: "93 %", label: "über Gotenberg" }, { value: "1", label: "Fallbacks" },
      { value: "0", label: "Endgültig fehlgeschlagen" }, { value: "47 s", label: "Zeit gespart (geschätzt)" },
    ]);
    expect(sortPdfRows([{ kind: "html", engine: "gotenberg" }, { kind: "docx", engine: "fallback" }, { kind: "docx", engine: "gotenberg" }])).toEqual([{ kind: "docx", engine: "gotenberg" }, { kind: "docx", engine: "fallback" }, { kind: "html", engine: "gotenberg" }]);
    expect(queryOf([["event", "offer_sent"], ["dealId", ""]])).toBe("event=offer_sent");
  });
});

describe("admin · Bitrix-Fehler", () => {
  it("today's rows; retry asks, then sends today's request and reloads", async () => {
    const srv = server();
    renderApp("/admin/bitrix-fehler");
    await screen.findByText("crm.deal.update");
    expect(rowTexts("Bitrix-Fehler")[1]).toContain("QUERY_LIMIT_EXCEEDED");
    expect(rowTexts("Bitrix-Fehler")[1]).toContain("Erledigt");
    expect(screen.getAllByRole("button", { name: /erneut senden/ })).toHaveLength(1); // only the open one
    fireEvent.click(screen.getByRole("button", { name: "crm.deal.update erneut senden" }));
    fireEvent.click(within(await screen.findByTestId("admin-confirm")).getByRole("button", { name: "Erneut senden" }));
    await waitFor(() => expect(own(srv.calls)).toEqual(recorded("bitrix: open and retry")));
  });
  it("a failed retry is shown on the page, not as a browser alert", async () => {
    server({ "POST /admin/api/bitrix-logs/*/retry": err("timeout again") });
    renderApp("/admin/bitrix-fehler");
    fireEvent.click(await screen.findByRole("button", { name: "crm.deal.update erneut senden" }));
    fireEvent.click(within(await screen.findByTestId("admin-confirm")).getByRole("button", { name: "Erneut senden" }));
    expect(await screen.findByText("Erneut senden fehlgeschlagen: timeout again")).toBeInTheDocument();
  });
  it("cancelling sends nothing", async () => {
    const srv = server();
    renderApp("/admin/bitrix-fehler");
    fireEvent.click(await screen.findByRole("button", { name: "crm.deal.update erneut senden" }));
    fireEvent.click(within(await screen.findByTestId("admin-confirm")).getByRole("button", { name: "Abbrechen" }));
    expect(own(srv.calls).filter((c) => c.method === "POST")).toEqual([]);
  });
});

describe("admin · Aktivitäts-Log", () => {
  it("event and deal filters ask as today (deal after the last key stroke)", async () => {
    const srv = server();
    renderApp("/admin/aktivitaet");
    await screen.findByText("ANG-T-1");
    fireEvent.change(screen.getByLabelText("Ereignis"), { target: { value: "offer_sent" } });
    await waitFor(() => expect(srv.count("GET /admin/api/user-action-logs?event=offer_sent")).toBe(1));
    fireEvent.change(screen.getByLabelText("Deal-ID"), { target: { value: "47" } });
    fireEvent.change(screen.getByLabelText("Deal-ID"), { target: { value: "4711" } });
    await waitFor(() => expect(own(srv.calls)).toEqual(recorded("activity: filters")));
    expect(rowTexts("Aktivitäts-Log")[0]).toMatch(/\| offer_sent \| 4711 \| ANG-T-1 \| bu \| Mail$/);
  });
});

describe("admin · PDF-Engine", () => {
  it("counters, rows in today's order, failures; the period asks again", async () => {
    const srv = server();
    renderApp("/admin/pdf-engine");
    await screen.findByText("PDFs erzeugt");
    expect(screen.getByTestId("admin-stats")).toHaveTextContent("93 %über Gotenberg");
    expect(screen.getByText(/DOCX → PDF vorher Ø 5.1 s \(Benchmark\) · HTML → PDF vorher Ø 2.4 s \(Benchmark\)/)).toBeInTheDocument();
    const rows = rowTexts("PDF je Art und Engine");
    expect(rows.map((r) => r.split(" | ").slice(0, 6).join(" | "))).toEqual([
      "DOCX → PDF | Gotenberg | 10 | 1 | 800 ms | 2.4 s", "DOCX → PDF | Fallback (lokal nach Gotenberg-Fehler) | 1 | 0 | 5.2 s | 5.2 s", "HTML → PDF | Gotenberg | 4 | 0 | 400 ms | 900 ms",
    ]);
    expect(rowTexts("Fehler und Fallbacks")[0]).toContain("DOCX → PDF | Gotenberg → Fallback | 30.0 s | timeout");
    fireEvent.change(screen.getByLabelText("Zeitraum"), { target: { value: "7" } });
    await waitFor(() => expect(own(srv.calls)).toEqual(recorded("pdf: 7 days")));
  });
});

describe("admin · logs are admins only", () => {
  it("a user without the admin role gets no log request", async () => {
    const srv = server({}, { email: "testnutzer@example.test", name: "TN", role: "user" });
    renderApp("/admin/bitrix-fehler");
    expect(await screen.findByText("Die Verwaltung ist nur für Administratoren.")).toBeInTheDocument();
    expect(srv.calls.filter((c) => c.key.includes("/admin/api/"))).toEqual([]);
  });
});
