// Do Wanne / WC picks PRICE the same in the React app as in today's view? For every case the same
// picks are made once in today's UI and once in the React app (each a new Badumbau offer, nothing
// else entered); the LAST `POST /api/price` of each is kept (request body and answer) and compared:
// the answer field by field (totals, net / VAT, every line), and the request's `optional` and
// `duschwanne` sections. Case "i" also opens the Kosten step in React and reads the tub, screen and
// WC lines. Writes the raw captures to ~/emc2-local/compare-wanne-wc.json.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/compare-optional-wanne-wc-prices.cjs [case letters, e.g. "a i"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const OUT = path.join(os.homedir(), "emc2-local", "compare-wanne-wc.json");

const W = [["cat", "WANNE"]];
const EL = [...W, ["set", "einbau:Ecke"], ["set", "wall:links"], ["set", "side:links"]];
const WM = [["cat", "WC"], ["montage", "Wandmontage"], ["seat", "normal"]];
const CASES = {
  "0": ["nothing picked (base)", []],
  a: ["corner tub only", [...EL, ["set", "mode:plain"], ["pick", "ST170-EL-TL"], ["done"]]],
  b: ["wall tub + glass screen", [...EL, ["set", "mode:screen"], ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"], ["done"]]],
  c: ["tub with door (niche, door right)", [...W, ["set", "einbau:Nische"], ["set", "side:rechts"], ["set", "mode:plain"], ["pick", "ST170-N-TR"], ["done"]]],
  d: ["Iris niche tub, neck rest without price", [...W, ["set", "einbau:Nische"], ["set", "side:links"], ["set", "mode:plain"], ["pick", "IRIS160LS"], ["done"]]],
  e: ["WC Wandmontage, WC + seat", [...WM, ["tile", "DERWWCOSVP"], ["done"]]],
  f: ["WC Bodenmontage", [["cat", "WC"], ["montage", "Bodenmontage"], ["tile", "CLPWCF10"], ["tile", "CLPSSI"], ["done"]]],
  g: ["Dusch-WC", [...WM, ["tile", "DEDWWC"], ["done"]]],
  h: ["seat quantity 2 (second pair)", [...WM, ["tile", "DEDWWC"], ["qty", "DERSIAS__pair_DEDWWC", "2"], ["done"]]],
  i: ["tub + screen + WC", [...EL, ["set", "mode:screen"], ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"], ["done"], ...WM, ["tile", "DERWWCOSVP"], ["done"]]],
  j: ["tub picked, removed in the bar", [...EL, ["set", "mode:plain"], ["pick", "ST170-EL-TL"], ["done"], ["chipx", "ST170-EL-TL"]]],
};

const token = (() => { const p = `${Date.now() + 3600e3}:capture@local.test`; return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex"); })();
const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function context(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/users", (r) => r.fulfill(json([{ email: "capture@local.test", name: "Capture", hasSignature: true }])));
  await page.route("**/api/planning/**", (r) => r.abort());
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const prices = [];
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST" || new URL(res.url()).pathname !== "/api/price") return;
    try { prices.push({ at: Date.now(), body: JSON.parse(req.postData() || "null"), answer: await res.json() }); } catch { /* gone */ }
  });
  page.on("dialog", (d) => { d.accept().catch(() => {}); });
  return { ctx, page, prices };
}
/** wait until no price call came for `quiet` ms */
async function settle(page, prices, quiet = 2500) {
  let n = -1;
  while (n !== prices.length) { n = prices.length; await page.waitForTimeout(quiet); }
}

async function legacy(browser, steps) {
  const { ctx, page, prices } = await context(browser);
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.setStep("Optional"));
    await page.waitForTimeout(800);
    for (const [kind, a, b] of steps) {
      if (kind === "cat") await page.locator(`#optCategories label.image-check:has(#cat_${a})`).click();
      else if (kind === "done") await page.locator("#optCategoryModal .opt-modal-done").click();
      else if (kind === "set") await page.locator(`#menu_WANNE [data-set="${a}"]`).click();
      else if (kind === "pick") await page.locator(`#menu_WANNE .wanne-card[data-art="${a}"]`).click();
      else if (kind === "montage") await page.locator(`#menu_WC label:has(input[name="wcMontage"][value="${a}"])`).click();
      else if (kind === "seat") await page.locator(`#menu_WC label:has(input[name="wcSeatHeight"][value="${a}"])`).click();
      else if (kind === "tile") await page.locator(`#menu_WC label.image-check:has(#opt_${a})`).click();
      else if (kind === "qty") { const inp = page.locator(`#qty_${a}`); await inp.fill(String(b)); await inp.blur(); }
      else if (kind === "chipx") await page.locator("#optSelectionChips .opt-chip").filter({ has: page.locator(".opt-chip-label", { hasText: a }) }).locator("button").click();
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(kind === "montage" || kind === "cat" ? 1000 : 500);
    }
    await page.evaluate(() => window.updatePricing?.()); // the last state of the page is priced
    await settle(page, prices);
    return prices.at(-1) ?? null;
  } finally { await ctx.close(); }
}

async function react(browser, steps, kosten) {
  const { ctx, page, prices } = await context(browser);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  try {
    await page.goto(`${BASE}/app/deal/${KEY}/bu/Optional`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Optionale Produkte" }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const dlg = () => page.getByRole("dialog");
    for (const [kind, a, b] of steps) {
      if (kind === "cat") { await page.locator(`[data-testid="opt-card"][data-id="${a}"]`).click(); if (a === "WANNE") await dlg().getByTestId("wanne").waitFor(); }
      else if (kind === "done") await page.getByRole("button", { name: "Fertig" }).click();
      else if (kind === "set") await dlg().locator(`[data-testid="wanne-tile"][data-set="${a}"]`).click();
      else if (kind === "pick") await dlg().locator(`[data-testid="wanne-card"][data-art="${a}"]`).click();
      else if (kind === "montage") await dlg().locator(`label:has(input[name="wcMontage"][value="${a}"])`).click();
      else if (kind === "seat") await dlg().locator(`label:has(input[name="wcSeatHeight"][value="${a}"])`).click();
      else if (kind === "tile") await dlg().locator(`[data-testid="wc-tile"][data-id="${a}"] input[type="checkbox"]`).click();
      else if (kind === "qty") await dlg().locator(`#wc_${a}`).fill(String(b));
      else if (kind === "chipx") await page.getByTestId("opt-chip").filter({ hasText: a }).getByRole("button").click();
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(kind === "montage" || kind === "cat" ? 1000 : 500);
    }
    await settle(page, prices);
    let lines = null;
    if (kosten) { // the Kosten step of the same offer, reached in the app (no reload)
      await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bu/Kosten`);
      await page.getByTestId("kosten-sums").waitFor({ timeout: 30000 });
      await settle(page, prices);
      lines = await page.evaluate(() => [...document.querySelectorAll('[data-testid="kosten-line"]')].map((r) => ({
        id: r.dataset.lineId, label: r.querySelector('[data-part="label"]')?.textContent?.trim(), qty: r.querySelector('[data-part="qty"]')?.textContent?.trim(),
        unit: r.querySelector('[data-part="unit"]')?.textContent?.trim(), total: r.querySelector('[data-part="total"]')?.textContent?.trim(),
      })));
    }
    return { ...(prices.at(-1) ?? {}), kosten: lines };
  } finally { await ctx.close(); }
}

// ---- comparing ----
const VOLATILE = /(^|\.)(requestId|generatedAt|computedAt|timestamp|ts|at|cachedAt|offerNumber|date|createdAt|validUntil)$/i;
function diff(a, b, at = "", out = []) {
  if (VOLATILE.test(at)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], at ? `${at}.${k}` : k, out);
    return out;
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push([at, a, b]);
  return out;
}
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "—" : s.length > 90 ? s.slice(0, 87) + "…" : s; };

(async () => {
  const only = process.argv.slice(2).join(" ").split(/[\s,]+/).filter(Boolean);
  let browser = await chromium.launch({ headless: true });
  const all = {};
  for (const [id, [name, steps]] of Object.entries(CASES)) {
    if (only.length && !only.includes(id)) continue;
    const run = async (fn) => {
      for (let attempt = 1; ; attempt++) {
        try { return await fn(); } catch (e) {
          if (attempt >= 4) return { error: String(e.message || e).split("\n")[0] };
          console.error(`  ${id}: retry ${attempt} (${String(e.message || e).split("\n")[0]})`);
          await browser.close().catch(() => {}); browser = await chromium.launch({ headless: true });
        }
      }
    };
    const L = await run(() => legacy(browser, steps));
    const R = await run(() => react(browser, steps, id === "i"));
    all[id] = { name, steps, legacy: L, react: R };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
    console.error(`${id} done`);
  }
  await browser.close();

  console.log("| case | legacy total | React total | equal | differences (answer; request optional / duschwanne) |");
  console.log("|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | |`); continue; }
    const d = diff(L.answer, R.answer, "answer");
    for (const sec of ["optional", "duschwanne"]) diff((L.body || {})[sec], (R.body || {})[sec], `request.${sec}`, d);
    const answerDiffs = d.filter(([p]) => p.startsWith("answer"));
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${answerDiffs.length ? "no" : "yes"} | ${d.map(([p, a, b]) => `${p}: ${short(a)} → ${short(b)}`).join("<br>") || "—"} |`);
  }
  if (all.i?.react?.kosten) {
    console.log("\nKosten (React, case i):");
    for (const l of all.i.react.kosten) console.log(`  ${l.id} | ${l.label} | ${l.qty} | ${l.unit} | ${l.total}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
