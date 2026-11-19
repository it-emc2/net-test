// Does the winwall floor ("Wandverkleidung als Fußboden") PRICE the same in the React app as in
// today's view? For every case the same picks are made once in today's UI and once in the React app
// (each a new Badumbau offer). Cases with `open` start from an offer saved earlier: today's UI
// restores it (restoreConfiguratorFromOffer), the React app gets the same payload as its draft.
// Cases with `setup` play steps in today's UI first (e.g. the winwall simple view of the wall, not
// built in React yet) and hand the stored payload to the React app as its draft. The LAST
// `POST /api/price` of each is kept and compared: the answer field by field (totals, every line)
// and the request's `duschwanne` and `wandverkleidung` sections. Raw captures:
// ~/emc2-local/compare-fussboden-wand.json.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/compare-fussboden-wand-prices.cjs [case ids, e.g. "a f"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");
const cap = require("./capture-fussboden-wand.cjs");

const BASE = cap.BASE;
const OUT = path.join(os.homedir(), "emc2-local", "compare-fussboden-wand.json");
const W = [["on"], ["tab", "wall"], ["kind", "Gesamtes-Bad"]];
const REST_WW = [["goto", "Wandverkleidung"], ["wvon"], ["wvclassic"], ["wvwidth", "back", "170"], ["wvwall", "back"], ["wvdecor", "back", 7], ["goto", "Fussboden"]];
const STRIPS = [["goto", "Wandverkleidung"], ["wvon"], ["wvplate", "15"], ["wvplate", "15"], ["wvplate", "15"], ["wvheight", "200"], ["goto", "Fussboden"]];
// id: [name, { setup?: today's UI only, then handed over as the draft; open?: duschwanne fields of an older offer; steps: in both }]
const CASES = {
  a: ["one format (2,5 m² → 1 × 100×250)", { steps: [...W, ["area", "2,5"]] }],
  b: ["mixed formats via Vorschlag (4,5 m², +1 by hand, then ↻)", { steps: [...W, ["area", "4,5"], ["plate", "17", "+"], ["resync"]] }],
  c: ["plates by hand (4,5 m² + 1 × 150×250)", { steps: [...W, ["area", "4,5"], ["plate", "17", "+"]] }],
  d: ["floor from the wall's rest (classic wall plan, area 3, rest used)", { steps: [...REST_WW, ...W, ["area", "3"], ["rest"]] }],
  e: ["floor from the strips above the cladding height (added by today's UI, opened)", { setup: STRIPS, steps: [] }],
  f: ["strips floor opened, then a plate more", { setup: STRIPS, steps: [["plate", "13", "+"]] }],
  g: ["wall decor changed afterwards, floor follows (today's UI, opened)", { setup: [...STRIPS, ["goto", "Wandverkleidung"], ["wvcolor", "WS229"], ["confirm", "ok"], ["goto", "Fussboden"]], steps: [] }],
  h: ["wall decor changed afterwards in the classic wall plan (rest used before)", { steps: [...REST_WW, ...W, ["area", "3"], ["rest"], ["goto", "Wandverkleidung"], ["wvwall", "back"], ["wvdecor", "back", 3], ["goto", "Fussboden"]] }],
  i: ["old offer: only format + quantity (opened)", { open: cap.OLD, steps: [] }],
  j: ["old offer: a plate more", { open: cap.OLD, steps: [["plate", "15", "+"]] }],
  k: ["offer with wallCladdingWwQty (opened)", { open: cap.NEW, steps: [] }],
  l: ["wallCladdingWwQty hazard: a plate more", { open: cap.NEW, steps: [["plate", "17", "+"]] }],
  m: ["wallCladdingWwQty hazard: a plate less", { open: cap.NEW, steps: [["plate", "15", "-"]] }],
  n: ["wallCladdingWwQty hazard: Vorschlag (area 6)", { open: cap.NEW, steps: [["resync"]] }],
  o: ["wallCladdingWwQty hazard: other line", { open: cap.NEW, steps: [["sup", "hm"]] }],
};

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
async function context(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: cap.token, url: BASE }]);
  await ctx.addInitScript(() => { window.__toasts = []; window.showToast = (msg) => { window.__toasts.push(String(msg)); }; });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/planning/**", (r) => r.abort());
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const prices = [];
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() !== "POST" || new URL(res.url()).pathname !== "/api/price") return;
    try { prices.push({ body: JSON.parse(req.postData() || "null"), answer: await res.json() }); } catch { /* gone */ }
  });
  page.on("dialog", (d) => { d.accept().catch(() => {}); });
  return { ctx, page, prices };
}
async function settle(page, prices, quiet = 2500) { let n = -1; while (n !== prices.length) { n = prices.length; await page.waitForTimeout(quiet); } }

