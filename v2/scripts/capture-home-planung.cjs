// Records today's Hauptmenü planning panel: tapping an appointment → „Welche Angebotsart möchten Sie
// öffnen?“ → the offer starts with the customer data of the appointment in Kundendaten (and, in the
// background, the Bitrix contact fills the Anrede and empty fields). Reference for
// apps/web/test/home-planung.test.tsx (ADR 026, phase 4; Hauptmenü slice 2, Full for the transfer).
// The planning service and Bitrix are answered here with MADE-UP data — no real customers.
//
//   bash v2/scripts/preview.sh &    (CAPTURE_BASE=http://localhost:3000 if :3001 is taken)
//   node v2/scripts/capture-home-planung.cjs   → v2/apps/web/test/fixtures/home-planung.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "home-planung.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };

const key = (d) => d.toLocaleDateString("sv-SE");
const monday = (d) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() + (m.getDay() === 0 ? -6 : 1 - m.getDay())); return m; };
/** the made-up planning week: three appointments today (one without a deal, one cancelled), more on other days */
function weekPayload(now = new Date()) {
  const today = key(now), mon = monday(now), day = (i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; };
  const A = { id: "a1", name: "Erika Mustermann", importDealId: 70001, contactId: 5001, phone: "+49 9281 000001", email: "erika@example.test", address: "Teststraße 1, 95028 Hof", manualStartMinutes: 540, duration: 90, travelMinutesAfter: 20, plannedDate: today, taetigkeitenBadge: "BU", priority: "high", locked: true, lockedSlot: 0 };
  const B = { id: "b2", name: "Hans Beispiel", contactId: 5002, phone: "0170 000002", email: "", address: "Musterweg 5, 95030 Hof", street: "Musterweg 5", postalCode: "95030", city: "Hof", manualStartMinutes: 780, duration: 60, plannedDate: today, priority: "low" };
  const C = { id: "c3", name: "Anna Absage", importDealId: 70003, address: "Probeweg 9, 95032 Hof", manualStartMinutes: 900, duration: 45, plannedDate: today, cancelled: true };
  const other = { id: "d4", name: "Karl Probe", importDealId: 70004, address: "Weg 2, 95028 Hof", manualStartMinutes: 600, duration: 60, priority: "medium" };
  const future = { id: "e5", name: "Paula Muster", importDealId: 70005, address: "Allee 3, 95028 Hof", manualStartMinutes: 480, duration: 60 };
  const dayOf = (i, customers) => ({ dayIndex: i, date: key(day(i)), shortLabel: ["Mo", "Di", "Mi", "Do", "Fr"][i], label: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"][i], dateLabel: day(i).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), locked: false, customers });
  const todayIdx = (now.getDay() + 6) % 7;
  const days = [0, 1, 2, 3, 4].map((i) => dayOf(i, i === todayIdx ? [A, B, C] : i === (todayIdx + 1) % 5 ? [other] : []));
  const raw = {}; for (const d of days) raw[d.date] = d.customers;
  const next = day(7); raw[key(next)] = [future];
  return { planning: { currentWeekStart: key(mon), days, futurePlanned: [A, B, C], rawWpByDate: raw, board: { lockedDays: {} }, todayPause: { start: "12:00", end: "12:30", durationMinutes: 30 } } };
}
const CONTACT = { HONORIFIC: { STATUS_ID: "HNR_DE_1" }, EMAIL: [{ VALUE: "erika.bitrix@example.test" }], PHONE: [{ VALUE: "+49 9281 999999" }], ADDRESS: "Bitrixstraße 7", ADDRESS_CITY: "Hof", ADDRESS_POSTAL_CODE: "95028" };
// entry id → type, and what Bitrix answers for the contact lookups (null: not reachable)
const SCENARIOS = {
  "deal appointment, Badumbau, Bitrix fills the Anrede": { entry: "a1", type: "bu", bitrix: CONTACT },
  "deal appointment, Bitrix not reachable": { entry: "a1", type: "bu", bitrix: null },
  "appointment without deal, Badewannentür": { entry: "b2", type: "bwt", bitrix: CONTACT },
  "appointment without deal, Alltagshilfe": { entry: "b2", type: "ah", bitrix: null },
  "deal appointment, Handlauf": { entry: "a1", type: "hl", bitrix: null },
};
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base, now) => Object.fromEntries([...new Set([...Object.keys(base || {}), ...Object.keys(now || {})])].filter((k) => !same((base || {})[k], (now || {})[k])).map((k) => [k, k in (now || {}) ? now[k] : "<removed>"]));

module.exports = { SCENARIOS, weekPayload, CONTACT }; // the test data

if (require.main === module) (async () => {
  const browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-home-planung.cjs — do not edit", scenarios: [] };
  for (const [name, { entry, type, bitrix }] of Object.entries(SCENARIOS)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
    await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
    const page = await ctx.newPage();
    const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
    const seen = [];
    await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
    await page.route("**/api/planning/stream", (r) => r.abort());
    await page.route("**/api/planning/current", (r) => r.fulfill(json(weekPayload())));
    await page.route("**/api/bitrix/activities/today", (r) => r.fulfill(json({ byDealId: {} })));
    await page.route("**/api/bitrix/deal/*", (r) => { if (r.request().method() !== "GET") return r.continue(); seen.push(["GET", new URL(r.request().url()).pathname]); return bitrix ? r.fulfill(json({ contact: bitrix })) : r.fulfill(json({ error: "x" }, 502)); });
    await page.route("**/api/bitrix/contact/*", (r) => { seen.push(["GET", new URL(r.request().url()).pathname]); return bitrix ? r.fulfill(json({ result: bitrix })) : r.fulfill(json({ error: "x" }, 502)); });
    await page.route("**/api/bitrix/log-action", (r) => { seen.push(["POST", "/api/bitrix/log-action", r.request().postDataJSON()]); return r.fulfill(json({ ok: true })); });
    await page.route("**/api/offers/by-deal/*", (r) => r.fulfill(json([])));
    await page.route("**/api/drafts**", (r) => r.fulfill(json([])));
    await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
    page.on("dialog", (d) => d.accept().catch(() => {}));
    // the empty offer of this type, for the diff
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(800);
    const base = await page.evaluate(() => window.buildPayload());
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator(`#todayPlanningList .today-calendar-card[data-id="${entry}"]`).waitFor();
    seen.length = 0;
    await page.locator(`#todayPlanningList .today-calendar-card[data-id="${entry}"] .today-calendar-open`).click();
    await page.locator(`#planningOfferPickerCards [data-offer-key="${type}"]`).click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1500);
    const now = await page.evaluate(() => window.buildPayload());
    const { Kundendaten: k0, ...top0 } = base, { Kundendaten: k1, ...top1 } = now;
    out.scenarios.push({ name, entry, type, bitrix: bitrix ? "contact" : null, kundendaten: changed(k0, k1), top: changed(top0, top1), requests: seen.filter((s) => s[1] !== "/api/bitrix/log-action").map((s) => s.join(" ")), logged: seen.filter((s) => s[1] === "/api/bitrix/log-action").map((s) => s[2]) });
    console.log(name, "✓");
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
})().catch((e) => { console.error(e); process.exit(1); });
