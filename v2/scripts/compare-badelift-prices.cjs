// Does the React page „Badelift“ PRICE and STORE the same as today's page? The same steps
// (capture-badelift.cjs) once in today's UI and once in the React app, each a new Badelift offer.
// Cases that start with a reopened offer: today's UI restores it (restoreConfiguratorFromOffer) and the
// React app opens the SAME stored offer as its draft. Kept and compared: the LAST `POST /api/price` —
// its answer field by field and EVERY field of its request — and what the page stores in `bl` at the
// end (today: buildPayload, React: the offer in the store). Raw: ~/emc2-local/compare-badelift.json.
//
//   (own server up)  CAPTURE_BASE=http://localhost:5173 node v2/scripts/compare-badelift-prices.cjs [case ids, e.g. "c1 c7"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");
const cap = require("./capture-badelift.cjs");

const BASE = cap.BASE;
const OUT = path.join(os.homedir(), "emc2-local", "compare-badelift.json");
const S = cap.SCENARIOS;
const CASES = {
  c1: "opened, nothing changed", c2: "main product off", c3: "main product quantity 2", c4: "main product quantity 2.5",
  c5: "main product quantity cleared", c6: "all accessories", c7: "Halterung, quantity 2", c8: "accessories only, main product off",
  c9: "free item: complete", c10: "free item: quantity 3", c11: "free item: price with thousands", c12: "free item: price 0",
  c13: "two free items", c14: "everything", c15: "reopened: real offer with three products", c16: "reopened: quantities and two free items",
  c17: "reopened: without the main product, then Gleittuch off, on, quantity 2", c18: "Kosten: Selbstzahler", c19: "Kosten: markup 60",
  c20: "Kosten: markup 60, accessories and a free item",
};
const TITLE = { "BRS-912": "Juwel Tuchlift Premium", "BRS-909": "Gleittuch", "BHT-914": "Halterung ohne zu bohren", "BHT-2013": "Ladegerät für Juwel Tuchlift", "BRS-802": "Akkupack für Juwel Tuchlift" };
const FIELD = { name: "Bezeichnung", price: "Preis (netto)", qty: "Menge", id: "Artikel-ID" };

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
function watch(page) {
  const prices = [];
  page.on("response", async (res) => {
    const req = res.request(), p = new URL(res.url()).pathname;
    if (req.method() === "POST" && p === "/api/price") { try { prices.push({ body: JSON.parse(req.postData() || "null"), answer: await res.json() }); } catch { /* gone */ } }
  });
  return prices;
}

async function legacy(browser, steps) {
  const { ctx, page, prices } = await cap.newPage(browser);
  try {
    await cap.settle(page, prices, 1500);
    let draft = null, rest = steps;
    if (steps[0]?.[0] === "open") { await cap.play(page, [steps[0]]); draft = await page.evaluate(() => window.buildPayload()); rest = steps.slice(1); }
    await cap.play(page, rest);
    await page.evaluate(() => window.updatePricing?.());
    await cap.settle(page, prices);
    const p = await page.evaluate(() => window.buildPayload());
    return { ...(prices.at(-1) ?? {}), draft, opened: steps[0]?.[0] === "open" ? steps[0][1] : null, stored: { bl: p.bl } };
  } finally { await ctx.close(); }
}

/** a new offer in the React app; what it stores is what its last price request carries (the offer itself) */
async function react(browser, steps) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: cap.token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const prices = watch(page);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  const go = async (step) => { await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bl/${step}`); await page.waitForTimeout(800); };
  try {
    await page.goto(`${BASE}/app/deal/${KEY}/bl/bl`, { waitUntil: "load" });
    await page.getByTestId("bl-step").waitFor({ timeout: 30000 });
    await cap.settle(page, prices, 1500);
    await playReact(page, steps, go);
    await cap.settle(page, prices);
    return { ...(prices.at(-1) ?? {}), stored: { bl: prices.at(-1)?.body?.bl } };
  } finally { await ctx.close().catch(() => {}); }
}

/** an opened offer: today's restored payload with the stored `bl` is answered as the deal's draft */
async function reactOpened(browser, steps, opened, draft) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: cap.token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const prices = watch(page);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  const payload = { ...draft, bl: opened };
  await page.route(`**/api/deals/${KEY}/draft`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "bl", payload, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const go = async (step) => { await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bl/${step}`); await page.waitForTimeout(800); };
  try {
    await page.goto(`${BASE}/app/deal/${KEY}/bl/bl`, { waitUntil: "load" });
    await page.getByTestId("bl-step").waitFor({ timeout: 30000 });
    await cap.settle(page, prices, 1500);
    await playReact(page, steps.slice(1), go);
    await cap.settle(page, prices);
    return { ...(prices.at(-1) ?? {}), stored: { bl: prices.at(-1)?.body?.bl } };
  } finally { await ctx.close().catch(() => {}); }
}

async function playReact(page, steps, go) {
  let at = "bl";
  for (const [kind, a, b, c] of steps) {
    const want = kind === "payer" || kind === "auf" ? "Kundendaten" : "bl";
    if (want !== at) { await go(want); at = want; await page.waitForTimeout(400); }
    if (kind === "tick") await page.locator(`[data-testid="bl-card"][data-id="${a}"] label`).first().click();
    else if (kind === "qty") { const i = page.getByLabel(`Menge ${TITLE[a]}`, { exact: true }); await i.fill(b); await i.blur(); }
    else if (kind === "row") { const i = page.getByTestId("bl-row").nth(a).getByLabel(FIELD[b], { exact: true }); await i.fill(c); await i.blur(); }
    else if (kind === "add") await page.getByRole("button", { name: "Weitere Position hinzufügen" }).click();
    else if (kind === "remove") await page.getByTestId("bl-row").nth(a).getByRole("button", { name: "Diese Zeile entfernen" }).click();
    else if (kind === "note") { const i = page.getByLabel("Hinweise / Notizen"); await i.fill(a); await i.blur(); }
    else if (kind === "payer") await page.getByText(a === "sz" ? "Selbstzahler" : "Kassenkunde", { exact: true }).first().click();
    else if (kind === "auf") { const i = page.getByLabel("Aufschlag in Prozent"); await i.fill(a); await i.blur(); }
    else throw new Error(`step not handled: ${kind}`);
    await page.waitForTimeout(500);
  }
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
  for (const [id, name] of Object.entries(CASES)) {
    if (only.length && !only.includes(id)) continue;
    const steps = S[name];
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
    const R = await run(() => (steps[0]?.[0] === "open" ? reactOpened(browser, steps, steps[0][1], L.draft) : react(browser, steps)));
    all[id] = { name, steps, legacy: L, react: R };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
    console.error(`${id} done`);
  }
  await browser.close();

  console.log("| case | today's UI total | React total | answer equal | request fields that differ (every section) | stored `bl` that differs |");
  console.log("|---|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | | |`); continue; }
    const a = diff(L.answer, R.answer, "answer"), q = diff(L.body, R.body, "request"), st = diff(L.stored?.bl, R.stored?.bl, "bl");
    const fmt = (d) => d.map(([p, x, y]) => `${p}: ${short(x)} → ${short(y)}`).join("<br>") || "—";
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${a.length ? `no: ${fmt(a)}` : "yes"} | ${fmt(q)} | ${fmt(st)} |`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