async function legacy(browser, c) {
  const { ctx, page, prices } = await context(browser);
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.setStep("Fussboden"));
    await page.waitForTimeout(500);
    const fresh = await page.evaluate(() => window.buildPayload());
    let draft = null;
    if (c.open) { draft = { ...fresh, duschwanne: { ...fresh.duschwanne, ...c.open } }; await cap.play(page, [["open", c.open], ["goto", "Fussboden"]]); }
    if (c.setup) { await cap.play(page, c.setup); await settle(page, prices); draft = await page.evaluate(() => window.buildPayload()); }
    await cap.play(page, c.steps);
    await page.evaluate(() => window.updatePricing?.()); // the last state of the page is priced
    await settle(page, prices);
    return { ...(prices.at(-1) ?? {}), draft, stored: await page.evaluate(() => window.buildPayload().duschwanne) };
  } finally { await ctx.close(); }
}

async function react(browser, c, draft) {
  const { ctx, page, prices } = await context(browser);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  if (draft) await page.route(`**/api/deals/${KEY}/draft`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "bu", payload: draft, updatedAt: "2026-11-18T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const WALLS = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
  const size = { 13: "100 × 205 cm", 15: "100 × 250 cm", 16: "125 × 250 cm", 17: "150 × 250 cm" };
  const go = async (step) => { await page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/bu/${step}`); await page.waitForTimeout(800); };
  try {
    await page.goto(`${BASE}/app/deal/${KEY}/bu/Fussboden`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Fußboden" }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    for (const [kind, a, b] of c.steps) {
      if (kind === "on" || kind === "off") await page.getByRole("switch", { name: "Fußboden", exact: true }).click();
      else if (kind === "tab") await page.getByRole("tab", { name: a === "wall" ? "Wandverkleidung als Fußboden" : "Fußboden", exact: true }).click();
      else if (kind === "kind") await page.getByRole("radio", { name: a === "Fehlstellen" ? "Nur Fehlstellen" : "Gesamter Badboden" }).click();
      else if (kind === "sup") await page.getByRole("group", { name: "Produktlinie wählen" }).getByRole("button", { name: a === "ww" ? /^winwall/ : /^VIGOUR/ }).click();
      else if (kind === "area") await page.getByLabel("Fläche (m²)").fill(a);
      else if (kind === "plate") await page.getByRole("button", { name: `${b === "-" ? "Weniger" : "Mehr"} ${size[a]}` }).click();
      else if (kind === "resync") await page.getByRole("button", { name: "↻ Vorschlag aus Fläche" }).click();
      else if (kind === "rest") await page.getByRole("switch", { name: "Reste aus Wandverkleidung anrechnen" }).click();
      else if (kind === "goto") await go(a);
      else if (kind === "wvon") await page.getByRole("switch", { name: "Wandverkleidung", exact: true }).click();
      else if (kind === "wvclassic") continue; // React's Wandverkleidung is the classic view
      else if (kind === "wvwidth") await page.getByLabel(`Breite ${WALLS[a]} in cm`).fill(b);
      else if (kind === "wvwall") await page.getByRole("button", { name: `Dekor für ${WALLS[a]} wählen` }).click();
      else if (kind === "wvdecor") await page.locator(`[data-testid="kc-wall"][data-wall="${a}"] [data-testid="kc-tiles"] button`).nth(Number(b) - 1).click();
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(500);
    }
    await settle(page, prices);
    return { ...(prices.at(-1) ?? {}) };
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
  if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null) && !((a === "" || a == null) && (b === "" || b == null))) out.push([at, a, b]);
  return out;
}
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "—" : s.length > 90 ? s.slice(0, 87) + "…" : s; };
const floorLines = (ans) => (ans?.lines || ans?.materials || []).filter?.((l) => /Aluverbund|Flächenkleber|R_4260602|^(WS|NW)\d{5}$/.test(`${l.label || l.name || ""} ${l.id || l.productId || ""}`)) ?? [];

(async () => {
  const only = process.argv.slice(2).join(" ").split(/[\s,]+/).filter(Boolean);
  let browser = await chromium.launch({ headless: true });
  const all = fs.existsSync(OUT) && only.length ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  for (const [id, [name, c]] of Object.entries(CASES)) {
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
    const L = await run(() => legacy(browser, c));
    const R = await run(() => react(browser, c, L.draft));
    all[id] = { name, case: c, legacy: L, react: R };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
    console.error(`${id} done`);
  }
  await browser.close();

  console.log("| case | today's UI total | React total | equal | differences (answer; request duschwanne / wandverkleidung) |");
  console.log("|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | |`); continue; }
    const d = diff(L.answer, R.answer, "answer");
    for (const sec of ["duschwanne", "wandverkleidung"]) diff((L.body || {})[sec], (R.body || {})[sec], `request.${sec}`, d);
    const answerDiffs = d.filter(([p]) => p.startsWith("answer"));
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${answerDiffs.length ? "no" : "yes"} | ${d.map(([p, a, b]) => `${p}: ${short(a)} → ${short(b)}`).join("<br>") || "—"} |`);
  }
  console.log("\nfloor lines (today's UI):");
  for (const [id, c] of Object.entries(all)) console.log(`  ${id}: ${floorLines(c.legacy?.answer).map((l) => `${l.id || l.productId} × ${l.qty ?? l.quantity}`).join(", ")} | wallCladdingWwQty ${c.legacy?.body?.duschwanne?.wallCladdingWwQty ?? "—"} → React ${c.react?.body?.duschwanne?.wallCladdingWwQty ?? "—"}`);
})().catch((e) => { console.error(e); process.exit(1); });
