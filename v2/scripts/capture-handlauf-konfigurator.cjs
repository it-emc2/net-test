// Records what today's UI stores and shows on the step "Handläufe" (hlk) of Handlauf: the Flexofit
// configurator (configurations, area, tube & colour, finish, fittings, Sonderprodukte, the position
// list), the note — the reference for apps/web/test/hl-konfigurator.test.tsx. The v2 add-ons are
// blocked. Also stores the Flexofit product list the page loaded (the configurator's model).
// RESUME=1 continues an interrupted run; ONLY=<name> records one scenario.
//
//   (server up — own server on :3002, see the port-slice skill)
//   node v2/scripts/capture-handlauf-konfigurator.cjs   → v2/apps/web/test/fixtures/hl-konfigurator.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3002";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "hl-konfigurator.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

// acts: ["area", "inside"|"outside"] · ["tab", family|"__sonder__"] · ["tube", productId] · ["finish", name] · ["fit", productId]
//  · ["qty", productId|"sonder:<i>", value] (position list) · ["del", productId|"sonder:<i>"] (position list)
//  · ["sonderAdd"] · ["sonder", i, "name"|"price"|"articleId"|"qty", value] · ["sonderDel", i]
//  (an act inside a collapsed step first taps its header to open it)
//  · ["add"] configuration · ["select", n] (1-based) · ["remove", n] / ["keep", n] (the in-page question „Konfiguration entfernen?“ answered „Ja, entfernen“ / „Nein, behalten“) · ["rename", text] · ["toggle", "area"|"rohr"|"beschlaege"] · ["note", text]
const IN = ["area", "inside"], OUT_ = ["area", "outside"];
const SCENARIOS = {
  "opened, nothing changed": [],
  "area innen": [IN],
  "area außen": [OUT_],
  "innen: Alu tube": [IN, ["tube", "FF_51"]],
  "innen: Alu tube, 3.5 m": [IN, ["tube", "FF_51"], ["qty", "FF_51", "3.5"]],
  "innen: Alu tube, picked again (cleared)": [IN, ["tube", "FF_51"], ["tube", "FF_51"]],
  "innen: tube changed keeps the metres": [IN, ["tube", "FF_51"], ["qty", "FF_51", "4"], ["tube", "FF_52"]],
  "innen: Stahl tab, steel tube": [IN, ["tab", "Stahlrohr 35mm"], ["tube", "FF_01"]],
  "innen: Massivholz": [IN, ["tab", "Massivholz"], ["tube", "FF_31"], ["qty", "FF_31", "2"]],
  "innen: Zuschnitt is no tube": [IN, ["tab", "Stahlrohr 35mm"]],
  "innen: finish Chrom matt": [IN, ["finish", "Chrom matt"]],
  "innen: finish + two fittings": [IN, ["tube", "FF_51"], ["finish", "Chrom matt"], ["fit", "FF_H04"], ["fit", "FF_W04"]],
  "innen: fitting quantity 6": [IN, ["finish", "Chrom matt"], ["fit", "FF_H04"], ["qty", "FF_H04", "6"]],
  "innen: fitting quantity 0 removes it": [IN, ["finish", "Chrom matt"], ["fit", "FF_H04"], ["qty", "FF_H04", "0"]],
  "innen: fitting picked twice (off)": [IN, ["finish", "Chrom matt"], ["fit", "FF_H04"], ["fit", "FF_H04"]],
  "innen: other finish clears the fittings": [IN, ["finish", "Chrom matt"], ["fit", "FF_H04"], ["finish", "Schwarz"]],
  "innen: same finish again keeps the fittings": [IN, ["finish", "Chrom matt"], ["fit", "FF_H04"], ["finish", "Chrom matt"]],
  "innen: line removed in the list": [IN, ["tube", "FF_51"], ["finish", "Chrom matt"], ["fit", "FF_H04"], ["del", "FF_51"]],
  "außen: tube + fittings": [OUT_, ["tube", "FF_69"], ["qty", "FF_69", "2.5"], ["fit", "FF_H07"], ["fit", "FF_E01"], ["qty", "FF_E01", "3"]],
  "area changed clears tube and fittings": [IN, ["tube", "FF_51"], ["finish", "Chrom matt"], ["fit", "FF_H04"], OUT_],
  "same area again clears too": [IN, ["tube", "FF_51"], IN],
  "Sonderprodukt complete": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Sonderhalter"], ["sonder", 0, "price", "12,5"], ["sonder", 0, "articleId", "SH-1"]],
  "Sonderprodukt without article id": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Montagekleber"], ["sonder", 0, "price", "8"]],
  "Sonderprodukt price 1.234,50": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Teuer"], ["sonder", 0, "price", "1.234,50"]],
  "Sonderprodukt qty 3 in the list": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Rosette"], ["sonder", 0, "price", "4"], ["qty", "sonder:0", "3"]],
  "Sonderprodukt qty 0 in the list": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "Rosette"], ["sonder", 0, "price", "4"], ["qty", "sonder:0", "0"]],
  "two Sonderprodukte, first removed": [IN, ["tab", "__sonder__"], ["sonderAdd"], ["sonder", 0, "name", "A"], ["sonder", 0, "price", "1"], ["sonderAdd"], ["sonder", 1, "name", "B"], ["sonder", 1, "price", "2"], ["sonderDel", 0]],
  "second configuration außen": [IN, ["tube", "FF_51"], ["add"], OUT_, ["tube", "FF_69"]],
  "second configuration, back to the first": [IN, ["tube", "FF_51"], ["add"], OUT_, ["select", 1]],
  "second configuration removed": [IN, ["tube", "FF_51"], ["add"], OUT_, ["tube", "FF_69"], ["remove", 2]],
  "remove asked, kept": [IN, ["add"], ["keep", 1]],
  "first configuration removed, next added": [IN, ["add"], OUT_, ["tube", "FF_69"], ["remove", 1], ["add"]],
  "renamed": [IN, ["tube", "FF_51"], ["rename", "Treppe Keller"]],
  "renamed to empty keeps the name": [IN, ["tube", "FF_51"], ["rename", "  "]],
  "step header toggled": [["toggle", "rohr"], ["toggle", "area"]],
  "note typed": [["note", "Montage nur vormittags"]],
};

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base, now) => Object.fromEntries([...new Set([...Object.keys(base || {}), ...Object.keys(now || {})])]
  .filter((k) => !same((base || {})[k], (now || {})[k])).map((k) => [k, k in (now || {}) ? now[k] : "<removed>"]));
