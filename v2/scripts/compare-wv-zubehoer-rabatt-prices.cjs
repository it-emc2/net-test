// Do the winwall accessories (main ca43ed48) and the discount on reopening (main d0528418,
// b806c0e8) PRICE and STORE the same in the React app as in today's view? Same picks once in
// today's UI and once in the React app (each a new Badumbau offer).
//  - W cases (Wandverkleidung, classic editor): played in both. Hand-set accessory quantities,
//    rows changed afterwards, wall plan present / absent, sealing by wall area.
//  - R cases (Rabatt, reopened): the steps are played in today's UI, the offer is opened again there
//    (restoreConfiguratorFromOffer); the React app opens the SAME stored offer as its draft.
// The LAST `POST /api/price` of each is kept and compared: the answer field by field (totals, every
// line) and the request's `wandverkleidung` and `rabatt` sections; plus what the page stores in
// them at the end. Raw captures: ~/emc2-local/compare-wv-zubehoer-rabatt.json.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/compare-wv-zubehoer-rabatt-prices.cjs [case ids, e.g. "w1 r2"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const OUT = path.join(os.homedir(), "emc2-local", "compare-wv-zubehoer-rabatt.json");
const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();

const ON = ["on"], ROW = ["row+"];
const WALL = (w) => [["width", "back", w], ["wall", "back"], ["decor", "back", "WS229"]];
const U = [["sit", "u"], ["width", "links", "70"], ["width", "back", "161"], ["width", "rechts", "70"], ["kh", "55"], ["wall", "links"], ["decor", "links", "WS203"], ["same"]];
const BIG = ["big"], GRAB = ["grab"], YES = ["rabatt"];
// W: steps on Wandverkleidung · R: steps on other pages + Rabatt, then reopened
const CASES = {
  w1: ["no walls: profile set by hand (+), then a plate more", { wv: [ON, ROW, ["qty", 1, "+"], ["accqty", "WS80113", "+"], ["qty", 1, "+"]] }],
  w2: ["no walls: adhesive set by hand (−), then a row more", { wv: [ON, ROW, ["accqty", "R_4260602", "-"], ROW] }],
  w3: ["no walls: profile switched off, then a plate more", { wv: [ON, ROW, ["qty", 1, "+"], ["acc", "WS80113"], ["qty", 1, "+"]] }],
  w4: ["wall 180 cm: plan, then a plate more by hand (profiles from the plan, sealing = wall + extra plate)", { wv: [ON, ...WALL("180"), ["qty", 1, "+"]] }],
  w5: ["wall 180 cm: profile set by hand, then the width 280", { wv: [ON, ...WALL("180"), ["accqty", "WS80113", "+"], ["width", "back", "280"]] }],
  w6: ["wall 180 cm: adhesive set by hand, then the width 280", { wv: [ON, ...WALL("180"), ["accqty", "R_4260602", "-"], ["width", "back", "280"]] }],
  w7: ["U 70/161/70 × 55 cm (plan 2 × 100×205), a third plate by hand (WC box)", { wv: [ON, ...U, ["qty", 1, "+"]] }],
  w8: ["the same 3 plates without walls (no plan)", { wv: [ON, ROW, ["fmt", 1, "13"], ["qty", 1, "+"], ["qty", 1, "+"]] }],
  r1: ["Neukundenbonus ticked (eligible), reopened", { rb: [BIG, YES, ["b300"]] }],
  r2: ["Neukundenbonus ticked, total below the threshold, reopened", { rb: [BIG, YES, ["b300"], ["small"]] }],
  r3: ["free grab bar, reopened", { rb: [GRAB, YES, ["bgrab"]] }],
  r4: ["5 %, Neukundenbonus, free grab bar, reopened", { rb: [BIG, GRAB, YES, ["slider", "5"], ["b300"], ["bgrab"]] }],
};

