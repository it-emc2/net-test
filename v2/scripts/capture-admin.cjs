// Records what today's admin panel (src/public/admin) sends and shows — the reference for
// apps/web/test/admin.test.tsx (port-slice, check level Full for settings and users, Light for
// the log views). The page and every answer of /admin/api are served by this script (page.route):
// no server, no database, nothing leaves this computer. Data are invented and neutral.
//
//   node v2/scripts/capture-admin.cjs   → v2/apps/web/test/fixtures/admin.json
//   (PLAYWRIGHT=<path to a playwright package> when this checkout has no root node_modules)
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT || "../../node_modules/playwright");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "admin.json");
const BASE = "http://admin.test";

// a small settings list with every field type of today's schema, over four sections
const CONFIG = [
  { key: "TAX_RATE", label: "Mehrwertsteuersatz", description: "MwSt auf Nettobeträge (0.19 = 19 %)", note: "Erfordert Serverneustart nach Änderung", unit: "%", type: "percent", section: "shared", order: 1, defaultValue: 0.19, value: 0.19 },
  { key: "LABOR_RATE_KK", label: "Stundensatz Kassenkunde", description: "", note: "", unit: "€/h", type: "euro", section: "shared", order: 2, defaultValue: 69.5, value: 72 },
  { key: "ROUND_MIN", label: "Rundung", description: "", note: "", unit: "min", type: "integer", section: "shared", order: 3, defaultValue: 15, value: 15 },
  { key: "SHOW_HINT", label: "Hinweis zeigen", description: "", note: "", unit: "", type: "boolean", section: "shared", order: 4, defaultValue: false, value: false },
  { key: "BWT_KM_FREE", label: "Freie Kilometer", description: "", note: "", unit: "km", type: "number", section: "bwt", order: 1, defaultValue: 30, value: 30 },
  { key: "BU_TABLE", label: "Tabelle", description: "", note: "", unit: "", type: "json", section: "bu", order: 1, defaultValue: { a: 1 }, value: { a: 1 } },
  { key: "GRAB_IDS", label: "Aktion-Haltegriffe", description: "", note: "", unit: "", type: "text-list", section: "zuschuss", order: 1, defaultValue: [], value: ["HG-1"] },
];
const USERS = [
  { email: "admin@example.test", firstName: "Admin", lastName: "Test", name: "Admin Test", role: "admin", active: true, hasSignature: true },
  { email: "testnutzer@example.test", firstName: "Test", lastName: "Nutzer", name: "Test Nutzer", role: "user", active: true, hasSignature: false },
];
const BITRIX_LOGS = { items: [
  { _id: "64b000000000000000000001", createdAt: "2026-11-20T09:15:00.000Z", method: "crm.deal.update", message: "timeout", params: { id: 4711 }, resolved: false },
  { _id: "64b000000000000000000002", createdAt: "2026-11-19T08:00:00.000Z", method: "crm.timeline.comment.add", message: "QUERY_LIMIT_EXCEEDED", params: {}, resolved: true },
], total: 2 };
const USER_LOGS = { items: [
  { createdAt: "2026-11-20T10:00:00.000Z", event: "offer_sent", dealId: "4711", offerNumber: "ANG-T-1", offerType: "bu", message: "Mail" },
], total: 1 };
const SIGNING = { items: [
  { token: "tok-1", offerNumber: "ANG-T-1", customerType: "KASSE", customerName: "Kunde Test", customerEmail: "kunde@example.test", status: "partially_signed", signedCount: 1, docCount: 2,
    documents: [{ key: "abtretung", status: "signed" }, { key: "vollmacht", status: "pending" }], createdAt: "2026-11-18T09:00:00.000Z", openedAt: "2026-11-18T10:00:00.000Z", completedAt: null, expiresAt: "2026-12-18T09:00:00.000Z" },
  { token: "tok-2", offerNumber: "ANG-T-2", customerType: "SZ", customerName: "Kundin Test", customerEmail: "", status: "sent", signedCount: 0, docCount: 1,
    documents: [{ key: "angebot", status: "pending" }], createdAt: "2026-11-19T09:00:00.000Z", openedAt: null, completedAt: null, expiresAt: "2026-12-19T09:00:00.000Z" },
], counts: { partially_signed: 1, sent: 1 }, total: 2 };
const PDF_STATS = { app: "oc", days: 30, rows: [
  { kind: "docx", engine: "gotenberg", total: 10, ok: 9, failed: 1, avgMs: 800, maxMs: 2400, last: "2026-11-20T09:00:00.000Z" },
  { kind: "docx", engine: "fallback", total: 1, ok: 1, failed: 0, avgMs: 5200, maxMs: 5200, last: "2026-11-19T09:00:00.000Z" },
  { kind: "html", engine: "gotenberg", total: 4, ok: 4, failed: 0, avgMs: 400, maxMs: 900, last: "2026-11-20T08:00:00.000Z" },
], saved: { docx: { baselineMs: 5100, measured: false, ms: 38700 }, html: { baselineMs: 2400, measured: false, ms: 8000 } },
failures: [{ createdAt: "2026-11-19T09:00:00.000Z", kind: "docx", engine: "gotenberg", ms: 30000, error: "timeout" }] };
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

