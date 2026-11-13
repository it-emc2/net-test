// Records what today's UI stores and shows on the Wandverkleidung step for the line Badolux
// (Keramico: rows of decor and number, Sonder-Dekor, the shared accessories, the Badolux
// accessories, and the wall calculator on this line) — the reference for
// apps/web/test/wv-badolux.test.tsx (ADR 026, phase 4). Real clicks and key presses; the v2
// add-ons are blocked. RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-wv-badolux.cjs   → v2/apps/web/test/fixtures/wv-badolux.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "wv-badolux.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const B = [["on"], ["line", "standard"]];
const R = [...B, ["row+"]];
// steps: ["on"] / ["off"] · ["line", …] · ["row+"] · ["row", n] taps row n · ["tile", n] the n-th decor tile of the open row ·
//        ["sonder"] the Sonder-Dekor tile · ["name", text] its motif name · ["qty", n, "+"|"-"] · ["row-", n] ·
//        ["acc", sku] / ["accqty", sku, "+"|"-"] the shared accessories · ["fold"] opens the Badolux accessories ·
//        ["bx", id] / ["bxqty", id, "+"|"-"] · ["sit", …] · ["width", wall, cm] · ["height", cm] · ["wall", key] · ["decor", wall, n]
const SCENARIOS = {
  "line Badolux": [...B],
  "one row": [...R],
  "one row, three panels": [...R, ["qty", 1, "+"], ["qty", 1, "+"]],
  "one row, another decor": [...R, ["tile", 3]],
  "two rows, two decors": [...R, ["row+"], ["tile", 2], ["qty", 2, "+"]],
  "two rows, the first removed": [...R, ["tile", 3], ["row+"], ["tile", 2], ["row-", 1]],
  "another row tapped": [...R, ["row+"], ["row", 1]],
  "another row tapped, then its decor changed": [...R, ["row+"], ["row", 1], ["tile", 4]],
  "the open row tapped": [...R, ["row", 1]],
  "the only row removed": [...R, ["qty", 1, "+"], ["row-", 1]],
  "the only row removed, then a new one": [...R, ["tile", 3], ["row-", 1], ["row+"]],
  "quantity cannot go below one": [...R, ["qty", 1, "-"]],
  "Sonder-Dekor": [...R, ["sonder"]],
  "Sonder-Dekor with a name": [...R, ["sonder"], ["name", "Octopus Flow"]],
  "Sonder-Dekor, then a decor again": [...R, ["sonder"], ["name", "Octopus Flow"], ["tile", 1]],
  "end profile added by hand": [...R, ["acc", "WS80110"], ["accqty", "WS80110", "+"]],
  "four panels: suggestions": [...R, ["qty", 1, "+"], ["qty", 1, "+"], ["qty", 1, "+"]],
  "suggested adhesive switched off, then another panel": [...R, ["acc", "R_4260602"], ["qty", 1, "+"]],
  "no sealing set": [...R, ["seal"]],
  "Badolux accessory switched on": [...R, ["fold"], ["bx", "PR101VBM3"]],
  "Badolux accessory by quantity": [...R, ["fold"], ["bxqty", "PR47VBM02", "+"], ["bxqty", "PR47VBM02", "+"], ["bx", "PRI130VBM02"]],
  "Badolux accessory on and off": [...R, ["fold"], ["bx", "PR59VBM03"], ["bxqty", "PR59VBM03", "+"], ["bx", "PR59VBM03"]],
  "walls: one wall, 180 cm, no decor": [...B, ["width", "back", "180"]],
  "walls: one wall with a decor": [...B, ["width", "back", "180"], ["wall", "back"], ["decor", "back", 2]],
  "walls: 300 cm": [...B, ["width", "back", "300"], ["wall", "back"], ["decor", "back", 1]],
  "walls: corner, two decors": [...B, ["sit", "ecke"], ["width", "links", "120"], ["width", "back", "180"], ["wall", "links"], ["decor", "links", 2], ["decor", "back", 1]],
  "walls: U-shape, one decor": [...B, ["sit", "u"], ["width", "links", "90"], ["width", "back", "170"], ["width", "rechts", "90"], ["wall", "links"], ["decor", "links", 1], ["decor", "back", 1], ["decor", "rechts", 1]],
  "walls: height 200 cm": [...B, ["width", "back", "180"], ["height", "200"], ["wall", "back"], ["decor", "back", 1]],
  "walls: height 120 cm": [...B, ["width", "back", "180"], ["height", "120"], ["wall", "back"], ["decor", "back", 1]],
  "walls: height 260 cm": [...B, ["width", "back", "180"], ["height", "260"], ["wall", "back"], ["decor", "back", 1]],
  "walls: a row by hand stays": [...R, ["tile", 3], ["width", "back", "180"], ["wall", "back"], ["decor", "back", 1]],
  "rows, then winwall and back": [...R, ["qty", 1, "+"], ["tile", 2], ["line", "ww"], ["line", "standard"]],
  "rows, then winwall": [...R, ["qty", 1, "+"], ["tile", 2], ["line", "ww"]],
  "rows, then VIGOUR": [...R, ["qty", 1, "+"], ["line", "premium"]],
  "rows, then switched off": [...R, ["qty", 1, "+"], ["off"]],
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
  const out = { note: "generated by v2/scripts/capture-wv-badolux.cjs — do not edit", tiles: null, scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (have.has(name)) continue;
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
      const krow = (n) => `#wvKRows .wv-row:nth-child(${n})`;
      for (const [kind, a, b] of steps) {
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click();
        else if (kind === "line") await page.locator(`${P} .tier-seg__btn[data-tier="${a}"]`).first().click();
        else if (kind === "row+") await page.locator("#wvKRowAdd").click();
        else if (kind === "row") await page.locator(`${krow(a)} > .wv-row__name`).click();
        else if (kind === "tile") await page.locator(`#wvKRows #wvBudgetColors label.image-check:nth-child(${a})`).click();
        else if (kind === "sonder") await page.locator('#wvKRows #wvBudgetColors label.image-check:has(input[value^="WP007"])').click();
        else if (kind === "name") { await page.locator('#wvKRows input[data-f="name"]').fill(a); await page.locator('#wvKRows input[data-f="name"]').blur(); }
        else if (kind === "qty") await page.locator(`${krow(a)} > .wv-row__step [data-d="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "row-") await page.locator(`${krow(a)} > .wv-row__del`).click();
        else if (kind === "acc") await page.locator(`#wvWwAccSection label.image-check:has(#wvWw_${a}) .sec-switch__track`).click();
        else if (kind === "accqty") await page.locator(`#wvWwAccSection .dw-acc:has(#wvWw_${a}) [data-step="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "seal") await page.locator("#wvWwAccSection label.image-check:has(#wvWwSealing) .sec-switch__track").click();
        else if (kind === "fold") await page.locator("#wvBadoluxAccSection .sec-settings__label").click();
        else if (kind === "bx") await page.locator(`#wvBadoluxAccSection label.image-check:has(#wvBx_${a}) .sec-switch__track`).click();
        else if (kind === "bxqty") await page.locator(`#wvBadoluxAccSection .dw-acc:has(#wvBx_${a}) [data-step="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "sit") await page.locator(`#wvKeramicoCalc .kc-chip[data-sit="${a}"]`).click();
        else if (kind === "width") { const id = { links: "wvKLinks", back: "wvKBack", rechts: "wvKRechts" }[a]; await page.locator(`#${id}`).fill(b); await page.locator(`#${id}`).blur(); }
        else if (kind === "height") { await page.locator("#wvKHoehe").fill(a); await page.locator("#wvKHoehe").blur(); }
        else if (kind === "wall") await page.locator(`#wvKeramicoCalc .kc-row[data-wall="${a}"] .kc-decor`).click();
        else if (kind === "decor") await page.locator(`#wvKeramicoCalc .kc-wall-body[data-body="${a}"] label.image-check:nth-child(${b})`).click();
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(800);
      }
      await page.waitForTimeout(900);
      if (next) await page.evaluate(() => window.setStep("Wandverkleidung"));
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const el = (id) => document.getElementById(id);
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.innerText || "").replace(/\s+/g, " ").trim();
        const root = el("wvKeramicoCalc"), svg = el("kcSvg"), page = el("page-Wandverkleidung");
        const acc = (id, qtyId) => { const cb = el(id), rowEl = cb.closest(".dw-acc"), q = qtyId ? el(qtyId) : null; return { id, shown: vis(rowEl), checked: cb.checked, qty: q ? q.value : null, placeholder: q ? q.placeholder : null, caption: txt(rowEl.querySelector(".caption")), small: txt(rowEl.querySelector("small")) }; };
        const sonder = document.querySelector("#wvKRows .wv-krow-sonder");
        return {
          on: el("wvEnabled").checked, line: page.querySelector('.tier-seg__btn[aria-pressed="true"]')?.dataset.tier || "",
          rows: [...document.querySelectorAll("#wvKRows .wv-row")].map((r) => ({ title: txt(r.querySelector(".wv-row__name b")), small: txt(r.querySelector(".wv-row__name small")), qty: txt(r.querySelector("output")), open: !!r.querySelector(".wv-row__body") })),
          rowsEmpty: txt(document.querySelector("#wvKRows .wv-rows-empty")),
          tilesShown: vis(el("wvBudgetColors")), tilesLabel: txt(el("wvBudgetColorSection").querySelector(".sec-settings__label")),
          tileActive: [...document.querySelectorAll("#wvBudgetColors label.wv-active input")].map((i) => i.value),
          sonder: sonder ? { text: txt(sonder).slice(0, 400), name: sonder.querySelector('input[data-f="name"]').value } : null,
          motifPicker: vis(el("wvMotifPicker")), manualQty: vis(el("wvKQty")),
          accLabel: txt(el("wvWwAccSection").querySelector(".sec-settings__label")),
          acc: [...["WS80110", "WS80111", "WS80112", "WS80113", "R_4260602"].map((s) => acc(`wvWw_${s}`, `wvWwQty_${s}`)), acc("wvWwSealing", "wvWwSealingQty"), acc("wvWwCut", null)],
          bxLabel: txt(el("wvBadoluxAccSection").querySelector(".sec-settings__label")), bxOpen: el("wvBadoluxAccSection").classList.contains("is-open"),
          bx: ["PR101VBM3", "PR47VBM02", "PR59VBM03", "PR59VBM05", "PR59VBM07", "PRI130VBM01", "PRI130VBM02"].map((s) => acc(`wvBx_${s}`, `wvBxQty_${s}`)),
          calc: {
            note: txt([...root.querySelectorAll(".kc-head .kc-note")].find(vis)), sit: root.querySelector('.kc-chip[aria-pressed="true"]')?.dataset.sit || "",
            walls: [...root.querySelectorAll(".kc-row[data-wall]")].filter(vis).map((r) => ({ key: r.dataset.wall, sub: txt(r.querySelector(".kc-wall-sub")), decor: txt(r.querySelector(".kc-decor")), width: r.querySelector("input").value, open: r.classList.contains("is-open") })),
            tilesUnder: [...root.querySelectorAll(".kc-wall-body")].filter(vis).map((b) => b.dataset.body),
            height: el("wvKHoehe").value, warn: vis(el("kcHeightWarn")) ? txt(el("kcHeightWarn")) : "", cutList: vis(el("kcCutList")) ? txt(el("kcCutList")) : "",
            pieces: [...svg.querySelectorAll(".kc-piece")].map((p) => ({ plate: p.dataset.platte, cut: p.classList.contains("kc-piece--cut") })), marks: [...svg.querySelectorAll(".kc-mark")].map((m) => m.textContent.replace(/\s+/g, " ").trim()),
            heightLabel: svg.querySelector(".kc-hlabel")?.textContent || "",
          },
        };
      });
      if (!out.tiles || !out.tiles.length) out.tiles = await page.evaluate(() => [...document.querySelectorAll('#wvBudgetColors input[name="wvColor"]')].map((i) => ({ value: i.value, caption: (i.closest("label").querySelector(".caption")?.textContent || "").trim(), img: i.closest("label").querySelector("img")?.getAttribute("src") || "" })));
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
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
