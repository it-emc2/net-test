// Records what today's UI stores and shows on the step "Badewannentür" (slice 1): the existing tub
// (shape, Umbau-Check, material), the five door cards (one door at a time, quantity, colour,
// dimensions of Wien / Wien Glas), the door hinge and the four grab bars — the reference for
// apps/web/test/bwt-tuer.test.tsx (ADR 026, phase 4). The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run. Not part of slice 1: free items, note, sketch, notes.
//
//   (server up, see docs / port-slice skill)
//   CAPTURE_BASE=http://localhost:3000 node v2/scripts/capture-bwt-tuer.cjs   → v2/apps/web/test/fixtures/bwt-tuer.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "bwt-tuer.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const DOORS = { std: "bwtDoorStd", verona: "bwtDoorBudget", vario: "bwtDoorVariodoor", wien: "bwtDoorIndWien", glas: "bwtDoorIndWienGlas" };
// steps: ["shape", value] · ["umbau", flat_surface|fixture_free|not_whirlpool] · ["material", value] ·
//        ["door", key] taps a door card · ["qty", key, text] · ["color", key, value] · ["dim", key, Height|Width|StdWidth|DepthTop|DepthBottom, text] ·
//        ["anschlag", Links|Rechts] · ["grip", 30|40|60|80] · ["gripqty", n, text]
const WIEN = [["door", "wien"]];
const FULL = [["shape", "eckige Eckbadewanne"], ["material", "Acryl"], ["door", "wien"], ["qty", "wien", "2"], ["color", "wien", "silber"], ["dim", "wien", "Height", "32"], ["dim", "wien", "Width", "40.5"], ["dim", "wien", "DepthTop", "12"], ["dim", "wien", "DepthBottom", "15"], ["anschlag", "Rechts"], ["grip", 40], ["gripqty", 40, "2"]];
const SCENARIOS = {
  "opened, nothing changed": [],
  "shape: rectangular": [["shape", "Normal, rechteckig"]],
  "shape: special, then rounded corner": [["shape", "spezielle Form"], ["shape", "abgerundete Eckbadewanne"]],
  "Umbau-Check: one off": [["umbau", "fixture_free"]],
  "Umbau-Check: all off": [["umbau", "flat_surface"], ["umbau", "fixture_free"], ["umbau", "not_whirlpool"]],
  "Umbau-Check: off and on again": [["umbau", "not_whirlpool"], ["umbau", "not_whirlpool"]],
  "material: acrylic": [["material", "Acryl"]],
  "material: steel ticks the steel note": [["material", "Stahl emailliert"]],
  "material: steel, then acrylic: the note stays": [["material", "Stahl emailliert"], ["material", "Acryl"]],
  "material: cast iron": [["material", "Gusseisen"]],
  "material: not known": [["material", "Weiß ich nicht"]],
  "door: Verona": [["door", "verona"]],
  "door: Variodoor": [["door", "vario"]],
  "door: Wien": [...WIEN],
  "door: Wien Glas": [["door", "glas"]],
  "door: Standard off, no door": [["door", "std"]],
  "door: Standard off and on again": [["door", "std"], ["door", "std"]],
  "door: Standard quantity 3": [["qty", "std", "3"]],
  "door: quantity cleared": [["qty", "std", ""]],
  "door: quantity 0": [["qty", "std", "0"]],
  "door: Wien quantity 2, then Verona": [...WIEN, ["qty", "wien", "2"], ["door", "verona"]],
  "door: Verona quantity 4, off, on again": [["door", "verona"], ["qty", "verona", "4"], ["door", "verona"], ["door", "verona"]],
  "colour: Standard Bahama Beige": [["color", "std", "Beige"]],
  "colour: Standard Manhattan, then white": [["color", "std", "Manhattan"], ["color", "std", "weiß"]],
  "colour: Verona Manhattan": [["door", "verona"], ["color", "verona", "Manhattan"]],
  "colour: Variodoor Beige": [["door", "vario"], ["color", "vario", "Beige"]],
  "colour: Wien silver": [...WIEN, ["color", "wien", "silber"]],
  "colour: Wien Glas frame colour typed": [["door", "glas"], ["color", "glas", "RAL 9005"]],
  "colour: Standard Beige, then Verona (colour stays on Standard)": [["color", "std", "Beige"], ["door", "verona"]],
  "dimensions: Wien complete": [...WIEN, ["dim", "wien", "Height", "30"], ["dim", "wien", "Width", "35"], ["dim", "wien", "StdWidth", "45,5 cm"], ["dim", "wien", "DepthTop", "10"], ["dim", "wien", "DepthBottom", "12"]],
  "dimensions: Wien height with a decimal": [...WIEN, ["dim", "wien", "Height", "32.5"]],
  "dimensions: Wien standard width only": [...WIEN, ["dim", "wien", "StdWidth", "30,5 cm"]],
  "dimensions: Wien typed while the Standard door is on": [["dim", "wien", "Height", "30"]],
  "dimensions: Wien typed, then Standard door again": [...WIEN, ["dim", "wien", "Height", "30"], ["door", "std"]],
  "dimensions: Wien Glas complete": [["door", "glas"], ["dim", "glas", "Height", "28"], ["dim", "glas", "Width", "33"], ["dim", "glas", "StdWidth", "30,5 cm"], ["dim", "glas", "DepthTop", "9"], ["dim", "glas", "DepthBottom", "11"]],
  "dimensions: Wien cleared again": [...WIEN, ["dim", "wien", "Height", "30"], ["dim", "wien", "Height", ""]],
  "hinge: left": [["anschlag", "Links"]],
  "hinge: right on the Standard door": [["anschlag", "Rechts"]],
  "hinge: left on Wien with dimensions": [...WIEN, ["dim", "wien", "Height", "30"], ["anschlag", "Links"]],
  "hinge: left, then another door": [["anschlag", "Links"], ["door", "verona"]],
  "hinge: left without a door": [["door", "std"], ["anschlag", "Links"]],
  "grab bar 30": [["grip", 30]],
  "grab bar 30, quantity 4": [["grip", 30], ["gripqty", 30, "4"]],
  "grab bars 30 and 60": [["grip", 30], ["grip", 60]],
  "grab bar 30 on and off": [["grip", 30], ["grip", 30]],
  "grab bar 80, quantity cleared": [["grip", 80], ["gripqty", 80, ""]],
  "grab bar 40 quantity 0": [["grip", 40], ["gripqty", 40, "0"]],
  "all four grab bars": [["grip", 30], ["grip", 40], ["grip", 60], ["grip", 80]],
  "everything together": [...FULL],
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

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-bwt-tuer.cjs — do not edit", base: null, scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
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
      page.on("dialog", (d) => d.accept().catch(() => {}));
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BWT-Badewannentür"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("bwt"));
      await page.waitForTimeout(500);
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-bwt";
      const card = (key) => page.locator(`${P} #${DOORS[key]}`).locator("xpath=ancestor::label[1]");
      for (const [kind, a, b, c] of steps) {
        if (kind === "shape") await page.locator(`${P} label:has(input[name=bwtShape][value="${a}"])`).click();
        else if (kind === "umbau") await page.locator(`${P} label.task-card:has(input[value="${a}"])`).click();
        else if (kind === "material") await page.locator(`${P} label:has(input[name=bwtMaterial][value="${a}"])`).click();
        else if (kind === "door") await card(a).locator(".img-wrap").click();
        else if (kind === "qty") { const i = page.locator(`#${DOORS[a]}Qty`); await i.fill(b); await i.blur(); }
        else if (kind === "color") {
          if (a === "wien") await page.selectOption("#bwtDoorIndWienColor", b);
          else if (a === "glas") { const i = page.locator("#bwtDoorIndWienGlasFrameColor"); await i.fill(b); await i.blur(); }
          else await page.locator(`#${DOORS[a]}QtyWrap .bwt-door-colors button[data-value="${b}"]`).click();
        }
        else if (kind === "dim") {
          const id = `#${DOORS[a]}${b}`;
          if (b === "StdWidth") await page.selectOption(id, c);
          else { const i = page.locator(id); await i.fill(c); await i.blur(); }
        }
        else if (kind === "anschlag") await page.locator(`${P} label.door-card:has(input[name=bwtAnschlag][value="${a}"])`).click();
        else if (kind === "grip") await page.locator(`${P} label:has(#bwtAidsHaltegriff${a})`).locator(".img-wrap").click();
        else if (kind === "gripqty") { const i = page.locator(`#bwtAidsHaltegriff${a}Qty`); await i.fill(b); await i.blur(); }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(350);
      }
      await page.waitForTimeout(700);
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate((DOORS) => {
        const P = document.getElementById("page-bwt"), q = (s) => P.querySelector(s), val = (s) => q(s)?.value ?? null;
        const doors = Object.entries(DOORS).map(([key, id]) => {
          const cb = document.getElementById(id), wrap = document.getElementById(`${id}QtyWrap`), on = cb.checked;
          return { key, on, qty: on ? val(`#${id}Qty`) : null, color: on ? val(`#${id}Color`) ?? val(`#${id}FrameColor`) : null,
            dims: Object.fromEntries(["Height", "Width", "StdWidth", "DepthTop", "DepthBottom"].map((f) => [f, q(`#${id}${f}`) ? val(`#${id}${f}`) : null]).filter(([, v]) => v !== null)) };
        });
        return {
          shape: q("input[name=bwtShape]:checked")?.value ?? "",
          umbau: [...P.querySelectorAll('input[name="bwt[bwtinfoTasks][]"]:checked')].map((i) => i.value),
          material: q("input[name=bwtMaterial]:checked")?.value ?? "",
          doors, anschlag: q("input[name=bwtAnschlag]:checked")?.value ?? "",
          grips: [30, 40, 60, 80].map((n) => { const cb = document.getElementById(`bwtAidsHaltegriff${n}`); return { n, on: cb.checked, qty: cb.checked ? val(`#bwtAidsHaltegriff${n}Qty`) : null }; }),
          steelNote: document.getElementById("bwtSteelNoteEnabled").checked,
        };
      }, DOORS);
      await ctx.close();
      console.log(name);
      const elsewhere = Object.keys(now).filter((k) => k !== "bwt" && !same(base[k], now[k]));
      return { name, steps, base: sortKeys(base.bwt), bwt: sortKeys(changed(base.bwt, now.bwt)), ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}), view };
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
    out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
