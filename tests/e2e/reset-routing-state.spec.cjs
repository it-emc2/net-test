/**
 * E2E: the Routenvorschlag state must not survive into the next offer.
 *
 * Regression guard for: open a deal from the heutige Terminplanung (which
 * auto-fills km + Reisezeit via /api/routing/suggest-distance), go back to the
 * Hauptmenü, start a fresh offer without Deal-ID → the old km/Reisezeit, the
 * "✓ Automatisch eingetragen" hint and the travel-hour mirrors used for
 * pricing were all still there.
 *
 * Runs against src/public served statically (v3's login gate has no dev
 * bypass), with /api/** stubbed — the reset under test is pure frontend.
 *
 * Run: npx playwright test tests/e2e/reset-routing-state.spec.cjs
 */

const { test, expect } = require("@playwright/test");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = path.join(__dirname, "..", "..", "src", "public");
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

let server;
let baseURL;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.join(PUBLIC_DIR, path.normalize(rel));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

const BU_TILE = '.tile-btn[data-step="BU-Badumbau"]';

test("a fresh offer starts without the previous customer's routing data", async ({ page }) => {
  // Login gate + everything else the page pokes at: one blanket stub.
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { name: "Test" }, items: [], result: [] }),
    })
  );

  await page.goto(`${baseURL}/#home`, { waitUntil: "domcontentloaded" });
  await page.click(BU_TILE);

  // Simulate what suggestDistanceFromAddress() leaves behind for a deal
  // customer: the two inputs (via real events, so the mirrors update), the
  // hint block and the AH zone cache.
  await page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set("distanceKm", "161");
    // 01:00 one-way → 2 h travel across 1 day: distinct from BU's 07:00
    // laborHours default, so a stale mirror can't be mistaken for it.
    set("travelTime", "01:00");
    document.getElementById("routingSuggestion").innerHTML =
      "Vorschlag: <strong>161,0 km</strong> ✓ Automatisch eingetragen";
    window.__ahZoneData = { zone: 5, billMin: 50, oneWayMins: 105 };
  });

  // Sanity: the leak-prone state is really set before the reset.
  expect(await page.evaluate(() => window.reise_hours_numeric)).toBeGreaterThan(0);

  // Back to the Hauptmenü, then start a new offer without a Deal-ID.
  await page.evaluate(() => {
    location.hash = "home";
  });
  await expect(page.locator(BU_TILE)).toBeVisible();
  await page.click(BU_TILE);

  const state = await page.evaluate(() => ({
    hint: document.getElementById("routingSuggestion").textContent.trim(),
    km: document.getElementById("distanceKm").value,
    travelTime: document.getElementById("travelTime").value,
    reiseHours: window.reise_hours_numeric,
    arbeitHours: window.arbeit_hours_numeric,
    ahZone: window.__ahZoneData,
    pressedZones: document.querySelectorAll(
      '#travelZoneButtons .az-zone-btn[aria-pressed="true"]'
    ).length,
  }));

  expect(state).toEqual({
    hint: "",
    km: "",
    travelTime: "",
    reiseHours: 0,
    arbeitHours: 7, // BU's laborHours default must survive the reset

    ahZone: undefined,
    pressedZones: 0,
  });
});
