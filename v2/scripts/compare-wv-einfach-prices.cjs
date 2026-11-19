// Does the winwall simple view of the Wandverkleidung (main sync item 2) PRICE and STORE the same in
// the React app as in today's view? The same steps (capture-wv-einfach.cjs) once in today's UI and
// once in the React app, each a new Badumbau offer. Cases that start with a reopened offer: today's
// UI restores it (restoreConfiguratorFromOffer) and the React app opens the SAME stored offer as its draft.
// Kept and compared: the LAST `POST /api/price` — its answer field by field (totals, every line)
// and EVERY field of its request — and what the page stores in `wandverkleidung` / `duschwanne` at
// the end (today: buildPayload, React: the last draft it saved). Raw: ~/emc2-local/compare-wv-einfach.json.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/compare-wv-einfach-prices.cjs [case ids, e.g. "c1 c12"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");
const cap = require("./capture-wv-einfach.cjs");

const BASE = cap.BASE;
const OUT = path.join(os.homedir(), "emc2-local", "compare-wv-einfach.json");
const S = cap.SCENARIOS;
const CASES = {
  c1: "one plate 100 × 250", c2: "plates in all four formats", c3: "another decor", c4: "decor without a tile (NW 230)", c5: "a second decor",
  c6: "chip switched, plates of the first decor", c7: "typed article number 23013", c8: "typed plain colour WS 023", c9: "height 230 cm",
  c10: "accessory set by hand, then a plate", c11: "classic and back to the simple view", c12: "line VIGOUR and back",
  c13: "floor: added from the rest", c14: "floor: added, then the wall decor changes", c15: "floor: area typed, wall decor changes (yes)",
  c16: "floor: rest used up by a lower height", c17: "reopened: simple offer, a plate more", c18: "reopened: invalid row, plate more keeps it",
  c19: "reopened: classic offer to the simple view",
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

async function legacy(browser, steps) {
  const { ctx, page } = await cap.newPage(browser);
  const { prices } = watch(page);
  try {
    let draft = null, rest = steps;
    if (steps[0]?.[0] === "open") { await cap.play(page, [steps[0]]); draft = await page.evaluate(() => window.buildPayload()); rest = steps.slice(1); }
    await cap.play(page, rest);
    await page.evaluate(() => window.updatePricing?.());
    await settle(page, prices);
    const p = await page.evaluate(() => window.buildPayload());
    return { ...(prices.at(-1) ?? {}), draft, stored: { wandverkleidung: p.wandverkleidung, duschwanne: p.duschwanne } };
  } finally { await ctx.close(); }
}

const SIZE = { 13: "100 × 205 cm", 15: "100 × 250 cm", 16: "125 × 250 cm", 17: "150 × 250 cm" };
const LINE = { ww: /^winwall/, premium: /^VIGOUR/, standard: /^Badolux/ };
async function react(browser, steps, draft) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: cap.token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const { prices, drafts } = watch(page);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  if (draft) await page.route(`**/api/deals/${KEY}/draft`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "bu", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const go = async (step) => { await page.goto(`${BASE}/app/deal/${KEY}/bu/${step}`, { waitUntil: "load" }); await page.getByRole("heading", { name: step === "Fussboden" ? "Fußboden" : step }).first().waitFor({ timeout: 30000 }); await page.waitForTimeout(600); };
  try {
    await go("Wandverkleidung");
    for (const [kind, a, b] of draft ? steps.slice(1) : steps) {
      const wvs = page.getByTestId("wvs");
      if (kind === "on" || kind === "off") await page.getByRole("switch", { name: "Wandverkleidung", exact: true }).click();
      else if (kind === "plate") await wvs.getByRole("button", { name: `${b === "-" ? "Weniger" : "Mehr"} ${SIZE[a]}` }).click();
      else if (kind === "color") await page.locator(`[data-testid="wvs-colors"] [role="radio"][data-code="${a}"]`).click();
      else if (kind === "tab") await page.getByTestId("wvs-tab").nth(a - 1).click();
      else if (kind === "add") await page.getByRole("button", { name: "+ weiteres Dekor" }).click();
      else if (kind === "other") { await page.getByLabel("Anderes Dekor").click(); await page.getByLabel("Anderes Dekor").pressSequentially(a, { delay: 60 }); }
      else if (kind === "height") { const el = page.getByLabel(/^Höhe der Verkleidung/); await el.fill(a); await el.blur(); }
      else if (kind === "classic") await page.getByRole("button", { name: "Alter Konfigurator (Wandplan, Zeilen)" }).click();
      else if (kind === "simple") await page.getByRole("button", { name: "Zur neuen Ansicht wechseln (Platten + Dekor)" }).click();
      else if (kind === "lineopen") await page.getByTestId("wv-line-row").click();
      else if (kind === "line") await page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: LINE[a] }).click();
      else if (kind === "acc") await page.locator(`[data-testid="wv-acc-${a}"] input[type="checkbox"]`).click();
      else if (kind === "confirm") await page.getByTestId("wv-ask").getByRole("button").nth(a === "ok" ? 0 : 1).click();
      else if (kind === "goto") { // inside the app (the offer and what the page remembers stay)
        await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bu/${a}`);
        await page.getByRole("heading", { name: a === "Fussboden" ? "Fußboden" : a }).first().waitFor({ timeout: 30000 });
      }
      else if (kind === "fbon") await page.getByRole("switch", { name: "Fußboden", exact: true }).click();
      else if (kind === "fbwall") await page.getByRole("tab", { name: "Wandverkleidung als Fußboden" }).click();
      else if (kind === "fbarea") { await page.getByLabel("Fläche (m²)").fill(a); await page.getByLabel("Fläche (m²)").blur(); }
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(500);
    }
    await settle(page, prices);
    await page.waitForTimeout(3000); // the draft is saved a moment after the last change
    const last = drafts.at(-1)?.payload ?? drafts.at(-1) ?? {};
    return { ...(prices.at(-1) ?? {}), stored: { wandverkleidung: last.wandverkleidung, duschwanne: last.duschwanne } };
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
  for (const [id, name] of Object.entries(CASES)) {
    if (only.length && !only.includes(id)) continue;
    const steps = S[name].filter(([k]) => k !== "next");
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

  console.log("| case | today's UI total | React total | answer equal | request fields that differ (every section) | stored wandverkleidung / duschwanne that differ |");
  console.log("|---|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | | |`); continue; }
    const a = diff(L.answer, R.answer, "answer"), q = diff(L.body, R.body, "request");
    const st = [...diff(L.stored?.wandverkleidung, R.stored?.wandverkleidung, "wv"), ...diff(L.stored?.duschwanne, R.stored?.duschwanne, "dw")];
    const fmt = (d) => d.map(([p, x, y]) => `${p}: ${short(x)} → ${short(y)}`).join("<br>") || "—";
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${a.length ? `no: ${fmt(a)}` : "yes"} | ${fmt(q)} | ${fmt(st)} |`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
