// Records what today's UI stores and shows on the Wandverkleidung step for the line VIGOUR
// (rows of colour / width / number, Sonderdruck, accessories and profiles, and the wall
// calculator on this line) — the reference for apps/web/test/wv-vigour.test.tsx (ADR 026,
// phase 4). Inputs are real clicks and key presses. The v2 add-ons are blocked.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-wv-vigour.cjs   → v2/apps/web/test/fixtures/wv-vigour.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "wv-vigour.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const V = [["on"], ["line", "premium"]];
const R = [...V, ["row+"]];
// steps: ["on"] · ["line", "ww"|"premium"|"standard"] · ["row+"] · ["row", n] taps row n · ["tile", colour] ·
//        ["color", n, colour] the row's own list · ["size", n, mm] · ["qty", n, "+"|"-"] · ["row-", n] ·
//        ["sonder", text] · ["acc", id] a switch · ["step", id, "+"|"-"] a quantity · ["type", id, text] ·
//        ["width", wall, cm] · ["height", cm] · ["wall", key] · ["decor", wall, colour]
const SCENARIOS = {
  "line VIGOUR": [...V],
  "one row": [...R],
  "one row, three panels": [...R, ["qty", 1, "+"], ["qty", 1, "+"]],
  "one row, 1497 mm": [...R, ["size", 1, "1497"]],
  "one row, another colour by tile": [...R, ["tile", "Stein grau"]],
  "two rows of one width, two colours": [...R, ["row+"], ["tile", "Stein beige"], ["qty", 2, "+"]],
  "three rows of one width, three colours": [...R, ["row+"], ["tile", "Stein beige"], ["row+"], ["tile", "Weiß"]],
  "two rows, two widths": [...R, ["qty", 1, "+"], ["row+"], ["size", 2, "1497"]],
  "two rows, two widths, two colours": [...R, ["row+"], ["size", 2, "1497"], ["tile", "Schiefer grau"]],
  "two rows, the first removed": [...R, ["tile", "Stein grau"], ["row+"], ["tile", "Weiß"], ["row-", 1]],
  "another row tapped once": [...R, ["row+"], ["row", 1]],
  "another row tapped twice, then its colour changed": [...R, ["row+"], ["row", 1], ["row", 1], ["tile", "Aragon schwarz"]],
  "Sonderdruck": [...R, ["tile", "Sonderdekor"]],
  "Sonderdruck with its number": [...R, ["tile", "Sonderdekor"], ["sonder", "VI-00002468"]],
  "Sonderdruck, then a colour again": [...R, ["tile", "Sonderdekor"], ["sonder", "VI-00002468"], ["tile", "Weiß"]],
  "no sealing": [...R, ["acc", "wvSealingSelected"]],
  "adhesive changed by hand, then another panel": [...R, ["step", "wvFlachenQty", "+"], ["qty", 1, "+"]],
  "no adhesive": [...R, ["qty", 1, "+"], ["acc", "wvFlachenSelected"]],
  "silicone by hand": [...R, ["step", "wvSilikonQty", "+"], ["step", "wvSilikonQty", "+"]],
  "no silicone": [...R, ["acc", "wvSilikonSelected"]],
  "end profile": [...R, ["acc", "wvEndProfileSelected"], ["step", "wvEndProfileQty", "+"]],
  "four panels, connecting profiles": [...R, ["qty", 1, "+"], ["qty", 1, "+"], ["qty", 1, "+"]],
  "four panels, one outside corner": [...R, ["qty", 1, "+"], ["qty", 1, "+"], ["qty", 1, "+"], ["step", "wvCornersCount", "+"]],
  "connecting profiles by hand, then another panel": [...R, ["qty", 1, "+"], ["step", "wvV3VQty", "+"], ["qty", 1, "+"]],
  "no connecting profiles": [...R, ["qty", 1, "+"], ["qty", 1, "+"], ["acc", "wvV3VSelected"]],
  "walls: one wall, 180 cm, no decor": [...V, ["width", "back", "180"]],
  "walls: one wall with a decor": [...V, ["width", "back", "180"], ["wall", "back"], ["decor", "back", "Stein grau"]],
  "walls: 320 cm": [...V, ["width", "back", "320"], ["wall", "back"], ["decor", "back", "Marmor weiß"]],
  "walls: corner, two colours": [...V, ["sit", "ecke"], ["width", "links", "120"], ["width", "back", "180"], ["wall", "links"], ["decor", "links", "Stein grau"], ["decor", "back", "Weiß"]],
  "walls: height 200 cm": [...V, ["width", "back", "180"], ["height", "200"], ["wall", "back"], ["decor", "back", "Marmor weiß"]],
  "walls: height 120 cm": [...V, ["width", "back", "180"], ["height", "120"], ["wall", "back"], ["decor", "back", "Marmor weiß"]],
  "walls: a row by hand stays": [...R, ["width", "back", "180"], ["wall", "back"], ["decor", "back", "Stein grau"]],
  "rows, then winwall and back": [...R, ["qty", 1, "+"], ["tile", "Stein grau"], ["line", "ww"], ["line", "premium"]],
  "rows, then switched off": [...R, ["qty", 1, "+"], ["off"]],
  "rows with two colours, then winwall": [...R, ["qty", 1, "+"], ["row+"], ["tile", "Stein grau"], ["acc", "wvV3VSelected"], ["line", "ww"]],
  "rows, then Badolux": [...R, ["qty", 1, "+"], ["line", "standard"]],
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
  const out = { note: "generated by v2/scripts/capture-wv-vigour.cjs — do not edit", colors: null, vigorPrices: {}, scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  if (process.env.RESUME && fs.existsSync(OUT + ".part")) Object.assign(out, JSON.parse(fs.readFileSync(OUT + ".part", "utf8")));
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
      page.on("response", async (res) => { // the purchase prices the calculator asks for
        const u = new URL(res.url());
        if (u.pathname === "/api/vigor-prices") { try { out.vigorPrices[u.searchParams.get("ids")] = res.ok() ? await res.json() : { status: res.status() }; } catch {} }
      });
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
      const vrow = (n) => `#wvRows .wv-row:nth-child(${n})`;
      for (const [kind, a, b] of steps) {
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click();
        else if (kind === "line") await page.locator(`${P} .tier-seg__btn[data-tier="${a}"]`).first().click();
        else if (kind === "row+") await page.locator("#wvRowAdd").click();
        else if (kind === "row") await page.locator(`${vrow(a)} > .wv-row__name`).click();
        else if (kind === "tile") await page.locator(`#wvRows #wvColors label.image-check:has(input[value="${a}"])`).click();
        else if (kind === "color") await page.locator(`${vrow(a)} > select.wv-row__color`).selectOption(b);
        else if (kind === "size") await page.locator(`${vrow(a)} > select.wv-row__sizesel`).selectOption(b);
        else if (kind === "qty") await page.locator(`${vrow(a)} > .wv-row__step [data-d="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "row-") await page.locator(`${vrow(a)} > .wv-row__del`).click();
        else if (kind === "sonder") { await page.locator("#wvSonderConfigNr").fill(a); await page.locator("#wvSonderConfigNr").blur(); }
        else if (kind === "acc") await page.locator(`${P} label.image-check:has(#${a}) .caption`).click();
        else if (kind === "step") await page.locator(`${P} .ios-stepper:has(#${a}) [data-step="${b === "+" ? 1 : -1}"]`).click();
        else if (kind === "type") { await page.locator(`#${a}`).fill(b); await page.locator(`#${a}`).blur(); }
        else if (kind === "sit") await page.locator(`#wvKeramicoCalc .kc-chip[data-sit="${a}"]`).click();
        else if (kind === "width") { const id = { links: "wvKLinks", back: "wvKBack", rechts: "wvKRechts" }[a]; await page.locator(`#${id}`).fill(b); await page.locator(`#${id}`).blur(); }
        else if (kind === "height") { await page.locator("#wvKHoehe").fill(a); await page.locator("#wvKHoehe").blur(); }
        else if (kind === "wall") await page.locator(`#wvKeramicoCalc .kc-row[data-wall="${a}"] .kc-decor`).click();
        else if (kind === "decor") await page.locator(`#wvKeramicoCalc .kc-wall-body[data-body="${a}"] label.image-check:has(input[value="${b}"])`).click();
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
        const field = (id) => { const n = el(id); return n ? { shown: vis(n.type === "checkbox" ? n.closest("label") || n : n), ...(n.type === "checkbox" ? { checked: n.checked } : { value: n.value }) } : null; };
        return {
          on: el("wvEnabled").checked, line: page.querySelector('.tier-seg__btn[aria-pressed="true"]')?.dataset.tier || "",
          rows: [...document.querySelectorAll("#wvRows .wv-row")].map((r) => ({ title: txt(r.querySelector(".wv-row__name b")), small: txt(r.querySelector(".wv-row__name small")), color: r.querySelector(".wv-row__color").value, size: r.querySelector(".wv-row__sizesel").value, qty: txt(r.querySelector("output")), open: !!r.querySelector(".wv-row__body") })),
          rowsEmpty: txt(document.querySelector("#wvRows .wv-rows-empty")),
          colorOptions: [...(document.querySelector("#wvRows .wv-row__color")?.options || [])].map((o) => [o.value, o.textContent]),
          tilesShown: vis(el("wvColors")), tilesLabel: txt(el("wvColorSection").querySelector(".sec-settings__label")),
          tileActive: [...document.querySelectorAll("#wvColors label.wv-active input")].map((i) => i.value), tileUsed: [...document.querySelectorAll("#wvColors label.wv-used input")].map((i) => i.value),
          sonderShown: vis(el("wvSonderDecorDetails")), sonder: el("wvSonderConfigNr").value,
          fields: Object.fromEntries(["wvSealingSelected", "wvFlachenSelected", "wvFlachenQty", "wvSilikonSelected", "wvSilikonQty", "wvEndProfileSelected", "wvEndProfileQty", "wvV3VSelected", "wvV3VQty", "wvCornersCount", "wvCorners"].map((id) => [id, field(id)])),
          adhesiveHint: txt(el("wvAdhesiveSuggestion")), profilesShown: vis(el("wvHmProfileSection")), accShown: vis(el("wvHmAccSection")),
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
      if (!out.colors) out.colors = await page.evaluate(() => [...document.querySelectorAll('#wvColors input[name="wvColor"]')].map((i) => ({ value: i.value, caption: (i.closest("label").querySelector(".caption")?.textContent || "").trim(), img: i.closest("label").querySelector("img")?.getAttribute("src") || "" })));
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
