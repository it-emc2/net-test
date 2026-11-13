// Records what today's UI stores and shows on the Fußboden step in the mode "Wandverkleidung
// als Fußboden": product line (winwall / VIGOUR), scope, area with calculator, decor or colour,
// the plate formats with the recommendation, the quantity, the rest of the wall cladding that
// can be used for the floor, and "Ihre Auswahl" — the reference for
// apps/web/test/fussboden-wand.test.tsx (ADR 026, phase 4). The answers of the price list the
// page asked for are recorded too. The v2 add-ons are blocked. RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-fussboden-wand.cjs   → v2/apps/web/test/fixtures/fussboden-wand.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "fussboden-wand.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const W = [["on"], ["tab", "wall"]];
const A = [...W, ["area", "4,5"]];
const HM = [...W, ["sup", "hm"], ["area", "4,5"]];
// a wall with winwall plates that leave a rest: 170 cm wide, 250 cm high → 2 plates of 100 cm
const REST_WW = [["goto", "Wandverkleidung"], ["wvon"], ["wvwidth", "back", "170"], ["wvwall", "back"], ["wvdecor", "back", 7], ["goto", "Fussboden"]];
const REST_HM = [["goto", "Wandverkleidung"], ["wvon"], ["wvline", "premium"], ["wvwidth", "back", "170"], ["wvwall", "back"], ["wvdecor", "back", 2], ["goto", "Fussboden"]];
// steps: ["on"] / ["off"] the switch · ["tab", "floor"|"wall"] · ["sup", "ww"|"hm"] · ["kind", value] · ["area", text] ·
//        ["decor", value] a winwall decor tile · ["custom", text] the number of "Anderes Dekor" · ["color", name] a VIGOUR colour ·
//        ["card", size] a format card · ["qty", n] the number of panels · ["rest"] the switch "Reste anrechnen" ·
//        ["calc"] · ["row", n, length, width] · ["apply"] · ["next"] presses Weiter ·
//        on the Wandverkleidung step: ["goto", step] · ["wvon"] · ["wvline", tier] · ["wvwidth", wall, cm] · ["wvwall", wall] · ["wvdecor", wall, n] · ["use"] "Als Fußboden verwenden"
const SCENARIOS = {
  "mode chosen": [...W],
  "scope": [...W, ["kind", "Gesamtes-Bad"]],
  "winwall: area 4,5": [...A],
  "winwall: area 4,5, format picked": [...A, ["card", "15"]],
  "winwall: another format": [...A, ["card", "15"], ["card", "17"]],
  "winwall: quantity typed": [...A, ["card", "15"], ["qty", "4"]],
  "winwall: area changed after the format": [...A, ["card", "15"], ["area", "9"]],
  "winwall: area emptied after the format": [...A, ["card", "15"], ["area", ""]],
  "winwall: another decor": [...A, ["card", "15"], ["decor", "WS229"]],
  "winwall: decor by number": [...A, ["decor", "custom"], ["custom", "WS 233"]],
  "winwall: number not in the catalogue": [...A, ["decor", "custom"], ["custom", "WS 999"]],
  "winwall: number not readable": [...A, ["decor", "custom"], ["custom", "abc"]],
  "winwall: area 1 (one plate)": [...W, ["area", "1"], ["card", "15"]],
  "VIGOUR chosen": [...W, ["sup", "hm"]],
  "VIGOUR: area 4,5": [...HM],
  "VIGOUR: format picked": [...HM, ["card", "997"]],
  "VIGOUR: the wide format": [...HM, ["card", "1497"]],
  "VIGOUR: another colour": [...HM, ["card", "997"], ["color", "Stein grau"]],
  "VIGOUR: quantity typed": [...HM, ["card", "997"], ["qty", "3"]],
  "format picked, then the other line": [...A, ["card", "15"], ["sup", "hm"]],
  "VIGOUR format, then winwall again": [...HM, ["card", "997"], ["sup", "ww"]],
  "calculator: 2 × 3 taken over": [...W, ["calc"], ["row", 1, "2", "3"], ["apply"]],
  "filled, then mode Fußboden": [...A, ["kind", "Fehlstellen"], ["card", "15"], ["tab", "floor"]],
  "filled, mode Fußboden and back": [...A, ["kind", "Fehlstellen"], ["card", "15"], ["tab", "floor"], ["tab", "wall"]],
  "filled, then switched off": [...A, ["kind", "Fehlstellen"], ["card", "15"], ["off"]],
  "filled, off and on again": [...A, ["kind", "Fehlstellen"], ["card", "15"], ["off"], ["on"]],
  "Weiter: nothing entered": [...W, ["next"]],
  "Weiter: area without scope": [...A, ["next"]],
  "Weiter: area and scope, no format": [...A, ["kind", "Fehlstellen"], ["next"]],
  "Weiter: complete": [...A, ["kind", "Fehlstellen"], ["card", "15"], ["next"]],
  "rest of winwall: offered": [...REST_WW, ...W],
  "rest of winwall: used, floor larger": [...REST_WW, ...W, ["area", "3"], ["rest"]],
  "rest of winwall: used, covers the floor": [...REST_WW, ...W, ["area", "0,5"], ["rest"]],
  "rest of winwall: format first, then used": [...REST_WW, ...W, ["area", "3"], ["card", "15"], ["rest"]],
  "rest of winwall: used, then not": [...REST_WW, ...W, ["area", "3"], ["card", "15"], ["rest"], ["rest"]],
  "rest of winwall: another decor on the floor": [...REST_WW, ...W, ["area", "3"], ["decor", "WS229"]],
  "rest of winwall: floor is VIGOUR": [...REST_WW, ...W, ["sup", "hm"], ["area", "3"]],
  "rest of winwall: button on the wall step": [...REST_WW.slice(0, -1), ["use"], ["area", "3"]],
  "rest of VIGOUR: offered": [...REST_HM, ...W, ["sup", "hm"], ["area", "3"]],
  "rest of VIGOUR: used": [...REST_HM, ...W, ["sup", "hm"], ["area", "3"], ["color", "Weiß"], ["rest"]],
  "rest of VIGOUR: button on the wall step": [...REST_HM.slice(0, -1), ["use"], ["area", "3"]],
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
  const out = { note: "generated by v2/scripts/capture-fussboden-wand.cjs — do not edit", prices: {}, products: {}, scenarios: [] };
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
      page.on("response", async (res) => { // what the page asked the price list
        const u = new URL(res.url());
        if (!res.ok()) return;
        try {
          const one = /^\/api\/products\/([^/]+)$/.exec(u.pathname);
          if (one) { const p = await res.json(); out.products[decodeURIComponent(one[1])] = { productId: p.productId, name: p.name, price: p.price }; }
          else if (u.pathname === "/api/vigor-prices") out.prices[u.search.slice(1)] = await res.json();
        } catch {}
      });
      const alerts = [];
      page.on("dialog", (d) => { alerts.push(d.message()); d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("Fussboden"));
      await page.waitForTimeout(500);
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-Fussboden";
      const WVID = { links: "wvKLinks", back: "wvKBack", rechts: "wvKRechts" };
      let next = null;
      for (const [kind, a, b, c] of steps) {
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#fbMaster)`).click();
        else if (kind === "tab") await page.locator(a === "wall" ? "#fbTabBtnWall" : "#fbTabBtnFloor").click();
        else if (kind === "sup") await page.locator(`#wcSupplierRow .wc-sup-btn[data-sup="${a}"]`).click();
        else if (kind === "kind") await page.locator(`#wallCladdingPanel label:has(input[name="wallCladdingKind"][value="${a}"])`).click();
        else if (kind === "area") { await page.locator("#wallCladdingArea").fill(a); await page.locator("#wallCladdingArea").blur(); }
        else if (kind === "decor") await page.locator(`#wcWwDecors label.image-check:has(input[value="${a}"])`).click();
        else if (kind === "custom") { await page.locator("#wallCladdingWwDecorCustom").fill(a); await page.locator("#wallCladdingWwDecorCustom").blur(); }
        else if (kind === "color") await page.locator(`#wallCladdingColors label.image-check:has(input[value="${a}"])`).click();
        else if (kind === "card") await page.locator(`#wallCladdingCards .wvc-card[data-size="${a}"]`).click();
        else if (kind === "qty") { await page.locator("#wallCladdingQtyInput").fill(a); await page.locator("#wallCladdingQtyInput").blur(); }
        else if (kind === "rest") await page.locator("#wvcLeftoverRow label.sec-switch").click();
        else if (kind === "calc") await page.locator("#wvcCalcToggle").click();
        else if (kind === "row") { await page.locator(`#wvcCalcRows .floor-calc-row:nth-child(${a}) .floor-calc-length`).fill(b); await page.locator(`#wvcCalcRows .floor-calc-row:nth-child(${a}) .floor-calc-width`).fill(c); }
        else if (kind === "apply") await page.locator("#wvcCalcApply").click();
        else if (kind === "next") { await page.locator(`${P} [data-nav="next"]`).click(); await page.waitForTimeout(400); next = { step: await page.evaluate(() => location.hash.slice(1)), alerts: [...alerts] }; }
        else if (kind === "goto") { await page.evaluate((st) => window.setStep(st), a); await page.waitForTimeout(500); }
        else if (kind === "wvon") await page.locator("#page-Wandverkleidung label.sec-switch:has(#wvEnabled)").click();
        else if (kind === "wvline") await page.locator(`#page-Wandverkleidung .tier-seg__btn[data-tier="${a}"]`).first().click();
        else if (kind === "wvwidth") { await page.locator(`#${WVID[a]}`).fill(b); await page.locator(`#${WVID[a]}`).blur(); }
        else if (kind === "wvwall") await page.locator(`#wvKeramicoCalc .kc-row[data-wall="${a}"] .kc-decor`).click();
        else if (kind === "wvdecor") await page.locator(`#wvKeramicoCalc .kc-wall-body[data-body="${a}"] label.image-check:nth-child(${b})`).click();
        else if (kind === "use") { await page.waitForTimeout(500); await page.evaluate(() => document.getElementById("wvLeftoverBtn").click()); await page.waitForTimeout(600); } // the button sits under the page's fixed bar: clicked by script
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(900);
      if (next) await page.evaluate(() => window.setStep("Fussboden"));
      const now = await page.evaluate(() => window.buildPayload());
      const step = await page.evaluate(() => location.hash.slice(1));
      const wall = await page.evaluate(() => { const b = document.getElementById("wvLeftoverBox"); return { rest: b && !b.hidden ? document.getElementById("wvLeftoverText").textContent.trim() : "", button: document.getElementById("wvLeftoverBtn")?.textContent.trim() || "" }; });
      const view = await page.evaluate(() => {
        const el = (id) => document.getElementById(id);
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const tiles = (root) => [...root.querySelectorAll("label.image-check")].map((l) => ({ value: l.querySelector("input").value, caption: txt(l.querySelector(".caption")), checked: l.querySelector("input").checked, disabled: l.querySelector("input").disabled }));
        const hint = el("wcWwCustomHint");
        return {
          on: el("fbMaster").checked, tab: el("fbTabBtnWall").getAttribute("aria-selected") === "true" ? "wall" : "floor", shown: vis(el("wallCladdingPanel")),
          supplier: document.querySelector('#wcSupplierRow .wc-sup-btn[aria-pressed="true"]')?.dataset.sup || "", kind: document.querySelector('input[name="wallCladdingKind"]:checked')?.value || "",
          rest: { shown: vis(el("wvcLeftoverRow")), hint: txt(el("wvcLeftoverHint")), checked: el("wallCladdingUseLeftover").checked, note: vis(el("wvcLeftoverNote")) ? txt(el("wvcLeftoverNote")) : "" },
          area: el("wallCladdingArea").value, calcOpen: vis(el("wvcCalcPanel")), calcToggle: txt(el("wvcCalcToggle")), calcTotal: txt(el("wvcCalcResult")),
          decorShown: vis(el("wcWwDecorSection")), decors: tiles(el("wcWwDecors")), customShown: vis(el("wcWwCustomRow")), custom: el("wallCladdingWwDecorCustom").value, customHint: txt(hint), customKind: hint.classList.contains("is-ok") ? "ok" : hint.classList.contains("is-warn") ? "warn" : "",
          colorsShown: vis(el("wcHmColors")), colors: tiles(el("wallCladdingColors")),
          cardsShown: vis(el("wallCladdingSuggestion")),
          cards: vis(el("wallCladdingSuggestion")) ? [...document.querySelectorAll("#wallCladdingCards .wvc-card")].map((c) => ({ size: c.dataset.size, qty: c.dataset.qty, title: txt(c.querySelector(".wvc-size")), best: !!c.querySelector(".wvc-badge"), selected: c.classList.contains("wvc-selected"), count: txt(c.querySelector(".wvc-qty")), coverage: txt(c.querySelector(".wvc-coverage")), price: txt(c.querySelector(".wvc-price")), unit: txt(c.querySelector(".wvc-unit")), label: txt(c.querySelector(".wvc-select-label")) })) : [],
          qtyShown: vis(el("wallCladdingQtyRow")), qty: el("wallCladdingQtyInput").value,
          selection: vis(el("wvcProductCard")) ? [...document.querySelectorAll("#wvcProductCard .wvc-sel")].map((r) => ({ name: txt(r.querySelector(".wvc-sel__name")), meta: txt(r.querySelector(".wvc-sel__meta")), price: txt(r.querySelector(".wvc-sel__price")), badges: txt(r.querySelector(".wvc-sel__badges")), img: r.querySelector("img")?.getAttribute("src") || "" })) : [],
        };
      });
      view.step = step; view.wall = wall;
      await ctx.close();
      console.log(name);
      const elsewhere = Object.keys(now).filter((k) => !["duschwanne", "wandverkleidung", "Arbeitszeit", "materials"].includes(k) && !same(base[k], now[k]));
      return { name, steps, duschwanne: sortKeys(changed(base.duschwanne, now.duschwanne)), arbeitszeit: sortKeys(changed(base.Arbeitszeit, now.Arbeitszeit)), wandverkleidung: sortKeys(changed(base.wandverkleidung, now.wandverkleidung)), ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}), view, ...(next ? { next } : {}) };
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