// acts: ["fill", selector, text] · ["click", selector] · ["select", selector, value] · ["nav", section]
//   · ["file", selector] (the 1×1 PNG above) · ["wait", ms]
const SCENARIOS = {
  "settings: open": { acts: [] },
  "settings: euro changed and saved": { acts: [["fill", "#field-LABOR_RATE_KK", "74.5"], ["click", "#save-btn"]] },
  "settings: integer with decimals": { acts: [["fill", "#field-ROUND_MIN", "12.7"], ["click", "#save-btn"]] },
  "settings: back to the stored value drops the change": { acts: [["fill", "#field-LABOR_RATE_KK", "80"], ["fill", "#field-LABOR_RATE_KK", "72"]] },
  "settings: empty number drops the change": { acts: [["fill", "#field-LABOR_RATE_KK", "80"], ["fill", "#field-LABOR_RATE_KK", ""]] },
  "settings: boolean switched on": { acts: [["click", "#field-SHOW_HINT"], ["click", "#save-btn"]] },
  "settings: two sections, one save": { acts: [["fill", "#field-TAX_RATE", "0.2"], ["nav", "bwt"], ["fill", "#field-BWT_KM_FREE", "40"], ["click", "#save-btn"]] },
  "settings: text list": { acts: [["nav", "zuschuss"], ["fill", "#field-GRAB_IDS", "HG-1\nHG-2, HG-3\n\n"], ["click", "#save-btn"]] },
  "settings: invalid json is not saved": { acts: [["nav", "bu"], ["fill", "#field-BU_TABLE", "{ a: "]] },
  "settings: json changed": { acts: [["nav", "bu"], ["fill", "#field-BU_TABLE", "{\"a\": 2}"], ["click", "#save-btn"]] },
  "settings: reset one value": { acts: [["click", "#reset-LABOR_RATE_KK"]] },
  "settings: save fails": { fail: "PUT /admin/api/config", acts: [["fill", "#field-ROUND_MIN", "20"], ["click", "#save-btn"]] },
  "users: open": { acts: [["nav", "users"]] },
  "users: new user": { acts: [["nav", "users"], ["fill", "#u-first", " Neu "], ["fill", "#u-last", "Person"], ["fill", "#u-email", "neu@example.test "], ["fill", "#u-pass", "geheim-123"], ["select", "#u-role", "admin"], ["click", "#u-save"]] },
  "users: existing user without password": { acts: [["nav", "users"], ["fill", "#u-email", "testnutzer@example.test"], ["click", "#u-save"]] },
  "users: no e-mail": { acts: [["nav", "users"], ["fill", "#u-first", "Ohne"], ["click", "#u-save"]] },
  "users: server refuses": { fail: "POST /admin/api/users", acts: [["nav", "users"], ["fill", "#u-email", "x@example.test"], ["click", "#u-save"]] },
  "users: signature uploaded": { acts: [["nav", "users"], ["file", 'input[type="file"][data-email="testnutzer@example.test"]']] },
  "bitrix: open and retry": { acts: [["nav", "bitrixlogs"], ["click", 'button[data-retry="64b000000000000000000001"]']] },
  "activity: filters": { acts: [["nav", "userlogs"], ["select", "#ulog-event", "offer_sent"], ["fill", "#ulog-dealid", "4711"], ["wait", 600]] },
  "signing: filters and send": { acts: [["nav", "signing"], ["fill", "#sign-q", "ANG"], ["wait", 600], ["select", "#sign-status", "sent"], ["click", 'button[data-send-bitrix="tok-1"]']] },
  "pdf: 7 days": { acts: [["nav", "pdfstats"], ["select", "#pdf-days", "7"]] },
};