module.exports = { SCENARIOS };
if (require.main !== module) return;

/** what the page shows (texts and state) */
function viewOf() {
  const P = document.getElementById("page-hlk"), t = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
  const rail = [...P.querySelectorAll(".hl-wiz__rail-item")].map((r) => ({ name: t(r.querySelector("strong")), summary: t(r.querySelector(".hl-wiz__rail-name span")), complete: !r.querySelector(".hl-wiz__rail-dot").classList.contains("is-incomplete"), active: r.classList.contains("is-active"), removable: !r.querySelector("[data-remove-config]").disabled }));
  const steps = [...P.querySelectorAll(".hl-wiz__leaf-step")].map((s) => ({ title: t(s.querySelector(".hl-wiz__leaf-title")), value: t(s.querySelector(".hl-wiz__leaf-value")), done: s.classList.contains("is-done"), open: s.classList.contains("is-open") }));
  const openBody = [...P.querySelectorAll(".hl-wiz__leaf-step.is-open .hl-wiz__leaf-body")];
  const body = openBody.map((b) => ({
    hints: [...b.querySelectorAll(".hl-wiz__hint, .hl-wiz__empty")].map(t),
    chips: [...b.querySelectorAll(".hl-wiz__finish")].map((c) => ({ text: t(c), on: c.classList.contains("is-selected") })),
    cards: [...b.querySelectorAll(".hl-wiz__card")].map((c) => ({ title: t(c.querySelector(".hl-wiz__card-title")), sub: t(c.querySelector(".hl-wiz__card-sub")), on: c.classList.contains("is-selected") })),
    picks: [...b.querySelectorAll(".hl-wiz__pick")].map((c) => ({ name: t(c.querySelector(".hl-wiz__pick-name")), meta: t(c.querySelector(".hl-wiz__pick-meta")), on: c.classList.contains("is-selected") })),
    sonder: [...b.querySelectorAll(".hl-wiz__sonder-row")].map((r) => [...r.querySelectorAll("input")].map((i) => i.value)),
  }));
  const L = document.getElementById("hlWizLedger");
  return {
    rail, name: P.querySelector("[data-rename-config]")?.value ?? "", status: t(P.querySelector(".hl-wiz__status-pill")), steps, body,
    ledger: {
      title: t(L.querySelector(".hl-wiz__section-title")), count: t(L.querySelector(".hl-wiz__ledger-head .muted")),
      rows: [...L.querySelectorAll("tbody tr")].filter((r) => r.querySelector("[data-ledger-qty]")).map((r) => ({ name: t(r.querySelector(".hl-wiz__ledger-name")), sub: t(r.querySelector(".hl-wiz__ledger-sub")), qty: r.querySelector("[data-ledger-qty]").value, unit: t(r.querySelector(".hl-wiz__ledger-qty")).trim(), price: t(r.children[2]), total: t(r.children[3]) })),
      empty: t(L.querySelector("tbody .hl-wiz__empty")), total: t(L.querySelector("tfoot td.num")),
    },
  };
}

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-handlauf-konfigurator.cjs — do not edit", base: null, products: null, scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if ((process.env.RESUME || process.env.ONLY) && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  if (process.env.ONLY) out.scenarios = out.scenarios.filter((x) => x.name !== process.env.ONLY);
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (process.env.ONLY && name !== process.env.ONLY)) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      let products = null;
      page.on("response", async (res) => { if (res.url().includes("/api/products?source=flexofit")) products = await res.json().catch(() => null); });
      page.on("dialog", (d) => d.accept().catch(() => {}));
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="HL-Handlauf"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("hlk"));
      await page.waitForSelector("#hlWizPanel [data-pick-area]");
      await page.waitForFunction(() => !!document.querySelector("#hlWizLedger table"));
      await page.waitForTimeout(800);
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-hlk";
      // number fields take the value as the keyboard gives it ("3.5"); the "change" event as when the field is left
      const change = async (sel, value) => { const l = page.locator(sel).first(); await l.evaluate((n, v) => { n.value = v; n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true })); }, String(value)); };
      const keySel = (attr, id) => id.startsWith("sonder:") ? `[${attr}][data-key="__sonder__:${id.slice(7)}"]` : `[${attr}][data-key*="::${id}::"]`;
      // an act inside a collapsed step opens that step first (a tap on its header), as a user would
      const STEP_OF = { area: "area", tab: "rohr", tube: "rohr", sonderAdd: "rohr", sonder: "rohr", sonderDel: "rohr", finish: "beschlaege", fit: "beschlaege" };
      const openStep = async (key) => {
        const i = ["area", "rohr", "beschlaege"].indexOf(key), s = page.locator(`${P} .hl-wiz__leaf-step`).nth(i);
        if (!(await s.evaluate((n) => n.classList.contains("is-open")))) { await s.locator("[data-toggle-step]").click(); await page.waitForTimeout(150); }
      };
      for (const [kind, a, b, c] of steps) {
        if (STEP_OF[kind]) await openStep(STEP_OF[kind]);
        if (kind === "area") await page.locator(`${P} [data-pick-area="${a}"]`).click();
        else if (kind === "tab") await page.locator(`${P} [data-tube-tab="${a}"]`).click();
        else if (kind === "tube") await page.locator(`${P} [data-tube*="::${a}::"]`).first().click();
        else if (kind === "finish") await page.locator(`${P} [data-finish="${a}"]`).click();
        else if (kind === "fit") await page.locator(`${P} [data-fit*="::${a}::"]`).first().click();
        else if (kind === "qty") await change(`#hlWizLedger ${keySel("data-ledger-qty", a)}`, b);
        else if (kind === "del") await page.locator(`#hlWizLedger ${keySel("data-ledger-del", a)}`).first().click();
        else if (kind === "sonderAdd") await page.locator(`${P} [data-sonder-add]`).click();
        else if (kind === "sonder") await change(`${P} [data-sonder-${{ name: "name", price: "price", articleId: "article", qty: "qty" }[b]}][data-idx="${a}"]`, c);
        else if (kind === "sonderDel") await page.locator(`${P} [data-sonder-del][data-idx="${a}"]`).click();
        else if (kind === "add") await page.locator(`${P} [data-add-config]`).click();
        else if (kind === "select") await page.locator(`${P} .hl-wiz__rail-item`).nth(a - 1).locator(".hl-wiz__rail-name").click();
        else if (kind === "remove" || kind === "keep") { await page.locator(`${P} .hl-wiz__rail-item`).nth(a - 1).locator("[data-remove-config]").click(); await page.locator("#appConfirmOverlay.visible button", { hasText: kind === "remove" ? "Ja, entfernen" : "Nein, behalten" }).click(); }
        else if (kind === "rename") await change(`${P} [data-rename-config]`, a);
        else if (kind === "toggle") await page.locator(`${P} [data-toggle-step="${a}"]`).click();
        else if (kind === "note") { await page.locator(`${P} details.az-group > summary`).click(); await page.locator("#hlNote").fill(a); }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(700);
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(viewOf);
      // the Sonderprodukt fields and its remove button redraw only the position list: the list of
      // configurations, the status and the step headers catch up at the next tap. `fresh` is the page
      // after such a tap (the active configuration tapped in the list: nothing changes but the drawing)
      await page.locator(`${P} .hl-wiz__rail-item.is-active .hl-wiz__rail-name`).click();
      await page.waitForTimeout(300);
      const fresh = await page.evaluate(viewOf), after = await page.evaluate(() => window.buildPayload());
      if (!same(after.hl, now.hl)) throw new Error("the redraw changed the stored offer");
      await ctx.close();
      console.log(name);
      const elsewhere = Object.keys(now).filter((k) => k !== "hl" && !same(base[k], now[k]));
      return { name, steps, base: sortKeys(base.hl), products, hl: sortKeys(changed(base.hl, now.hl)), ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}), view, ...(same(view, fresh) ? {} : { fresh }) };
    };
    let entry;
    for (let attempt = 1; !entry; attempt++) {
      try { entry = await record(); }
      catch (err) {
        if (attempt >= 6) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    out.base = entry.base; delete entry.base;
    if (entry.products) out.products = entry.products.map((p) => ({ productId: p.productId, name: p.name, price: p.price, source: p.source }));
    delete entry.products;
    out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
