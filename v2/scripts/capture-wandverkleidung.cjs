// Records what today's UI stores and shows on the Wandverkleidung step of a Badumbau for given
// inputs (ADR 026, phase 4): the reference for apps/web/test/wandverkleidung.test.tsx. Inputs are
// real clicks and key presses. The v2 add-ons are blocked.
// This file covers the frame (switch, product line, Ausführung) and the line winwall (rows,
// decor, accessories). The wall calculator, the lines VIGOUR and Badolux, and sketch and note follow.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-wandverkleidung.cjs   → v2/apps/web/test/fixtures/wandverkleidung.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "wandverkleidung.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const ON = ["on"], ROW = ["row+"];
// steps: ["on"] / ["off"] · ["line", "ww"|"premium"|"standard"] · ["kind", value] ·
//        ["shower"] the task "Im Duschbereich bis Höhe" · ["height", cm] ·
//        ["row+"] · ["row", n] taps row n (opens / folds it) · ["decor", value] a decor tile ·
//        ["custom", text] types a decor number · ["fmt", n, code] · ["qty", n, "+"|"-"] · ["row-", n] ·
//        ["acc", sku] · ["accqty", sku, "+"|"-"] · ["seal"] · ["sealqty", text] · ["cut"] · ["next"]
const SCENARIOS = {
  "nothing chosen": [],
  "switched on": [ON],
  "only gaps": [ON, ["kind", "Fehlstellen"]],
  "up to the ceiling in the shower area": [ON, ["kind", "Deckenhoch"]],
  "all bathroom walls": [ON, ["kind", "alle-Bad-Wände"]],
  "kind changed": [ON, ["kind", "Fliesenspiegel"], ["kind", "Innenraum-der-Kabine"]],
  "shower area up to 200 cm": [ON, ["kind", "Deckenhoch"], ["shower"], ["height", "200"]],
  "shower area ticked and unticked": [ON, ["shower"], ["height", "200"], ["shower"]],
  "line VIGOUR": [ON, ["line", "premium"]],
  "line Badolux": [ON, ["line", "standard"]],
  "line VIGOUR and back to winwall": [ON, ["line", "premium"], ["line", "ww"]],
  "one row": [ON, ROW],
  "one row, another decor": [ON, ROW, ["decor", "WS229"]],
  "one row, format 125 × 250, three plates": [ON, ROW, ["fmt", 1, "16"], ["qty", 1, "+"], ["qty", 1, "+"]],
  "two plates of one kind (a set)": [ON, ROW, ["qty", 1, "+"]],
  "two rows of the same kind": [ON, ROW, ROW],
  "two rows, the second with another decor and format": [ON, ROW, ROW, ["decor", "NW220"], ["fmt", 2, "17"]],
  "two rows, the first removed": [ON, ROW, ["decor", "WS229"], ROW, ["decor", "WS000"], ["row-", 1]],
  "row folded and the other opened": [ON, ROW, ROW, ["row", 1], ["decor", "WS210"]],
  "quantity cannot go below one": [ON, ROW, ["qty", 1, "-"]],
  "decor by number: WS 233": [ON, ROW, ["decor", "custom"], ["custom", "WS 233"]],
  "decor by number: only digits": [ON, ROW, ["decor", "custom"], ["custom", "203"]],
  "decor by number: no number": [ON, ROW, ["decor", "custom"], ["custom", "XY"]],
  "decor by number, then a tile again": [ON, ROW, ["decor", "custom"], ["custom", "NW 230"], ["decor", "WS203"]],
  "end profile added by hand": [ON, ROW, ["acc", "WS80110"], ["accqty", "WS80110", "+"]],
  "corner profile by quantity": [ON, ROW, ["accqty", "WS80111", "+"], ["accqty", "WS80111", "+"]],
  "suggested adhesive switched off": [ON, ROW, ["qty", 1, "+"], ["acc", "R_4260602"]],
  "suggested profile changed, then another plate": [ON, ROW, ["qty", 1, "+"], ["accqty", "WS80113", "+"], ["qty", 1, "+"]],
  "no sealing set": [ON, ROW, ["seal"]],
  "sealing sets by hand": [ON, ROW, ["qty", 1, "+"], ["qty", 1, "+"], ["sealqty", "3"]],
  "cutting by winwall": [ON, ROW, ["cut"]],
  "rows, then line VIGOUR": [ON, ROW, ["qty", 1, "+"], ["line", "premium"]],
  "rows, line VIGOUR and back": [ON, ROW, ["qty", 1, "+"], ["line", "premium"], ["line", "ww"]],
  "filled in, then switched off": [ON, ["kind", "Deckenhoch"], ROW, ["qty", 1, "+"], ["off"]],
  "filled in, switched off and on again": [ON, ["kind", "Deckenhoch"], ROW, ["qty", 1, "+"], ["off"], ON],
  "Weiter: switched off": [["next"]],
  "Weiter: on, no kind": [ON, ["next"]],
  "Weiter: on with a kind": [ON, ["kind", "Fehlstellen"], ["next"]],
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
  const out = { note: "generated by v2/scripts/capture-wandverkleidung.cjs — do not edit", decors: null, scenarios: [] };
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      const alerts = [];
      page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("Wandverkleidung"));
      await page.waitForTimeout(500);
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-Wandverkleidung";
      const row = (n) => `#wvWwRows .wv-row:nth-child(${n})`;
      let next = null;
      for (const [kind, a, b] of steps) {
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click();
        else if (kind === "line") await page.locator(`${P} .tier-seg__btn[data-tier="${a}"]`).first().click();
        else if (kind === "kind") await page.locator(`${P} label.ios-check-row:has(input[name="wvKind"][value="${a}"])`).click();
        else if (kind === "shower") await page.locator(`${P} label.ios-check-row--switch .sec-switch__track`).click();
        else if (kind === "height") { await page.locator(`${P} input[name="duschwanne[wandverkleidungHoehe]"]`).fill(a); await page.locator(`${P} input[name="duschwanne[wandverkleidungHoehe]"]`).blur(); }
        else if (kind === "row+") await page.locator("#wvWwRowAdd").click();
        else if (kind === "row") await page.locator(`${row(a)} > .wv-row__name`).click();
        else if (kind === "decor") await page.locator(`#wvWwDecors label.image-check:has(input[value="${a}"])`).click();
        else if (kind === "custom") { await page.locator("#wvWwDecorCustom").fill(a); await page.locator("#wvWwDecorCustom").blur(); }
        else if (kind === "fmt") await page.locator(`${row(a)} > select.wv-ww-fmtsel`).selectOption(b);
        else if (kind === "qty") await page.locator(`${row(a)} > .wv-row__step [data-d="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "row-") await page.locator(`${row(a)} > .wv-row__del`).click();
        else if (kind === "acc") await page.locator(`#wvWwAccSection label.image-check:has(#wvWw_${a}) .sec-switch__track`).click();
        else if (kind === "accqty") await page.locator(`#wvWwAccSection .dw-acc:has(#wvWw_${a}) [data-step="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "seal") await page.locator("#wvWwAccSection label.image-check:has(#wvWwSealing) .sec-switch__track").click();
        else if (kind === "sealqty") { await page.locator("#wvWwSealingQty").fill(a); await page.locator("#wvWwSealingQty").blur(); }
        else if (kind === "cut") await page.locator("#wvWwAccSection label.image-check:has(#wvWwCut) .sec-switch__track").click();
        else if (kind === "next") { await page.locator(`${P} [data-nav="next"]`).click(); await page.waitForTimeout(400); next = { step: await page.evaluate(() => location.hash.slice(1)), alerts: [...alerts] }; }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(900);
      if (next) await page.evaluate(() => window.setStep("Wandverkleidung"));
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const el = (id) => document.getElementById(id);
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.innerText || "").replace(/\s+/g, " ").trim();
        const page = el("page-Wandverkleidung");
        const acc = (id, qtyId) => { const cb = el(id), rowEl = cb.closest(".dw-acc"), q = qtyId ? el(qtyId) : null; return { id, shown: vis(rowEl), checked: cb.checked, qty: q ? q.value : null, placeholder: q ? q.placeholder : null, caption: txt(rowEl.querySelector(".caption")), small: txt(rowEl.querySelector("small")) }; };
        return {
          on: el("wvEnabled").checked,
          line: page.querySelector('.tier-seg__btn[aria-pressed="true"]')?.dataset.tier || "", lineText: txt(page.querySelector("[data-tier-line]")),
          shown: ["wvKindGroup", "wvKeramicoCalc", "wvWwRowsSection", "wvWwPanelsSection", "wvWwDecorSection", "wvWwAccSection", "wvRowsSection", "wvColorSection", "wvPanelField997", "wvKRowsSection", "wvBudgetColorSection", "wvHmAccSection", "wvBadoluxAccSection", "wvSketchDetails"].filter((id) => vis(el(id))),
          kind: page.querySelector('input[name="wvKind"]:checked')?.value || "",
          shower: page.querySelector('input[value="wandverkleidung_duschbereich"]').checked, height: page.querySelector('input[name="duschwanne[wandverkleidungHoehe]"]').value,
          rows: [...document.querySelectorAll("#wvWwRows .wv-row")].map((r) => ({ title: txt(r.querySelector(".wv-row__name b")), small: txt(r.querySelector(".wv-row__name small")), fmt: r.querySelector("select").value, qty: txt(r.querySelector("output")), open: !!r.querySelector(".wv-row__body") })),
          rowsEmpty: txt(document.querySelector("#wvWwRows .wv-rows-empty")), rowsHint: vis(el("wvWwRowsHint")) ? txt(el("wvWwRowsHint")) : "",
          decorsShown: vis(el("wvWwDecors")), decorLabel: txt(el("wvWwDecorSection").querySelector(".sec-settings__label")),
          decor: document.querySelector('input[name="wvWwDecor"]:checked')?.value || "",
          customShown: vis(el("wvWwCustomRow")), custom: el("wvWwDecorCustom").value, customHint: txt(el("wvWwCustomHint")),
          customCaption: txt(document.querySelector('input[name="wvWwDecor"][value="custom"]').closest("label").querySelector(".caption")),
          accLabel: txt(el("wvWwAccSection").querySelector(".sec-settings__label")),
          acc: [...["WS80110", "WS80111", "WS80112", "WS80113", "R_4260602"].map((s) => acc(`wvWw_${s}`, `wvWwQty_${s}`)), acc("wvWwSealing", "wvWwSealingQty"), acc("wvWwCut", null)],
        };
      });
      if (!out.decors) out.decors = await page.evaluate(() => [...document.querySelectorAll('#wvWwDecors input[name="wvWwDecor"]')].map((i) => ({ value: i.value, caption: (i.closest("label").querySelector(".caption")?.textContent || "").trim(), img: i.closest("label").querySelector("img")?.getAttribute("src") || "" })));
      await ctx.close();
      console.log(name);
      return { name, steps, wandverkleidung: sortKeys(changed(base.wandverkleidung, now.wandverkleidung)), duschwanne: sortKeys(changed(base.duschwanne, now.duschwanne)), arbeitszeit: sortKeys(changed(base.Arbeitszeit, now.Arbeitszeit)), view, ...(next ? { next } : {}) };
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
    out.scenarios.push(entry);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