const answer = (method, p) => {
  if (method === "GET" && p === "/admin/api/config") return CONFIG;
  if (method === "PUT" && p === "/admin/api/config") return { ok: true, updated: 1 };
  if (method === "POST" && p === "/admin/api/config/reset") return { ok: true, key: "LABOR_RATE_KK", value: 69.5 };
  if (method === "GET" && p === "/admin/api/users") return USERS;
  if (method === "POST" && p === "/admin/api/users") return { ok: true, email: "neu@example.test" };
  if (method === "POST" && /^\/admin\/api\/users\/[^/]+\/signature$/.test(p)) return { ok: true, hasSignature: true };
  if (method === "GET" && p === "/admin/api/bitrix-logs") return BITRIX_LOGS;
  if (method === "POST" && /\/retry$/.test(p)) return { ok: true, result: {} };
  if (method === "GET" && p.startsWith("/admin/api/user-action-logs")) return USER_LOGS;
  if (method === "GET" && p.startsWith("/admin/api/signing")) return SIGNING;
  if (method === "POST" && /\/send-bitrix$/.test(p)) return { ok: true, sent: ["abtretung"] };
  if (method === "GET" && p.startsWith("/admin/api/pdf-stats")) return PDF_STATS;
  return null;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-admin.cjs — do not edit", config: CONFIG, users: USERS, bitrixLogs: BITRIX_LOGS, userLogs: USER_LOGS, signing: SIGNING, pdfStats: PDF_STATS, png: PNG, scenarios: [] };
  for (const [name, { acts, fail }] of Object.entries(SCENARIOS)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
    await ctx.addInitScript(() => localStorage.setItem("emc2_admin_token", `${Date.now() + 3600e3}.capture`));
    const page = await ctx.newPage();
    const requests = [];
    const alerts = [];
    page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
    await page.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      const method = r.request().method();
      const file = { "/admin/": "index.html", "/admin/admin.js": "admin.js", "/admin/admin.css": "admin.css" }[u.pathname];
      if (file) return r.fulfill({ status: 200, contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(path.join(ROOT, "src/public/admin", file)) });
      if (!u.pathname.startsWith("/admin/api/")) return r.fulfill({ status: 404, body: "" });
      const raw = r.request().postData();
      const body = raw ? JSON.parse(raw) : undefined;
      requests.push({ method, path: u.pathname + u.search, ...(body === undefined ? {} : { body }) });
      if (fail === `${method} ${u.pathname}`) return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Abgelehnt (Test)" }) });
      const a = answer(method, u.pathname);
      return r.fulfill(a ? { status: 200, contentType: "application/json", body: JSON.stringify(a) } : { status: 404, contentType: "application/json", body: JSON.stringify({ error: "unbekannt" }) });
    });
    await page.goto(BASE + "/admin/", { waitUntil: "load" });
    await page.waitForSelector(".config-card");
    for (const [kind, sel, val] of acts) {
      if (kind === "fill") await page.fill(sel, val);
      else if (kind === "click") await page.click(sel);
      else if (kind === "select") await page.selectOption(sel, val);
      else if (kind === "nav") await page.click(`.nav-item[data-section="${sel}"]`);
      else if (kind === "file") await page.setInputFiles(sel, { name: "u.png", mimeType: "image/png", buffer: Buffer.from(PNG.split(",")[1], "base64") });
      else if (kind === "wait") await page.waitForTimeout(sel);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(400);
    const view = await page.evaluate(() => {
      const t = (n) => (n && !n.classList.contains("hidden") ? (n.textContent || "").replace(/\s+/g, " ").trim() : "");
      const btn = document.getElementById("save-btn");
      return {
        title: t(document.getElementById("section-title")),
        changeCount: t(document.getElementById("change-count")),
        saveLabel: btn && !btn.classList.contains("hidden") ? t(document.getElementById("save-label")) : "",
        saveEnabled: !!btn && !btn.disabled && !btn.classList.contains("hidden"),
        status: t(document.getElementById("save-status")),
        badges: [...document.querySelectorAll(".nav-item")].map((a) => [a.dataset.section, (a.querySelector(".change-badge")?.textContent || "")]).filter(([, b]) => b),
        changedCards: [...document.querySelectorAll(".config-card.card-changed")].map((c) => c.id.replace("card-", "")),
        errorFields: [...document.querySelectorAll(".input-error")].map((c) => c.id.replace("field-", "")),
        userMsg: t(document.getElementById("u-msg")),
        userForm: document.getElementById("u-email") ? ["u-first", "u-last", "u-email", "u-pass"].map((id) => document.getElementById(id).value) : null,
        rows: [...document.querySelectorAll(".sign-table tbody tr")].slice(0, 6).map((tr) => (tr.textContent || "").replace(/\s+/g, " ").trim()),
      };
    });
    out.scenarios.push({ name, acts, ...(fail ? { fail } : {}), requests, alerts, view });
    console.log("ok", name, requests.length, "requests");
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log("->", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