const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
async function context(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
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
  const go = async (st) => { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(500); };
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1200);
    const P = "#page-Wandverkleidung", row = (n) => `#wvWwRows .wv-row:nth-child(${n})`, WID = { links: "wvKLinks", back: "wvKBack", rechts: "wvKRechts" };
    if (c.wv) {
      await go("Wandverkleidung");
      for (const [kind, a, b] of c.wv) {
        if (kind === "on") { await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click(); await page.waitForTimeout(500); if (await page.locator("#wvSimple .wvs-classic").isVisible()) await page.locator("#wvSimple .wvs-classic").click(); }
        else if (kind === "row+") await page.locator("#wvWwRowAdd").click();
        else if (kind === "qty") await page.locator(`${row(a)} > .wv-row__step [data-d="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "fmt") await page.locator(`${row(a)} > select.wv-ww-fmtsel`).selectOption(b);
        else if (kind === "acc") await page.locator(`#wvWwAccSection label.image-check:has(#wvWw_${a}) .sec-switch__track`).click();
        else if (kind === "accqty") await page.locator(`#wvWwAccSection .dw-acc:has(#wvWw_${a}) [data-step="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "sit") await page.locator(`#wvKeramicoCalc .kc-chip[data-sit="${a}"]`).click();
        else if (kind === "width") { await page.locator(`#${WID[a]}`).fill(b); await page.locator(`#${WID[a]}`).blur(); }
        else if (kind === "kh") { await page.locator("#wvKHoehe").fill(a); await page.locator("#wvKHoehe").blur(); }
        else if (kind === "wall") await page.locator(`#wvKeramicoCalc .kc-row[data-wall="${a}"] .kc-decor`).click();
        else if (kind === "decor") await page.locator(`#wvKeramicoCalc .kc-wall-body[data-body="${a}"] label.image-check:has(input[value="${b}"])`).click();
        else if (kind === "same") await page.locator("#wvKeramicoCalc .kc-wall-body:not([hidden]) .kc-all-same").click();
        else throw new Error(`wv step not handled: ${kind}`);
        await page.waitForTimeout(700);
      }
      await page.evaluate(() => window.updatePricing?.());
      await settle(page, prices);
      const p = await page.evaluate(() => window.buildPayload());
      return { ...(prices.at(-1) ?? {}), draft: null, stored: { wandverkleidung: p.wandverkleidung, rabatt: p.rabatt } };
    }
    const RP = "#page-Rabatt";
    for (const [kind, a] of c.rb) {
      if (kind === "big") { await go("Fussboden"); await page.locator("#page-Fussboden label.sec-switch:has(#fbMaster)").click(); await page.locator("#fbTabBtnWall").click(); await page.locator('#wcSupplierRow .wc-sup-btn[data-sup="hm"]').click(); await page.locator("#wallCladdingArea").fill("4,5"); await page.locator("#wallCladdingArea").blur(); await page.waitForTimeout(800); await page.locator('#wallCladdingCards .wvc-card[data-size="997"]').click(); await page.locator("#wallCladdingQtyInput").fill("40"); await page.locator("#wallCladdingQtyInput").blur(); }
      else if (kind === "small") { await go("Fussboden"); await page.locator("#wallCladdingQtyInput").fill("2"); await page.locator("#wallCladdingQtyInput").blur(); }
      else if (kind === "grab") { await go("Optional"); await page.evaluate(() => { const cb = document.getElementById("opt_CLPESG30"); if (!cb.checked) cb.click(); const f = document.getElementById("qty_CLPESG30"); f.value = "1"; f.dispatchEvent(new Event("input", { bubbles: true })); f.dispatchEvent(new Event("change", { bubbles: true })); }); }
      else if (kind === "rabatt") { await go("Rabatt"); await page.locator(`${RP} label:has(input[name="rb-add-rabatt"][value="ja"])`).click(); }
      else if (kind === "slider") { await go("Rabatt"); await page.evaluate((v) => { const el = document.getElementById("rb-material-discount"); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, a); }
      else if (kind === "b300") { await go("Rabatt"); await page.locator(`${RP} label:has(#rb-bonus-300)`).click(); }
      else if (kind === "bgrab") { await go("Rabatt"); await page.locator(`${RP} label:has(#rb-bonus-grab)`).click(); }
      else throw new Error(`rb step not handled: ${kind}`);
      await page.waitForTimeout(1300);
    }
    await settle(page, prices);
    const saved = await page.evaluate(() => window.buildPayload());
    const before = prices.at(-1);
    // opened again
    await page.evaluate(async (p) => { await window.restoreConfiguratorFromOffer({ payload: p }); }, saved);
    await page.waitForTimeout(2000);
    await go("Rabatt");
    await page.evaluate(() => window.updatePricing?.());
    await settle(page, prices);
    const p = await page.evaluate(() => window.buildPayload());
    return { ...(prices.at(-1) ?? {}), beforeReopen: before?.answer ? { total: before.answer.total, bonusGross: before.answer.bonusGross, flags: before.answer.flags } : null, draft: saved, stored: { wandverkleidung: p.wandverkleidung, rabatt: p.rabatt } };
  } finally { await ctx.close(); }
}

async function react(browser, c, draft) {
  const { ctx, page, prices } = await context(browser);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  if (draft) await page.route(`**/api/deals/${KEY}/draft`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "bu", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const WALLS = { links: "Linke Wand", back: "Rückwand", rechts: "Rechte Wand" };
  const SIT = { wand: "Eine Wand", ecke: "Ecke", u: "Nische / U-Form" };
  const CAPTION = { WS80110: "Abschlussprofil", WS80111: "Inneneckprofil", WS80112: "Außeneckprofil", WS80113: "Verbindungsprofil", R_4260602: "Flächenkleber Ramsauer 645" };
  const step = c.wv ? "Wandverkleidung" : "Rabatt";
  try {
    await page.goto(`${BASE}/app/deal/${KEY}/bu/${step}`, { waitUntil: "load" });
    await page.getByRole("heading", { name: c.wv ? "Wandverkleidung" : "Übersicht" }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    for (const [kind, a, b] of c.wv || []) {
      if (kind === "on") await page.getByRole("switch", { name: "Wandverkleidung", exact: true }).click();
      else if (kind === "row+") await page.getByRole("button", { name: "Zeile hinzufügen (Dekor und Format)" }).click();
      else if (kind === "qty") await page.getByRole("button", { name: `Zeile ${a}: ${b === "+" ? "mehr" : "weniger"}` }).click();
      else if (kind === "fmt") await page.getByLabel(`Format Zeile ${a}`).selectOption(b);
      else if (kind === "acc") await page.locator(`[data-testid="wv-acc-${a}"] input[type="checkbox"]`).click();
      else if (kind === "accqty") await page.getByRole("button", { name: `Menge ${CAPTION[a]}: ${b === "+" ? "mehr" : "weniger"}` }).click();
      else if (kind === "sit") await page.getByRole("group", { name: "Wandsituation" }).getByRole("button", { name: SIT[a] }).click();
      else if (kind === "width") await page.getByLabel(`Breite ${WALLS[a]} in cm`).fill(b);
      else if (kind === "kh") await page.getByLabel("Höhe der Verkleidung").fill(a);
      else if (kind === "wall") await page.getByRole("button", { name: `Dekor für ${WALLS[a]} wählen` }).click();
      else if (kind === "decor") await page.locator(`[data-testid="kc-wall"][data-wall="${a}"] [data-testid="kc-tiles"] button[data-value="${b}"]`).click();
      else if (kind === "same") await page.getByRole("button", { name: "Alle Wände gleiches Dekor" }).click();
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
const LINE = /^(R_4260602|WS8\d{4}|WS-ZUSCHNITT|(WS|NW)\d{5}|CLPESG\d+)$/;
const lines = (ans) => [...(ans?.materials?.lines || []), ...(ans?.optionalDisplayUI?.lines || [])].filter((l) => LINE.test(String(l.productId || l.id || ""))).map((l) => `${l.productId || l.id} × ${l.qty}`);

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

  console.log("| case | today's UI total | React total | equal | differences (answer; request wandverkleidung / rabatt) |");
  console.log("|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | |`); continue; }
    const d = diff(L.answer, R.answer, "answer");
    for (const sec of ["wandverkleidung", "rabatt"]) diff((L.body || {})[sec], (R.body || {})[sec], `request.${sec}`, d);
    const answerDiffs = d.filter(([p]) => p.startsWith("answer"));
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${answerDiffs.length ? "no" : "yes"} | ${d.map(([p, a, b]) => `${p}: ${short(a)} → ${short(b)}`).join("<br>") || "—"} |`);
  }
  console.log("\naccessory / bonus lines and request fields (today's UI → React):");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {}, lw = L.body?.wandverkleidung || {}, rw = R.body?.wandverkleidung || {}, lr = L.body?.rabatt || {}, rr = R.body?.rabatt || {};
    const f = (w, r) => (id.startsWith("w") ? `WS80113 ${w.wvWwQty_WS80113} · R_4260602 ${w.wvWwQty_R_4260602} · manual "${w.wvWwAccManual ?? ""}"` : `bonus300 ${r.bonus300} · bonusGrab ${r.bonusGrab} · flags.bonus_neu`);
    console.log(`  ${id}: ${lines(L.answer).join(", ")} | ${f(lw, lr)}${id.startsWith("r") ? ` ${L.answer?.flags?.bonus_neu} · bonusGross ${L.answer?.bonusGross} (before reopen: total ${L.beforeReopen?.total}, bonusGross ${L.beforeReopen?.bonusGross})` : ""}`);
    console.log(`  ${" ".repeat(id.length)}  ${lines(R.answer).join(", ")} | ${f(rw, rr)}${id.startsWith("r") ? ` ${R.answer?.flags?.bonus_neu} · bonusGross ${R.answer?.bonusGross}` : ""}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
