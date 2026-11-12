// Tap measurement (ADR 026): how long the main thread is blocked and how many price requests go
// out for the three taps that were slow on the iPad. Chromium, 834×1194, CPU throttled 6×.
//   npm run test:perf                    measure the old app
//   PARITY_TARGET=v2 npm run test:perf   measure what v2 serves
//   PERF_BUDGET_MS=200 PERF_MAX_PRICE_CALLS=1 …   fail when a tap is over the pass mark
// Without a budget the spec only reports (the old UI is known to be far over it); the numbers
// are printed and written to test-results/perf-taps.json. Planning and Bitrix answers are
// fixtures — the test stack blocks those integrations.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { USER } = require("../parity/global-setup.cjs");

const THROTTLE = Number(process.env.PERF_CPU_THROTTLE || 6);
const BUDGET_MS = process.env.PERF_BUDGET_MS ? Number(process.env.PERF_BUDGET_MS) : null;
const MAX_PRICE = process.env.PERF_MAX_PRICE_CALLS ? Number(process.env.PERF_MAX_PRICE_CALLS) : null;
const OUT = path.join(__dirname, "..", "..", "..", "test-results", "perf-taps.json");

const today = new Date().toLocaleDateString("sv-SE");
const PLANNING = {
  planning: {
    days: [],
    futurePlanned: [{
      id: "fx-1", plannedDate: today, name: "Test Kunde", importDealId: "48213", contactId: "9001",
      address: "Teststr. 1, 12345 Teststadt", street: "Teststr. 1", postalCode: "12345", city: "Teststadt",
      phone: "0000 000000", email: "kunde@example.test", manualStartMinutes: 600, duration: 60, product: "BU",
    }],
  },
};
const DEAL = { ID: "48213", TITLE: "Test Kunde", CONTACT_ID: "9001", STAGE_ID: "NEW" };
const CONTACT = {
  ID: "9001", NAME: "Test", LAST_NAME: "Kunde", ADDRESS: "Teststr. 1", ADDRESS_POSTAL_CODE: "12345",
  ADDRESS_CITY: "Teststadt", PHONE: [{ VALUE: "0000 000000" }], EMAIL: [{ VALUE: "kunde@example.test" }],
};

test("taps: tile, back to Hauptmenü, customer from the planning", async ({ page, context }) => {
  test.setTimeout(240000);
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();

  await context.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push([e.startTime, e.duration])))
        .observe({ entryTypes: ["longtask"] });
    } catch { /* not supported → blocked time stays 0 */ }
  });
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/planning/current*", (r) => r.fulfill(json(PLANNING)));
  await page.route("**/api/planning/stream*", (r) => r.abort());
  await page.route("**/api/bitrix/deal/48213", (r) => r.fulfill(json(DEAL)));
  await page.route("**/api/bitrix/contact/9001", (r) => r.fulfill(json(CONTACT)));

  const requests = [];
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

  // quiet = 1.5 s without a new long task or request
  async function settle(maxMs = 60000) {
    const t0 = Date.now();
    let last = -1, changed = Date.now();
    while (Date.now() - t0 < maxMs) {
      const n = (await page.evaluate(() => (window.__longTasks || []).length)) + requests.length;
      if (n !== last) { last = n; changed = Date.now(); }
      if (Date.now() - changed > 1500) return;
      await page.waitForTimeout(250);
    }
  }
  const results = [];
  async function phase(name, action) {
    await settle();
    const r0 = requests.length;
    await page.evaluate(() => { if (window.__longTasks) window.__longTasks.length = 0; });
    await action();
    await settle();
    const tasks = await page.evaluate(() => (window.__longTasks || []).slice());
    results.push({
      name,
      blockedMs: Math.round(tasks.reduce((s, [, d]) => s + Math.max(0, d - 50), 0)),
      longestTaskMs: Math.round(Math.max(0, ...tasks.map(([, d]) => d))),
      priceCalls: requests.slice(r0).filter((p) => p === "/api/price").length,
      requests: requests.length - r0,
    });
  }

  await phase("load", () => page.goto("/", { waitUntil: "load" }));
  await phase("tap tile BU", () => page.locator('.tile-btn[data-step="BU-Badumbau"]').click());
  await phase("back to Hauptmenü", async () => {
    await page.evaluate(() => { location.hash = "home"; });
    const go = page.locator("#homeConfirmGo");
    try { await go.waitFor({ state: "visible", timeout: 5000 }); await go.click(); } catch { /* no offer in progress */ }
  });
  const card = page.locator("#todayPlanningList .today-customer-card").first();
  if (await card.count()) {
    await phase("customer from planning", async () => {
      await card.click();
      await page.locator("#planningOfferPickerCards .planning-offer-card").first().waitFor({ state: "attached", timeout: 8000 });
      await page.evaluate(() => document.querySelector("#planningOfferPickerCards .planning-offer-card").click());
    });
  }

  const report = { target: process.env.PARITY_TARGET === "v2" ? "v2" : "legacy", cpuThrottle: THROTTLE, viewport: page.viewportSize(), results };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n[perf] target=${report.target} cpu=${THROTTLE}x`);
  for (const r of results) console.log(`[perf] ${r.name.padEnd(24)} blocked ${String(r.blockedMs).padStart(6)} ms · longest ${String(r.longestTaskMs).padStart(6)} ms · /api/price ${r.priceCalls}`);

  const taps = results.filter((r) => r.name !== "load");
  expect(taps.length).toBeGreaterThanOrEqual(2);
  if (BUDGET_MS !== null) for (const r of taps) expect(r.blockedMs, `${r.name}: blocked main thread`).toBeLessThanOrEqual(BUDGET_MS);
  if (MAX_PRICE !== null) for (const r of taps) expect(r.priceCalls, `${r.name}: /api/price calls`).toBeLessThanOrEqual(MAX_PRICE);
});
