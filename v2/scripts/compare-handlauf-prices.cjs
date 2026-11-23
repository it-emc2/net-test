// Does the React app PRICE and STORE a Handlauf the same as today's view? The same taps once in
// today's UI and once in the React app (steps Arbeiten and Handläufe), each a new Handlauf offer —
// or a stored offer opened again (today's UI: restoreConfiguratorFromOffer; React: the SAME stored
// offer as the deal's draft). Kept and compared: the LAST `POST /api/price` — its answer field by
// field and EVERY field of its request — and what the page stores in `hl` at the end (today:
// buildPayload, React: the last draft it saved; an offer opened and not changed: the stored offer).
// Raw: ~/emc2-local/compare-handlauf.json.
//
//   (own server on :3002 with the React build, see the port-slice skill)
//   node v2/scripts/compare-handlauf-prices.cjs [case ids, e.g. "c1 c12"]
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");
const OLD = require("../apps/web/test/fixtures/hl-old-offers.json").offers;

const BASE = process.env.CAPTURE_BASE || "http://localhost:3002";
const OUT = path.join(os.homedir(), "emc2-local", "compare-handlauf.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const token = (() => { const p = `${Date.now() + 3600e3}:capture@local.test`; return Buffer.from(p).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(p).digest("hex"); })();

const IN = ["area", "inside"], OUT_ = ["area", "outside"];
// steps as in capture-handlauf-konfigurator.cjs, plus ["open", id of hl-old-offers.json] first, ["notask"], ["task", text]
const CASES = {
  c1: ["new offer, nothing chosen", []],
  c2: ["Flexofit innen: Alu tube 3 m", [IN, ["tube", "FF_51"], ["qty", "FF_51", "3"]]],
  c3: ["Flexofit innen: Alu 2.5 m + Chrom matt holder ×4 + wall bow", [IN, ["tube", "FF_51"], ["qty", "FF_51", "2.5"], ["finish", "Chrom matt"], ["fit", "FF_H04"], ["qty", "FF_H04", "4"], ["fit", "FF_W04"]]],
  c4: ["Flexofit innen: steel 5 m + Schwarz holder ×6", [IN, ["tab", "Stahlrohr 35mm"], ["tube", "FF_01"], ["qty", "FF_01", "5"], ["finish", "Schwarz"], ["fit", "FF_H02"], ["qty", "FF_H02", "6"]]],
  c5: ["Flexofit innen: Massivholz 2", [IN, ["tab", "Massivholz"], ["tube", "FF_31"], ["qty", "FF_31", "2"]]],
  c6: ["Flexofit außen: Edelstahl 4 m, support ×3, holder", [OUT_, ["tube", "FF_69"], ["qty", "FF_69", "4"], ["fit", "FF_E01"], ["qty", "FF_E01", "3"], ["fit", "FF_H07"]]],
  c7: ["Sonderprodukt 12,5 × 2", [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Sonderhalter"], ["sonder", 0, "price", "12,5"], ["sonder", 0, "articleId", "SH-1"], ["qty", "sonder:0", "2"]]],
  c8: ["two configurations", [IN, ["tube", "FF_51"], ["rename", "Treppe"], ["add"], OUT_, ["tube", "FF_69"], ["qty", "FF_69", "3"]]],
  c9: ["second configuration removed", [IN, ["tube", "FF_51"], ["add"], OUT_, ["tube", "FF_69"], ["remove", 2]]],
  c10: ["handrail task off, free task", [IN, ["tube", "FF_51"], ["notask"], ["task", "Alten Handlauf demontieren"]]],
  c11: ["old page: logistics + free items, opened", [["open", "drafts-hl-KK-f8ba40"]]],
  c12: ["old page: logistics + free items, a tube added", [["open", "drafts-hl-KK-f8ba40"], IN, ["tube", "FF_51"], ["qty", "FF_51", "2"]]],
  c13: ["old page, oldest version (tick cards), opened", [["open", "offers-hl-KK-367e1d"]]],
  c14: ["configurator offer, opened", [["open", "drafts-hl-KK-bdd82d"]]],
  c15: ["configurator offer, a fitting more", [["open", "offers-hl-KK-e04d66"], ["finish", "__keep__"], ["fitAny"]]],
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
async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/planning/**", (r) => r.abort());
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  return { ctx, page };
}

async function legacy(browser, steps) {
  const { ctx, page } = await newCtx(browser);
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  const { prices } = watch(page);
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.locator('.tile-btn[data-step="HL-Handlauf"]').click();
    await page.waitForFunction(() => location.hash === "#Kundendaten");
    await page.waitForTimeout(1200);
    let rest = steps;
    if (steps[0]?.[0] === "open") {
      await page.evaluate(async (p) => { await window.restoreConfiguratorFromOffer({ payload: p }); }, OLD[steps[0][1]].payload);
      await page.waitForTimeout(2500); rest = steps.slice(1);
    }
    const P = "#page-hlk", go = async (s) => { if ((await page.evaluate(() => location.hash)) !== `#${s}`) { await page.evaluate((x) => window.setStep(x), s); await page.waitForTimeout(500); } };
    const change = async (sel, value) => { await page.locator(sel).first().evaluate((n, v) => { n.value = v; n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); }, String(value)); };
    const STEP_OF = { area: "area", tab: "rohr", tube: "rohr", sonderAdd: "rohr", sonder: "rohr", finish: "beschlaege", fit: "beschlaege", fitAny: "beschlaege" };
    const keySel = (attr, id) => id.startsWith("sonder:") ? `[${attr}][data-key="__sonder__:${id.slice(7)}"]` : `[${attr}][data-key*="::${id}::"]`;
    for (const [kind, a, b, c] of rest) {
      if (kind === "notask") { await go("hlArbeiten"); await page.locator('#page-hlArbeiten label.task-card:has(input[value="deliver_install_hl_handrail"])').click(); continue; }
      if (kind === "task") { await go("hlArbeiten"); const t = page.locator("#page-hlArbeiten #hl-extra-tasks textarea").first(); await t.fill(a); await t.blur(); continue; }
      await go("hlk");
      if (STEP_OF[kind]) { const s = page.locator(`${P} .hl-wiz__leaf-step`).nth(["area", "rohr", "beschlaege"].indexOf(STEP_OF[kind])); if (!(await s.evaluate((n) => n.classList.contains("is-open")))) await s.locator("[data-toggle-step]").click(); }
      if (kind === "area") await page.locator(`${P} [data-pick-area="${a}"]`).click();
      else if (kind === "tab") await page.locator(`${P} [data-tube-tab="${a}"]`).click();
      else if (kind === "tube") await page.locator(`${P} [data-tube*="::${a}::"]`).first().click();
      else if (kind === "finish") { if (a !== "__keep__") await page.locator(`${P} [data-finish="${a}"]`).click(); }
      else if (kind === "fit") await page.locator(`${P} [data-fit*="::${a}::"]`).first().click();
      else if (kind === "fitAny") await page.locator(`${P} .hl-wiz__pick[data-fit]:not(.is-selected)`).first().click();
      else if (kind === "qty") await change(`#hlWizLedger ${keySel("data-ledger-qty", a)}`, b);
      else if (kind === "sonderAdd") await page.locator(`${P} [data-sonder-add]`).click();
      else if (kind === "sonder") await change(`${P} [data-sonder-${{ name: "name", price: "price", articleId: "article", qty: "qty" }[b]}][data-idx="${a}"]`, c);
      else if (kind === "add") await page.locator(`${P} [data-add-config]`).click();
      else if (kind === "remove") { await page.locator(`${P} .hl-wiz__rail-item`).nth(a - 1).locator("[data-remove-config]").click(); await page.locator("#appConfirmOverlay.visible button", { hasText: "Ja, entfernen" }).click(); }
      else if (kind === "rename") await change(`${P} [data-rename-config]`, a);
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.updatePricing?.());
    await settle(page, prices);
    const p = await page.evaluate(() => window.buildPayload());
    return { ...(prices.at(-1) ?? {}), stored: { hl: p.hl } };
  } finally { await ctx.close(); }
}

async function react(browser, steps) {
  const { ctx, page } = await newCtx(browser);
  const { prices, drafts } = watch(page);
  const KEY = "t-" + crypto.randomBytes(12).toString("hex");
  const draft = steps[0]?.[0] === "open" ? OLD[steps[0][1]].payload : null;
  if (draft) await page.route(`**/api/deals/${KEY}/draft*`, (r) => (r.request().method() === "GET" ? r.fulfill(json({ dealId: KEY, revision: 1, offerType: "hl", payload: draft, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: "capture@local.test" })) : r.continue()));
  const TITLE = { hlk: "Handläufe", hlArbeiten: "Auszuführende Arbeiten" };
  let at = "";
  const go = async (step) => {
    if (at === step) return;
    if (!at) await page.goto(`${BASE}/app/deal/${KEY}/hl/${step}`, { waitUntil: "load" });
    else await page.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); }, `/app/deal/${KEY}/hl/${step}`);
    await page.getByRole("heading", { name: TITLE[step], exact: true }).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800); at = step;
  };
  try {
    const rest = draft ? steps.slice(1) : steps;
    await go("hlk");
    const stepBox = (k) => page.getByTestId(`hl-step-${k}`);
    const STEP_OF = { area: "area", tab: "rohr", tube: "rohr", sonderAdd: "rohr", sonder: "rohr", finish: "beschlaege", fit: "beschlaege", fitAny: "beschlaege" };
    const line = (id) => page.getByTestId("hl-ledger").locator(id.startsWith("sonder:") ? `tr[data-kind="sonder"][data-key="${id.slice(7)}"]` : `tr[data-key*="::${id}::"]`);
    const commit = async (loc, v) => { await loc.fill(String(v)); await loc.blur(); };
    for (const [kind, a, b, c] of rest) {
      if (kind === "notask") { await go("hlArbeiten"); await page.getByRole("checkbox", { name: "Liefern und Montieren der nachfolgend aufgeführten Handläufe" }).click(); continue; }
      if (kind === "task") { await go("hlArbeiten"); await commit(page.getByLabel("Zusätzliche Aufgabe").first(), a); continue; }
      await go("hlk");
      if (STEP_OF[kind]) { const head = stepBox(STEP_OF[kind]).getByRole("button").first(); if ((await head.getAttribute("aria-expanded")) !== "true") await head.click(); }
      if (kind === "area") await stepBox("area").getByRole("button", { name: new RegExp(`^${a === "inside" ? "Innenbereich" : "Außenbereich"}`) }).click();
      else if (kind === "tab") await stepBox("rohr").getByRole("group", { name: "Material" }).getByRole("button", { name: a === "__sonder__" ? /^Sonderprodukt( \(\d+\))?$/ : new RegExp(`^${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( \\(\\d+\\))?$`) }).click();
      else if (kind === "tube") await page.getByTestId("hl-tube").filter({ hasText: `${a} ·` }).first().click();
      else if (kind === "finish") { if (a !== "__keep__") await stepBox("beschlaege").getByRole("group", { name: "Oberfläche" }).getByRole("button", { name: a, exact: true }).click(); }
      else if (kind === "fit") await page.getByTestId("hl-fitting").filter({ hasText: `${a} ·` }).first().click();
      else if (kind === "fitAny") await page.locator('[data-testid="hl-fitting"][aria-pressed="false"]').first().click();
      else if (kind === "qty") await commit(line(a).getByRole("spinbutton"), b);
      else if (kind === "sonderAdd") await page.getByRole("button", { name: "Sonderprodukt hinzufügen" }).click();
      else if (kind === "sonder") await commit(page.getByTestId("hl-sonder").getByLabel({ name: "Bezeichnung", price: "Preis netto", articleId: "Artikel-ID", qty: "Menge" }[b], { exact: true }).nth(a), c);
      else if (kind === "add") await page.getByRole("button", { name: "Weitere Konfiguration" }).click();
      else if (kind === "remove") { await page.getByTestId("hl-rail").getByRole("button", { name: /entfernen$/ }).nth(a - 1).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Ja, entfernen" }).click(); }
      else if (kind === "rename") await commit(page.getByLabel("Name der Konfiguration"), a);
      else throw new Error(`step not handled: ${kind}`);
      await page.waitForTimeout(500);
    }
    await settle(page, prices);
    await page.waitForTimeout(3000); // the draft is saved a moment after the last change
    const last = drafts.at(-1)?.payload ?? drafts.at(-1) ?? draft ?? {};
    return { ...(prices.at(-1) ?? {}), stored: { hl: last.hl }, saved: drafts.length };
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
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "—" : s.length > 70 ? s.slice(0, 67) + "…" : s; };

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
    const R = await run(() => react(browser, steps));
    all[id] = { name, steps, legacy: L, react: R };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
    console.error(`${id} done`);
  }
  await browser.close();

  console.log("| case | today's UI total | React total | answer equal | request fields that differ | stored hl that differs |");
  console.log("|---|---|---|---|---|---|");
  for (const [id, c] of Object.entries(all)) {
    const L = c.legacy || {}, R = c.react || {};
    if (L.error || R.error || !L.answer || !R.answer) { console.log(`| ${id} ${c.name} | ${L.error || (L.answer ? L.answer.total : "no price call")} | ${R.error || (R.answer ? R.answer.total : "no price call")} | not run | | |`); continue; }
    const a = diff(L.answer, R.answer, "answer"), q = diff(L.body, R.body, "request"), st = diff(L.stored?.hl, R.stored?.hl, "hl");
    const fmt = (d) => d.map(([p, x, y]) => `${p}: ${short(x)} → ${short(y)}`).join("<br>") || "—";
    console.log(`| ${id} ${c.name} | ${L.answer.total} | ${R.answer.total} | ${a.length ? `no (${a.length})` : "yes"} | ${fmt(q)} | ${fmt(st)} |`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
