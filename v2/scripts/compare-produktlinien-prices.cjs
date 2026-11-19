// Do the product lines (Badolux / Hassmann, main sync item 8) PRICE and STORE the same in the React app as in
// today's UI? The same steps once in today's UI and once in the React app, each a new Badumbau offer — or,
// for the "reopened" cases, a stored offer that today's UI restores (restoreConfiguratorFromOffer) and the
// React app opens as the SAME draft. Kept and compared: the LAST `POST /api/price` — its answer field by field
// (totals, every line) and EVERY field of its request — and what the page stores in `duschwanne` at the end
// (today: buildPayload, React: the last draft it saved). Raw: ~/emc2-local/compare-produktlinien.json.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/compare-produktlinien-prices.cjs [case ids, e.g. "p1 p4"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const OUT = path.join(os.homedir(), "emc2-local", "compare-produktlinien.json");
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();

// steps: ["open", duschwanne fields] first · ["on"] / ["off"] the tray switch · ["tier", "standard"|"premium"] (tray) ·
//        ["dims", w, l] · ["pick", n] · ["qty", "+"|"-"] ·
//        ["fb"] the floor switch (then the page is Fußboden) · ["ftier", line] · ["farea", text] · ["fpick", n] n-th Badolux covering ·
//        ["fcolor", name] a Hassmann colour · ["confirm", "yes"|"no"]
// a stored offer with the accessories; one saved with the tray off keeps none (p10 / p11: today's page then shows the tray with NO accessory, React with all)
const ACC = { abdichtSet: "Wannenabdichtband-Set TRWDB", drainSet: "Ablaufgarnitur TRAGD9060", stelzlager: "PLA5282", smallMaterial: "Kleinmaterial" };
const ON = ["on"], D = ["dims", "90", "120"];
const FLOOR = ["fb", "ftier", "farea", "fpick", "fcolor", "confirm"];
const CASES = {
  p1: ["new offer, tray on (Badolux preselected), 90 × 120, first tray", [ON, D, ["pick", 1]]],
  p2: ["new offer, tray on, Hassmann chosen, 90 × 120, first tray", [ON, ["tier", "premium"], D, ["pick", 1]]],
  p3: ["new offer, Badolux preselected, stelzlager quantity down", [ON, D, ["pick", 1], ["qty", "-"]]],
  p4: ["new offer, tray on, off, on again (Badolux stays)", [ON, D, ["pick", 1], ["off"], ON]],
  p5: ["new offer, Hassmann chosen, off and on again (stays Hassmann)", [ON, ["tier", "premium"], D, ["pick", 1], ["off"], ON]],
  p6: ["new offer, Badolux tray, then Hassmann line", [ON, D, ["pick", 1], ["tier", "premium"], ["pick", 1]]],
  p7: ["reopened: offer with a Hassmann tray", [["open", { ...ACC, trayEnabled: true }], D, ["pick", 1]]],
  p8: ["reopened: no budgetMode, tray off, then on (Hassmann)", [["open", { ...ACC, trayEnabled: false }], ON, D, ["pick", 1]]],
  p9: ["reopened: budgetMode 1 (Badolux), tray off, then on", [["open", { ...ACC, trayEnabled: false, budgetMode: "1" }], ON, D, ["pick", 1]]],
  p10: ["reopened: no budgetMode, tray off and NO accessories stored, then on (today: none ticked)", [["open", { trayEnabled: false }], ON, D, ["pick", 1]]],
  p11: ["reopened: Badolux, tray off and NO accessories stored, then on (today: none ticked)", [["open", { trayEnabled: false, budgetMode: "1" }], ON, D, ["pick", 1]]],
  f1: ["floor: Hassmann colour (line unchanged)", [["fb"], ["farea", "5"], ["fcolor", "Loft-Grau"]]],
  f2: ["floor: Badolux covering 2", [["fb"], ["ftier", "standard"], ["farea", "5"], ["fpick", 2]]],
  f3: ["floor: Hassmann colour, Badolux confirmed, covering", [["fb"], ["farea", "5"], ["fcolor", "Loft-Grau"], ["ftier", "standard"], ["confirm", "yes"], ["fpick", 1]]],
  f4: ["new offer: tray on (Badolux), floor Hassmann untouched", [ON, D, ["pick", 1], ["fb"], ["farea", "5"], ["fcolor", "Loft-Grau"]]],
};

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
function watch(page) {
  const prices = [], drafts = [];
  page.on("response", async (res) => {
    const req = res.request(), p = new URL(res.url()).pathname;
    if (req.method() === "POST" && p === "/api/price") { try { prices.push({ body: JSON.parse(req.postData() || "null"), answer: await res.json() }); } catch { /* gone */ } }
    else if (["PUT", "POST"].includes(req.method()) && /\/draft$/.test(p)) { try { drafts.push(JSON.parse(req.postData() || "null")); } catch { /* not json */ } }
  });
  return { prices, drafts };
}
async function settle(page, prices, quiet = 2500) { let n = -1; while (n !== prices.length) { n = prices.length; await page.waitForTimeout(quiet); } }
async function basePage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/planning/**", (r) => r.abort());
  return { ctx, page };
}

// ---- today's UI ----
async function legacy(browser, steps) {
  const { ctx, page } = await basePage(browser);
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  const { prices } = watch(page);
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1200);
    const go = async (step) => { if (await page.evaluate(() => location.hash.slice(1)) !== step) { await page.evaluate((s) => window.setStep(s), step); await page.waitForTimeout(400); } };
    let draft = null;
    for (const [kind, a, b] of steps) {
      if (kind === "open") {
        await page.evaluate(async (f) => { const p = window.buildPayload(); p.duschwanne = { ...p.duschwanne, ...f }; await window.restoreConfiguratorFromOffer({ payload: p }); }, a);
        await page.waitForTimeout(2000);
        draft = await page.evaluate(() => window.buildPayload());
        continue;
      }
      const floor = FLOOR.includes(kind);
      await go(floor ? "Fussboden" : "Duschwanne");
      const P = floor ? "#page-Fussboden" : "#page-Duschwanne";
      if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#dwTrayToggle)`).click();
      else if (kind === "tier") await page.locator(`${P} .tier-seg__btn[data-tier="${a}"]`).click();
      else if (kind === "dims") { await page.locator(`${P} input[name="tray_w_cm"]`).fill(a); await page.locator(`${P} input[name="tray_l_cm"]`).fill(b); await page.locator(`${P} input[name="tray_l_cm"]`).blur(); await page.waitForTimeout(900); }
      else if (kind === "pick") await page.locator(`#tray-suggestions .suggestion-list:not(.suggestion-pinned .suggestion-list) label.suggestion-card:nth-child(${a})`).last().click();
      else if (kind === "qty") await page.locator(a === "+" ? "#stelzlagerQtyPlus" : "#stelzlagerQtyMinus").click();
      else if (kind === "fb") await page.locator(`${P} label.sec-switch:has(#fbMaster)`).click();
      else if (kind === "ftier") await page.locator(`#flooringPanel .tier-seg__btn[data-tier="${a}"]`).click();
      else if (kind === "farea") { await page.locator("#floorArea").fill(a); await page.locator("#floorArea").blur(); }
      else if (kind === "fpick") await page.locator(`#flooringBudgetOptions label.image-check:nth-child(${a})`).click();
      else if (kind === "fcolor") await page.locator(`#flooringColors label.image-check:has(input[data-color="${a}"])`).click();
      else if (kind === "confirm") await page.locator(a === "yes" ? "#appConfirmOk" : "#appConfirmCancel").click();
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(900);
    }
    await page.evaluate(() => window.updatePricing?.());
    await settle(page, prices);
    const p = await page.evaluate(() => window.buildPayload());
    return { ...(prices.at(-1) ?? {}), draft, stored: { duschwanne: p.duschwanne } };
  } finally { await ctx.close(); }
}

// ---- the React app ----
async function react(browser, steps, draft) {
  const { ctx, page } = await basePage(browser);
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const { prices, drafts } = watch(page);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  if (draft) await page.route(`**/api/deals/${KEY}/draft`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "bu", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const rest = draft ? steps.slice(1) : steps;
  const title = (step) => (step === "Fussboden" ? "Fußboden" : step);
  const go = async (step) => { await page.goto(`${BASE}/app/deal/${KEY}/bu/${step}`, { waitUntil: "load" }); await page.getByRole("heading", { name: title(step) }).first().waitFor({ timeout: 30000 }); await page.waitForTimeout(600); };
  const inApp = async (step) => { // inside the app (the offer and what the page remembers stay)
    await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bu/${step}`);
    await page.getByRole("heading", { name: title(step) }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(400);
  };
  const LINE = { standard: /^Badolux/, premium: /^Hassmann/ };
  try {
    let at = FLOOR.includes(rest[0]?.[0]) ? "Fussboden" : "Duschwanne";
    await go(at);
    for (const [kind, a, b] of rest) {
      const want = FLOOR.includes(kind) ? "Fussboden" : "Duschwanne";
      if (want !== at) { await inApp(want); at = want; }
      const lineGroup = page.getByRole("group", { name: "Produktlinie wählen" });
      if (kind === "on" || kind === "off") await page.getByRole("switch", { name: "Duschwanne", exact: true }).click();
      else if (kind === "tier" || kind === "ftier") await lineGroup.getByRole("button", { name: LINE[a] }).click();
      else if (kind === "dims") { await page.getByLabel("Breite in cm").fill(a); await page.getByLabel("Länge in cm").fill(b); await page.getByLabel("Länge in cm").blur(); await page.waitForTimeout(900); }
      else if (kind === "pick") await page.locator('[data-testid="tray-card"]:not([data-pinned="true"])').nth(a - 1).locator("input").click();
      else if (kind === "qty") await page.getByRole("button", { name: a === "+" ? "Mehr" : "Weniger" }).click();
      else if (kind === "fb") await page.getByRole("switch", { name: "Fußboden", exact: true }).click();
      else if (kind === "farea") { await page.getByLabel("Fläche in m²").fill(a); await page.getByLabel("Fläche in m²").blur(); }
      else if (kind === "fpick") await page.getByTestId("fb-tile").nth(a - 1).click();
      else if (kind === "fcolor") await page.locator(`[data-testid="fb-tile"][data-value$="|${a}"], [data-testid="fb-tile"][data-value="${a}"]`).first().click();
      else if (kind === "confirm") await page.getByRole("alertdialog").getByRole("button").nth(a === "yes" ? 0 : 1).click();
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(700);
    }
    await settle(page, prices);
    await page.waitForTimeout(3000); // the draft is saved a moment after the last change
    const last = drafts.at(-1)?.payload ?? drafts.at(-1) ?? {};
    return { ...(prices.at(-1) ?? {}), stored: { duschwanne: last.duschwanne } };
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
  if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out.push([at, a, b]);
  return out;
}
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "—" : s.length > 80 ? s.slice(0, 77) + "…" : s; };

(async () => {
  const only = process.argv.slice(2).join(" ").split(/[\s,]+/).filter(Boolean);
  let browser = await chromium.launch({ headless: true });
  const all = fs.existsSync(OUT) && only.length ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
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
    const R = await run(() => react(browser, steps, L.draft));
    all[id] = { name, steps, legacy: L, react: R };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
    console.error(`${id} done`);
  }
  await browser.close();

  console.log("| case | today's UI total | React total | answer equal | request fields that differ (every section) | stored duschwanne fields that differ |");
  console.log("|---|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | | |`); continue; }
    const a = diff(L.answer, R.answer, "answer"), q = diff(L.body, R.body, "request"), st = diff(L.stored?.duschwanne, R.stored?.duschwanne, "dw");
    const fmt = (d) => d.map(([p, x, y]) => `${p}: ${short(x)} → ${short(y)}`).join("<br>") || "—";
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${a.length ? `no: ${fmt(a)}` : "yes"} | ${fmt(q)} | ${fmt(st)} |`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
