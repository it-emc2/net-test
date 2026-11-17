// iPad check for a step of the React app (skill port-slice §6): iPad Pro 11" portrait (834×1194),
// CPU slowed 6×. For every action it prints the time the main thread was blocked by long tasks and
// the number of price calls; at the end the page width (no sideways scrolling) and every visible
// control smaller than 48 px.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/ipad-check.cjs <actions.cjs> [offer type, default bu]
//
// <actions.cjs> exports async (page, measure, goStep) => { … }:
//   await measure("open", () => goStep("Zusammenfassung", /Angebotsversand/), 1500)   // name, action, ms to settle
// The offer is a new one under a temporary key; outside services are those of the preview (dead).
const crypto = require("node:crypto");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const [actionsFile, type = "bu"] = process.argv.slice(2);
if (!actionsFile) { console.error("usage: node v2/scripts/ipad-check.cjs <actions.cjs> [type]"); process.exit(2); }
const actions = require(path.resolve(actionsFile));
const token = (() => { const p = `${Date.now() + 3600e3}:capture@local.test`; return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex"); })();
const LAUNCH = { headless: true, ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) }; // PW_CHANNEL=chromium: the full browser instead of the headless shell
const KEY = "t-" + crypto.randomBytes(12).toString("hex");

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage();
  // who is signed in is answered here (the preview database need not hold the user), as in the recorders
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/users", (r) => r.fulfill(json([{ email: "capture@local.test", name: "Capture", firstName: "Cap", lastName: "Ture", hasSignature: true }])));
  let priceCalls = 0;
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/price") priceCalls++; });
  await page.addInitScript(() => { window.__blocked = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__blocked += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true }); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

  const measure = async (name, fn, settle = 1200) => {
    await page.evaluate(() => { window.__blocked = 0; }).catch(() => {});
    priceCalls = 0;
    await fn();
    await page.waitForTimeout(settle);
    console.log(JSON.stringify({ name, blockedMs: Math.round(await page.evaluate(() => window.__blocked)), priceCalls }));
  };
  const goStep = async (step, heading) => {
    await page.goto(`${BASE}/app/deal/${KEY}/${type}/${step}`, { waitUntil: "load" });
    await page.getByRole("heading", { name: heading }).first().waitFor({ timeout: 30000 });
  };
  try {
    await actions(page, measure, goStep);
    console.log(JSON.stringify(await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      small: [...document.querySelectorAll("main button, main a, main input:not([type=hidden]), main select, main [role=button], main [role=tab]")]
        .map((e) => { const box = (e.matches("input[type=checkbox], input[type=radio]") && e.closest("label")) || e, r = box.getBoundingClientRect(); return [e.tagName, (e.id || e.textContent || "").trim().slice(0, 24), Math.round(r.width), Math.round(r.height)]; })
        .filter(([, , w, h]) => w > 0 && h > 0 && (w < 48 || h < 48)),
    }))));
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
