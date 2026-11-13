// Records what today's UI stores and shows on the step "Optionale Produkte" of a Badumbau: the
// category cards with their counts, the dialog of a category (tiles, quantities, the question of
// the shower system, accessories that come by themselves), the free items, the bar "Ausgewählte
// Optionen" and what "Weiter" asks for — the reference for apps/web/test/optional.test.tsx
// (ADR 026, phase 4). The v2 add-ons are blocked. RESUME=1 continues an interrupted run and adds
// new scenarios to a finished recording; ONLY=<text> records the scenarios whose name contains it
// and prints them instead of writing the file.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-optional.cjs   → v2/apps/web/test/fixtures/optional.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "optional.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const G = [["cat", "GRAB"], ["tile", "CLPESG60"]];
const S = [["cat", "SHOWER"], ["mount", "versetzt"]];
const B = [["cat", "BASIN"], ["tile", "CL60"]];
const R = [["cat", "SONDER"], ["row", 1, "name", "Spiegelschrank"], ["row", 1, "price", "199,00"], ["row", 1, "id", "OPT-1"]];
const U = [["kind", "wanne_dusche"]];
// steps: ["cat", X] taps a category card · ["done"] / ["close"] / ["backdrop"] / ["esc"] leave the dialog ·
//        ["tile", article] taps a product · ["qty", article, n] types a quantity · ["mount", versetzt|direkt] ·
//        ["chip", text] removes a pick in the bar · ["row", n, name|price|qty|id, text] a free item ·
//        ["row+"] / ["row-", n] · ["bs", name|artikel|price, text] the free wash basin ·
//        ["kind", umbauart] chooses the Umbauart on Arbeiten · ["next"] Weiter · ["nextkey"] Weiter by keyboard
const SCENARIOS = {
  "nothing chosen": [],
  "a card opened": [["cat", "GRAB"]],
  "a card opened and left empty": [["cat", "GRAB"], ["done"]],
  "grab bar 60": [...G],
  "grab bar 60, three": [...G, ["qty", "CLPESG60", "3"]],
  "grab bar 60, three, done": [...G, ["qty", "CLPESG60", "3"], ["done"]],
  "grab bar: quantity emptied": [...G, ["qty", "CLPESG60", ""]],
  "grab bar: quantity 0": [...G, ["qty", "CLPESG60", "0"]],
  "two grab bars": [...G, ["tile", "CLPESG30"], ["qty", "CLPESG30", "2"]],
  "grab bar switched off again": [...G, ["qty", "CLPESG60", "3"], ["tile", "CLPESG60"]],
  "grab bar off and on again": [...G, ["qty", "CLPESG60", "3"], ["tile", "CLPESG60"], ["tile", "CLPESG60"]],
  "grab bar off, dialog closed": [...G, ["tile", "CLPESG60"], ["done"]],
  "dialog closed with the cross": [...G, ["close"]],
  "dialog closed beside it": [...G, ["backdrop"]],
  "dialog closed with Esc": [...G, ["esc"]],
  "card opened again": [...G, ["done"], ["cat", "GRAB"]],
  "pick removed in the bar": [...G, ["tile", "CLPESG30"], ["done"], ["chip", "Haltegriff clivia plus 32/600mm Edelstahl poliert CLPESG60"]],
  "last pick removed in the bar": [...G, ["done"], ["chip", "Haltegriff clivia plus 32/600mm Edelstahl poliert CLPESG60"]],
  "two categories": [...G, ["done"], ["cat", "FOLD"], ["tile", "DEPSKG85"], ["done"]],
  "folding grab bar": [["cat", "FOLD"], ["tile", "DEPSKG60"]],
  "shower seats": [["cat", "SEAT"], ["tile", "DEPKS"], ["tile", "78090000"], ["qty", "78090000", "2"]],
  "pipe collar: pairs": [["cat", "METER"], ["tile", "TECEADS"], ["qty", "TECEADS", "4"]],
  "ramp": [["cat", "RAMPE"], ["tile", "RAMPE35"]],
  "shower basket": [["cat", "DUSCHZUB"], ["tile", "DUSCHKORB01"]],
  "lifting unit": [["cat", "HEBE"], ["tile", "HEBEFIXMINI"]],
  "REHA: two products": [["cat", "REHA"], ["tile", "24081000"], ["tile", "78700400"], ["qty", "78700400", "2"]],
  "REHA: done": [["cat", "REHA"], ["tile", "24081000"], ["tile", "10440000"], ["done"]],
  "REHA: a bath board has no quantity": [["cat", "REHA"], ["tile", "78061000"]],
  "REHA: bath board and cushion, done": [["cat", "REHA"], ["tile", "78058100"], ["tile", "24081100"], ["done"]],
  "thermostat: only one": [["cat", "THERMO"], ["tile", "DEPTB"]],
  "thermostat: off, then another": [["cat", "THERMO"], ["tile", "DEPTB"], ["tile", "DEPTB"], ["tile", "CLB"]],
  "shower system opened": [["cat", "SHOWER"]],
  "shower system: only the question answered, done": [...S, ["done"]],
  "shower system: offset": [...S],
  "shower system: offset, set chosen": [...S, ["tile", "V22BG903R"]],
  "shower system: offset, hose off": [...S, ["tile", "V22BG903R"], ["tile", "DESIBS160"]],
  "shower system: offset, done": [...S, ["tile", "TEMPDSU250"], ["done"]],
  "shower system: directly below": [["cat", "SHOWER"], ["mount", "direkt"]],
  "shower system: directly below, column": [["cat", "SHOWER"], ["mount", "direkt"], ["tile", "STRAYT"]],
  "shower system: directly below only, done": [["cat", "SHOWER"], ["mount", "direkt"], ["done"]],
  "shower system: directly below only, done, opened again": [["cat", "SHOWER"], ["mount", "direkt"], ["done"], ["cat", "SHOWER"]],
  "shower system: offset, then directly below": [...S, ["tile", "V22BG903R"], ["mount", "direkt"]],
  "shower system: directly below, then offset": [["cat", "SHOWER"], ["mount", "direkt"], ["tile", "V12DS250E"], ["mount", "versetzt"]],
  "shower system: a thermostat was chosen before": [["cat", "THERMO"], ["tile", "DEPTB"], ["done"], ...S],
  "shower system: thermostat before, then directly below": [["cat", "THERMO"], ["tile", "DEPTB"], ["done"], ...S, ["mount", "direkt"]],
  "shower system: the thermostat that came with it is removed": [...S, ["done"], ["chip", "AP-Brause-Thermostat clivia, ohne Brausegarnitur CLTB"]],
  "shower system: Weiter without an answer": [["cat", "SHOWER"], ["nextkey"]],
  "basin tap": [["cat", "BASIN_TAP"], ["tile", "DEPOH"]],
  "kitchen tap: rosette comes with it": [["cat", "BASIN_TAP"], ["tile", "ONSHB"]],
  "kitchen tap: two": [["cat", "BASIN_TAP"], ["tile", "ONSHB"], ["qty", "ONSHB", "2"]],
  "kitchen tap: rosette changed by hand, then the tap": [["cat", "BASIN_TAP"], ["tile", "ONSHB"], ["qty", "YNORGH21825", "5"], ["qty", "ONSHB", "3"]],
  "kitchen tap off again": [["cat", "BASIN_TAP"], ["tile", "ONSHB"], ["tile", "ONSHB"]],
  "kitchen tap: rosette off": [["cat", "BASIN_TAP"], ["tile", "ONSHB"], ["tile", "YNORGH21825"]],
  "wash basin": [...B],
  "wash basin: two": [...B, ["qty", "CL60", "2"]],
  "wash basin: two kinds": [...B, ["tile", "ON35"], ["qty", "ON35", "2"]],
  "wash basin: angle valve off": [...B, ["tile", "EV"]],
  "wash basin: angle valve off, then another quantity": [...B, ["tile", "EV"], ["qty", "CL60", "3"]],
  "wash basin: accessory by hand, then another quantity": [...B, ["qty", "WTBF", "5"], ["qty", "CL60", "2"]],
  "wash basin: accessory by hand": [...B, ["qty", "EV", "3"]],
  "wash basin off again": [...B, ["tile", "CL60"]],
  "wash basin: one of two off": [...B, ["tile", "CL65"], ["tile", "CL60"]],
  "wash basin: done": [...B, ["done"]],
  "wash basin off again, done": [...B, ["tile", "CL60"], ["done"]],
  "free wash basin": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "artikel", "WS-1"], ["bs", "price", "249,50"]],
  "free wash basin: two": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "price", "249,50"], ["qty", "BASIN_SONDER", "2"]],
  "free wash basin: a price with a dot": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "price", "12.5"]],
  "free wash basin: done, opened again": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "price", "249,50"], ["done"], ["cat", "BASIN"]],
  "free wash basin without a price": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"]],
  "free wash basin off again": [["cat", "BASIN"], ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "price", "249,50"], ["tile", "BASIN_SONDER"]],
  "free wash basin beside a basin, off again": [...B, ["tile", "BASIN_SONDER"], ["bs", "name", "Waschtisch Sonder"], ["bs", "price", "100"], ["tile", "BASIN_SONDER"]],
  "wall siphon: valve and material come with it": [["cat", "WESGH"], ["tile", "WESGH"]],
  "wall siphon: two": [["cat", "WESGH"], ["tile", "WESGH"], ["qty", "WESGH", "2"]],
  "wall siphon off again": [["cat", "WESGH"], ["tile", "WESGH"], ["tile", "WESGH"]],
  "free items opened": [["cat", "SONDER"]],
  "free item": [...R],
  "free item: name only": [["cat", "SONDER"], ["row", 1, "name", "Spiegelschrank"]],
  "free item: price first": [["cat", "SONDER"], ["row", 1, "price", "50"]],
  "free item: three": [...R, ["row", 1, "qty", "3"]],
  "free item: quantity 0": [...R, ["row", 1, "qty", "0"]],
  "free item without an article number": [["cat", "SONDER"], ["row", 1, "name", "Spiegelschrank"], ["row", 1, "price", "1.234,56"]],
  "free item: no second row without an article number": [["cat", "SONDER"], ["row", 1, "name", "Spiegelschrank"], ["row", 1, "price", "199"], ["row+"]],
  "two free items": [...R, ["row+"], ["row", 2, "name", "Ablage"], ["row", 2, "price", "35,5"], ["row", 2, "id", "OPT-2"], ["row", 2, "qty", "2"]],
  "two free items, the first removed": [...R, ["row+"], ["row", 2, "name", "Ablage"], ["row", 2, "price", "35,5"], ["row", 2, "id", "OPT-2"], ["row-", 1]],
  "free item: the only row removed": [...R, ["row-", 1]],
  "free item: a price with a dot": [["cat", "SONDER"], ["row", 1, "name", "Spiegelschrank"], ["row", 1, "price", "12.5"], ["row", 1, "id", "OPT-1"]],
  "free item: done": [...R, ["done"]],
  "free item without a name: done": [["cat", "SONDER"], ["row", 1, "price", "50"], ["done"]],
  "free item removed in the bar": [...R, ["done"], ["chip", "Spiegelschrank"]],
  "free items closed and opened again": [...R, ["done"], ["cat", "SONDER"]],
  "Weiter": [...G, ["done"], ["next"]],
  "Umbauart, then a thermostat": [...U, ["cat", "THERMO"], ["tile", "CLTB"]],
  "Umbauart, thermostat on and off": [...U, ["cat", "THERMO"], ["tile", "CLTB"], ["tile", "CLTB"]],
  "Umbauart, shower system offset": [...U, ...S, ["tile", "V22BG903R"]],
  "Umbauart, shower system directly below": [...U, ["cat", "SHOWER"], ["mount", "direkt"], ["tile", "STRAYT"]],
  "Umbauart, wash basin and tap": [...U, ...B, ["done"], ["cat", "BASIN_TAP"], ["tile", "DEPOH"]],
  "Umbauart, shower basket and lifting unit": [...U, ["cat", "DUSCHZUB"], ["tile", "DUSCHKORB01"], ["done"], ["cat", "HEBE"], ["tile", "HEBEFIXMINI"]],
  "Umbauart, wash basin on and off": [...U, ...B, ["tile", "CL60"]],
  "Umbauart, grab bars": [...U, ...G, ["qty", "CLPESG60", "2"], ["tile", "CLPESG80"]],
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

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-optional.cjs — do not edit", cards: null, scenarios: [] };
  const only = process.env.ONLY || "";
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept && !only) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (only && !name.includes(only))) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      page.on("dialog", (d) => { d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("Optional"));
      await page.waitForTimeout(500);
      const base = await page.evaluate(() => window.buildPayload());
      // what "Weiter" says
      await page.evaluate(() => { window.__said = []; for (const k of ["error", "warning", "info", "success"]) { const was = window.toast?.[k]; if (was) window.toast[k] = (...a) => { window.__said.push([k, ...a]); return was.apply(window.toast, a); }; } });
      const F = "#form-optional", row = (n) => `#opt-sonder .da-item:nth-child(${n})`;
      const type = async (sel, text) => { const inp = page.locator(sel); await inp.fill(String(text)); await inp.blur(); };
      for (const [kind, a, b, c] of steps) {
        if (kind === "cat") await page.locator(`#optCategories label.image-check:has(#cat_${a})`).click();
        else if (kind === "done") await page.locator("#optCategoryModal .opt-modal-done").click();
        else if (kind === "close") await page.locator("#optCategoryModal .opt-modal-close").click();
        else if (kind === "esc") await page.keyboard.press("Escape");
        else if (kind === "backdrop") await page.locator("#optCategoryModal .opt-modal-backdrop").click({ position: { x: 5, y: 5 } });
        else if (kind === "tile") await page.locator(`${F} label.image-check:has(#opt_${a})`).click();
        else if (kind === "qty") await type(`#qty_${a}`, b);
        else if (kind === "mount") await page.locator(`#menu_SHOWER label.radio-pill:has(input[value="${a}"])`).click();
        else if (kind === "chip") await page.locator("#optSelectionChips .opt-chip").filter({ has: page.locator(".opt-chip-label", { hasText: new RegExp(`^${a.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`) }) }).locator("button").click();
        else if (kind === "row") await type(`${row(a)} .opt-${b}`, c);
        else if (kind === "row+") await page.locator("#opt-sonder .da-add").click();
        else if (kind === "row-") await page.locator(`${row(a)} .da-remove`).click();
        else if (kind === "bs") await type(`#basinSonder${a[0].toUpperCase()}${a.slice(1)}`, b);
        else if (kind === "kind") {
          await page.evaluate(() => window.setStep("Arbeiten"));
          await page.locator(`#page-Arbeiten label.radio-pill:has(input[value="${a}"])`).click();
          await page.waitForTimeout(700);
          await page.evaluate(() => window.setStep("Optional"));
        }
        else if (kind === "next") await page.locator('#page-Optional [data-nav="next"]').click();
        else if (kind === "nextkey") { await page.locator('#page-Optional [data-nav="next"]').focus(); await page.keyboard.press("Enter"); }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(900);
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const all = (sel, r = document) => [...r.querySelectorAll(sel)];
        const modal = document.getElementById("optCategoryModal");
        const panel = modal.hidden ? null : document.querySelector("#optModalBody .opt-modal-panel.is-current");
        const tile = (label) => {
          const cb = label.querySelector('input[type="checkbox"]'), id = cb.id.replace(/^opt_/, "");
          const wrap = document.getElementById(`qty_${id}_wrap`), qty = document.getElementById(`qty_${id}`);
          return { id, name: txt(label.querySelector(".caption")), on: cb.checked, locked: cb.disabled, qty: vis(qty) ? qty.value : null, qtyLabel: vis(wrap) ? txt(wrap.querySelector(`label[for="qty_${id}"], label.req`)) : null };
        };
        const bar = document.getElementById("optSelectionBar");
        return {
          step: location.hash.slice(1),
          said: window.__said || [],
          names: all("#optCategories label.image-check").map((l) => [l.querySelector("input").id.replace(/^cat_/, ""), txt(l.querySelector(".caption"))]),
          // the cards that are ticked or count something; every other card shows "✓ 0"
          cards: all("#optCategories label.image-check").map((l) => ({ id: l.querySelector("input").id.replace(/^cat_/, ""), on: l.querySelector("input").checked, badge: txt(l.querySelector(".opt-cat-badge")), counted: !!l.querySelector(".opt-cat-badge.has-sel") })).filter((c) => c.on || c.counted || c.badge !== "✓ 0"),
          bar: vis(bar) ? { head: txt(bar.querySelector(".opt-selbar-head")), chips: all(".opt-chip", bar).map((c) => ({ text: txt(c.querySelector(".opt-chip-label")), title: c.title })) } : null,
          dialog: panel ? {
            title: txt(document.getElementById("optModalTitle")), cat: panel.id.replace(/^menu_/, ""),
            mount: panel.querySelector('input[name="showerMount"]') ? { value: panel.querySelector('input[name="showerMount"]:checked')?.value || "", hint: vis(document.getElementById("showerMountHint")) } : null,
            tiles: all("label.image-check", panel).filter(vis).map(tile),
            headings: all("h4", panel).filter(vis).map(txt),
            linked: vis(document.getElementById("basinRequiredChips")) ? all("#basinRequiredChips .basin-required-chip").map(txt) : null,
            freeBasin: vis(document.getElementById("basinSonderName")) ? { name: document.getElementById("basinSonderName").value, artikel: document.getElementById("basinSonderArtikel").value, price: document.getElementById("basinSonderPrice").value, qty: document.getElementById("qty_BASIN_SONDER").value } : null,
            rows: panel.id === "menu_SONDER" ? all(".da-item", panel).map((r) => ({ name: r.querySelector(".opt-name").value, price: r.querySelector(".opt-price").value, qty: r.querySelector(".opt-qty").value, id: r.querySelector(".opt-id").value })) : null,
          } : null,
        };
      });
      await ctx.close();
      console.log(name);
      out.cards = view.names; delete view.names; // the names of the cards are the same in every recording
      const elsewhere = Object.keys(now).filter((k) => k !== "optional" && !same(base[k], now[k]));
      return { name, steps, optional: sortKeys(changed(base.optional, now.optional)), ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}), view };
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
    if (only) { console.log(JSON.stringify(entry, null, 1)); continue; }
    out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  if (only) return;
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
