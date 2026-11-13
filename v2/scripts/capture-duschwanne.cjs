// Records what today's UI stores and shows on the Duschwanne step of a Badumbau for given inputs
// (ADR 026, phase 4): the reference for apps/web/test/duschwanne.test.tsx. Inputs are real
// clicks and key presses. The answers of the tray search are recorded too (`searches`), so the
// test replays the same product lists. The v2 add-ons are blocked.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-duschwanne.cjs   → v2/apps/web/test/fixtures/duschwanne.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "duschwanne.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const ON = ["on"], D = ["dims", "90", "120"];
// steps: ["on"] / ["off"] the tray switch · ["tier", "standard"|"premium"] ·
//        ["dims", width, length] · ["pick", n] the n-th result · ["color", value] · ["acc", name] ·
//        ["qty", "+"|"-"] · ["hint"] the cost-hint switch · ["cheaper"] the "also as Standard" button ·
//        ["restore"] previous dimensions · ["other"] switch to the other line (banner / pinned) ·
//        ["custom", field, text] · ["kind", umbauart] · ["task", value] (both on Arbeiten)
const SCENARIOS = {
  "nothing chosen": [],
  "tray switched on": [ON],
  "size entered, nothing picked": [ON, D],
  "first Premium tray picked": [ON, D, ["pick", 1]],
  "second Premium tray picked": [ON, D, ["pick", 2]],
  "Premium tray in Anthrazit": [ON, D, ["pick", 1], ["color", "Anthrazit"]],
  "Standard line, first tray picked": [ON, ["tier", "standard"], D, ["pick", 1]],
  "Premium tray picked, then the Standard line": [ON, D, ["pick", 1], ["tier", "standard"]],
  "Premium tray picked, Standard line and back": [ON, D, ["pick", 1], ["tier", "standard"], ["tier", "premium"]],
  "Premium tray picked, then the cheaper Standard one taken": [ON, D, ["pick", 1], ["cheaper"]],
  "the cheaper Standard one taken, then the Premium line": [ON, D, ["pick", 1], ["cheaper"], ["tier", "premium"]],
  "tray picked, then another size": [ON, D, ["pick", 1], ["dims", "75", "170"]],
  "tray picked, another size, previous size back": [ON, D, ["pick", 1], ["dims", "75", "170"], ["restore"]],
  "a size nobody has": [ON, ["dims", "300", "300"]],
  "a size nobody has, free item entered": [ON, ["dims", "300", "300"], ["custom", "dwCustomName", "Duschwanne geschwungen 100x100"], ["custom", "dwCustomPrice", "799,00"], ["custom", "dwCustomQty", "2"], ["custom", "dwCustomId", "DW-CUS-001"]],
  "size emptied again": [ON, D, ["pick", 1], ["dims", "", ""]],
  "accessories changed": [ON, D, ["pick", 1], ["acc", "abdichtSet"], ["qty", "+"], ["qty", "+"], ["acc", "smallMaterial"]],
  "no Stelzlager": [ON, D, ["pick", 1], ["acc", "stelzlager"]],
  "Standard line: accessories": [ON, ["tier", "standard"], D, ["pick", 1], ["qty", "-"]],
  "cost hint switched off": [ON, ["hint"]],
  "tray picked, then switched off": [ON, D, ["pick", 1], ["off"]],
  "tray picked, switched off and on again": [ON, D, ["pick", 1], ["off"], ON],
  "Ohne Rückbau, then a tray picked": [["kind", "ohne_rueckbau"], ON, D, ["pick", 1]],
  "Badewanne → Badewanne, then a tray picked": [["kind", "wanne_wanne"], ON, D, ["pick", 1]],
  "Ohne Rückbau, tray picked, then switched off": [["kind", "ohne_rueckbau"], ON, D, ["pick", 1], ["off"]],
  "Ohne Rückbau, installation unticked by hand, tray picked": [["kind", "wanne_dusche"], ["task", "install_tray"], ON, D, ["pick", 1]],
  "no Umbauart, tray picked": [ON, D, ["pick", 1]],
  "Ohne Rückbau, tray switched on without a tray": [["kind", "ohne_rueckbau"], ON],
  "Ohne Rückbau, free item instead of a tray": [["kind", "ohne_rueckbau"], ON, ["custom", "dwCustomName", "Duschwanne Sonderform"], ["custom", "dwCustomPrice", "500"]],
  "Ohne Rückbau, tray picked, then the Standard line": [["kind", "ohne_rueckbau"], ON, D, ["pick", 1], ["tier", "standard"]],
  "Premium tray in Anthrazit, then switched off": [ON, D, ["pick", 1], ["color", "Anthrazit"], ["off"]],
  "no Stelzlager, quantity changed before": [ON, ["qty", "+"], ["acc", "stelzlager"]],
};

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const changed = (base, now) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(now)])]
  .filter((k) => k !== "computed" && !same(base[k], now[k])).map((k) => [k, k in now ? now[k] : "<removed>"]));

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-duschwanne.cjs — do not edit", searches: {}, scenarios: [] };
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      page.on("response", async (res) => {
        const u = new URL(res.url());
        if (u.pathname !== "/api/trays/suggest" || !res.ok()) return;
        try {
          const keep = ["productId", "name", "price", "widthCm", "lengthCm", "heightCm", "articleNumber", "stockQuantity", "stockSymbol", "stockText", "source"];
          out.searches[u.search.slice(1)] = ((await res.json()).results || []).map((p) => Object.fromEntries(keep.filter((k) => k in p).map((k) => [k, p[k]])));
        } catch {}
      });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      const go = async (step) => { if (await page.evaluate(() => location.hash.slice(1)) !== step) { await page.evaluate((s) => window.setStep(s), step); await page.waitForTimeout(300); } };
      await go("Duschwanne");
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-Duschwanne";
      for (const [kind, a, b] of steps) {
        if (kind === "kind" || kind === "task") {
          await go("Arbeiten");
          await page.evaluate(() => document.querySelectorAll("#page-Arbeiten details").forEach((d) => { d.open = true; }));
          await page.locator(kind === "kind" ? `#page-Arbeiten label.radio-pill:has(input[value="${a}"])` : `#page-Arbeiten label.task-card:has(input[value="${a}"])`).click();
          await page.waitForTimeout(900);
          continue;
        }
        await go("Duschwanne");
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#dwTrayToggle)`).click();
        else if (kind === "tier") await page.locator(`${P} .tier-seg__btn[data-tier="${a}"]`).click();
        else if (kind === "dims") { await page.locator(`${P} input[name="tray_w_cm"]`).fill(a); await page.locator(`${P} input[name="tray_l_cm"]`).fill(b); await page.locator(`${P} input[name="tray_l_cm"]`).blur(); await page.waitForTimeout(900); }
        else if (kind === "pick") await page.locator(`#tray-suggestions .suggestion-list:not(.suggestion-pinned .suggestion-list) label.suggestion-card:nth-child(${a})`).last().click();
        else if (kind === "color") await page.locator(`${P} label.image-check:has(input[name="trayColor"][value="${a}"])`).click();
        else if (kind === "acc") await page.locator(`${P} label.image-check:has(input[name="${a}"])`).click();
        else if (kind === "qty") await page.locator(a === "+" ? "#stelzlagerQtyPlus" : "#stelzlagerQtyMinus").click();
        else if (kind === "hint") await page.locator(`${P} label.sec-mini-switch:has(#ebenerdigeToggle)`).click();
        else if (kind === "cheaper") await page.locator("[data-tray-line-switch]").click();
        else if (kind === "restore") await page.locator("[data-tray-restore-dims]").click();
        else if (kind === "other") await page.locator("#tray-suggestions [data-tray-switch]").click();
        else if (kind === "custom") { await page.evaluate(() => { document.getElementById("dw-custom-details").open = true; }); await page.locator(`#${a}`).fill(b); await page.locator(`#${a}`).blur(); }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(900);
      await go("Duschwanne");
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const el = (id) => document.getElementById(id);
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.innerText || "").replace(/\s+/g, " ").trim();
        const page = el("page-Duschwanne");
        return {
          on: el("dwTrayToggle").checked,
          tier: page.querySelector('.tier-seg__btn[aria-pressed="true"]')?.dataset.tier || "",
          tierLine: txt(page.querySelector("[data-tier-line]")),
          settingsShown: vis(page.querySelector(".tier-seg")),
          hint: el("ebenerdigeToggle").checked,
          dims: [page.querySelector('input[name="tray_w_cm"]').value, page.querySelector('input[name="tray_l_cm"]').value],
          headings: [...document.querySelectorAll("#tray-suggestions .suggestion-heading")].map(txt),
          cards: [...document.querySelectorAll("#tray-suggestions label.suggestion-card")].map((c) => ({
            id: c.querySelector("input").value, title: txt(c.querySelector(".sc-title")), sub: txt(c.querySelector(".sc-sub")), price: txt(c.querySelector(".sc-price")),
            selected: c.classList.contains("is-selected"), pinned: c.classList.contains("is-pinned"),
          })),
          notes: [...document.querySelectorAll("#tray-suggestions .tray-fallback, #tray-suggestions .suggestion-pinned-head, #tray-suggestions .suggestion-pinned-note, #tray-suggestions > .meta")].map(txt),
          cheaper: vis(page.querySelector(".tray-line-hint")) ? txt(page.querySelector(".tray-line-hint")) : "",
          colorShown: vis(el("slateTrayColorSection")), color: page.querySelector('input[name="trayColor"]:checked')?.value || "",
          accessories: [...page.querySelectorAll(".dw-acc")].map((row) => { const i = row.querySelector("input[type=checkbox]"); return { name: i.name, shown: vis(row), checked: i.checked, caption: txt(row.querySelector(".caption")), small: txt(row.querySelector("small")) }; }),
          qty: el("stelzlagerQtyInput").value, qtyShown: vis(el("stelzlagerQtyRow")),
          customShown: vis(el("dw-custom-details")), customOpen: el("dw-custom-details").open, customTitle: txt(el("dw-custom-summary-text")),
          custom: Object.fromEntries(["dwCustomName", "dwCustomPrice", "dwCustomQty", "dwCustomId"].map((id) => [id, el(id).value])),
          summary: vis(el("dwSummary")) ? txt(el("dwSummaryBody")) : "",
        };
      });
      await ctx.close();
      console.log(name);
      return { name, steps, duschwanne: sortKeys(changed(base.duschwanne, now.duschwanne)), arbeitszeit: sortKeys(changed(base.Arbeitszeit, now.Arbeitszeit)), view };
    };
    let entry;
    for (let attempt = 1; !entry; attempt++) {
      try { entry = await record(); }
      catch (err) {
        if (attempt >= 4) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    out.scenarios.push(entry);
  }
  await browser.close();
  out.searches = sortKeys(out.searches);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
