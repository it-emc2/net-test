// Captures what today's UI stores for a NEW offer of each type (ADR 026, phase 2): the payload
// `window.buildPayload()` returns right after the tile was tapped, before any input.
// These files are the source of `emptyOffer(type)` in @oc/domain — same defaults as today by
// construction. The v2 add-ons are blocked so the result is the plain current UI.
//
//   bash v2/scripts/preview.sh &                 (local preview on :3001, nothing leaves the machine)
//   node v2/scripts/capture-empty-offers.cjs     → v2/packages/domain/src/empty/<type>.json
//
// Day-, user- and settings-dependent values are blanked; emptyOffer() takes them from its context.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "packages", "domain", "src", "empty");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me"; // v2 dev default
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

(async () => {
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [type, tile] of Object.entries(TILES)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
    await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
    const page = await ctx.newPage();
    const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
    await page.route("**/api/planning/**", (r) => r.abort());
    await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator(`.tile-btn[data-step="${tile}"]`).click();
    await page.waitForFunction(() => location.hash && location.hash !== "#home");
    await page.waitForTimeout(2500); // defaults that are applied after the first paint
    const payload = await page.evaluate(() => window.buildPayload());
    // Values that depend on the day, the logged-in user or the business settings are not offer
    // defaults: they are blanked here and supplied by the caller of emptyOffer() (see
    // OfferContext in @oc/domain). Nothing personal is stored in the repository.
    const kd = payload.Kundendaten || {};
    for (const k of ["date", "ansprechpartner", "emc2_contact"]) if (k in kd) kd[k] = "";
    for (const k of ["offerNumber", "auftragId", "ourSignatureUser"]) if (k in payload) payload[k] = "";
    if (payload.mail) for (const k of ["body", "subject"]) if (k in payload.mail) payload.mail[k] = ""; // text with the offer number and the contact
    if ("pricingRules" in payload) payload.pricingRules = {};
    // Arbeitszeit.travelSecondWorkerRate (35 €/h for new offers) and travelCostDebug stay: the
    // price reads the rate, and an offer without it is priced like an old one (25 €/h).
    fs.writeFileSync(path.join(OUT, `${type}.json`), JSON.stringify(sortKeys(payload), null, 2) + "\n");
    console.log(`${type}: ${Object.keys(payload).length} top-level keys, ${JSON.stringify(payload).length} bytes`);
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
