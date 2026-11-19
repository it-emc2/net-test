// Records what today's UI stores and shows on the Fußboden step in the mode "Wandverkleidung
// als Fußboden": product line (winwall / VIGOUR), scope, area with calculator, decor or colour,
// for winwall the plates per format (13/15/16/17) with − / + and "↻ Vorschlag aus Fläche", for
// VIGOUR the format cards with the recommendation and the quantity, the rest of the wall cladding
// that can be used for the floor (area based, or the strips above the cladding height of the
// winwall simple view), the floor that follows the wall (added from the rest, decor follows), the
// in-page dialogs and toasts, offers opened with only the old fields (wallCladdingPanelSize +
// wallCladdingQty) or with wallCladdingWwQty, and "Ihre Auswahl" — the reference for
// apps/web/test/fussboden-wand.test.tsx (ADR 026, phase 4; main 4f91a03b + 8d04727c).
// The answers of the price list the page asked for are recorded too. The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run; ONLY=<name> records one scenario and prints it.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-fussboden-wand.cjs   → v2/apps/web/test/fixtures/fussboden-wand.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "fussboden-wand.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const W = [["on"], ["tab", "wall"]];
const A = [...W, ["area", "4,5"]]; // 4,5 m²: the cheapest cover is 1 × 100×205 + 1 × 100×250 (mixed)
const HM = [...W, ["sup", "hm"], ["area", "4,5"]];
// a wall with winwall plates that leave a rest (wall plan of the classic view, as React's
// Wandverkleidung step today): 170 cm wide, 250 cm high → 2 plates of 100 cm
const REST_WW = [["goto", "Wandverkleidung"], ["wvon"], ["wvclassic"], ["wvwidth", "back", "170"], ["wvwall", "back"], ["wvdecor", "back", 7], ["goto", "Fussboden"]];
const REST_HM = [["goto", "Wandverkleidung"], ["wvon"], ["wvline", "premium"], ["wvwidth", "back", "170"], ["wvwall", "back"], ["wvdecor", "back", 2], ["goto", "Fussboden"]];
// the winwall simple view of the wall (new offers): 3 × 100×250 in Marmor weiß, cut at 200 cm →
// strips of 3 × 1,00 × 0,50 = 1,5 m², 80 % usable = 1,2 m² rest
const STRIPS_NO_FLOOR = [["goto", "Wandverkleidung"], ["wvon"], ["wvplate", "15"], ["wvplate", "15"], ["wvplate", "15"]];
const STRIPS = [...STRIPS_NO_FLOOR, ["wvheight", "200"], ["goto", "Fussboden"]];
// offers saved earlier: only the old fields (one format + quantity), or the new JSON per format
const OLD = { addWallCladding: "on", wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingKind: "Gesamtes-Bad", wallCladdingArea: "6", wallCladdingPanelSize: "15", wallCladdingQty: "3" };
const NEW = { ...OLD, wallCladdingWwQty: JSON.stringify({ 13: 1, 15: 2, 16: 0, 17: 0 }) };
// steps: ["on"] / ["off"] the switch · ["tab", "floor"|"wall"] · ["sup", "ww"|"hm"] · ["kind", value] · ["area", text] ·
//        ["plate", fmt, "+"|"-"] a winwall plate stepper · ["resync"] "↻ Vorschlag aus Fläche" ·
//        ["decor", code] a winwall palette tile · ["custom", text] the field "Anderes Dekor" · ["color", name] a VIGOUR colour ·
//        ["card", size] a VIGOUR format card · ["qty", n] the number of panels · ["rest"] the switch "Reste anrechnen" ·
//        ["calc"] · ["row", n, length, width] · ["apply"] · ["next"] presses Weiter · ["confirm", "ok"|"cancel"] the open in-page dialog ·
//        ["open", duschwanne fields] reopens the offer with these fields (restoreConfiguratorFromOffer) · ["snap"] keeps the stored fields at this point ·
//        on the Wandverkleidung step: ["goto", step] · ["wvon"] · ["wvline", tier] · ["wvclassic"] the classic view ·
//        ["wvwidth", wall, cm] · ["wvwall", wall] · ["wvdecor", wall, n] · ["use"] "Als Fußboden verwenden" ·
//        simple view: ["wvplate", fmt] one plate more · ["wvcolor", code] the wall decor · ["wvheight", cm] the cladding height
const SCENARIOS = {
  "mode chosen": [...W],
  "scope": [...W, ["kind", "Gesamtes-Bad"]],
  "winwall: area 4,5 (mixed formats proposed)": [...A],
  "winwall: area 1 (one plate)": [...W, ["area", "1"]],
  "winwall: area 9": [...W, ["area", "9"]],
  "winwall: area changed, plates untouched": [...A, ["area", "9"]],
  "winwall: area emptied": [...A, ["area", ""]],
  "winwall: a plate more by hand": [...A, ["plate", "17", "+"]],
  "winwall: a plate less by hand": [...A, ["plate", "13", "-"]],
  "winwall: changed by hand, then the area": [...A, ["plate", "17", "+"], ["area", "9"]],
  "winwall: changed by hand, then Vorschlag": [...A, ["plate", "17", "+"], ["area", "9"], ["resync"]],
  "winwall: all plates removed": [...A, ["plate", "13", "-"], ["plate", "15", "-"]],
  "winwall: plates without an area": [...W, ["plate", "16", "+"]],
  "winwall: another decor": [...A, ["decor", "WS229"]],
  "winwall: decor from the palette that is no tile (NW 230)": [...A, ["decor", "NW230"]],
  "winwall: decor by number": [...A, ["custom", "WS 233"]],
  "winwall: decor by number of a tile": [...A, ["custom", "WS 229"]],
  "winwall: article number from the Muster": [...A, ["custom", "23015"]],
  "winwall: number not in the catalogue": [...A, ["custom", "WS 999"]],
  "winwall: number not readable": [...A, ["custom", "abc"]],
  "winwall: typed number, then a tile": [...A, ["custom", "WS 233"], ["decor", "WS000"]],
  "VIGOUR chosen": [...W, ["sup", "hm"]],
  "VIGOUR: area 4,5": [...HM],
  "VIGOUR: format picked": [...HM, ["card", "997"]],
  "VIGOUR: the wide format": [...HM, ["card", "1497"]],
  "VIGOUR: another colour": [...HM, ["card", "997"], ["color", "Stein grau"]],
  "VIGOUR: quantity typed": [...HM, ["card", "997"], ["qty", "3"]],
  "winwall plates, then the other line": [...A, ["plate", "17", "+"], ["sup", "hm"]],
  "VIGOUR format, then winwall again": [...HM, ["card", "997"], ["sup", "ww"]],
  "calculator: 2 × 3 taken over": [...W, ["calc"], ["row", 1, "2", "3"], ["apply"]],
  "filled, then mode Fußboden": [...A, ["kind", "Fehlstellen"], ["tab", "floor"]],
  "filled, mode Fußboden and back": [...A, ["kind", "Fehlstellen"], ["tab", "floor"], ["tab", "wall"]],
  "filled, then switched off": [...A, ["kind", "Fehlstellen"], ["off"]],
  "filled, off and on again": [...A, ["kind", "Fehlstellen"], ["off"], ["on"]],
  "Weiter: nothing entered": [...W, ["next"]],
  "Weiter: area without scope": [...A, ["next"]],
  "Weiter: complete": [...A, ["kind", "Fehlstellen"], ["next"]],
  "rest of winwall: offered": [...REST_WW, ...W],
  "rest of winwall: used, floor larger": [...REST_WW, ...W, ["area", "3"], ["rest"]],
  "rest of winwall: used, covers the floor": [...REST_WW, ...W, ["area", "0,5"], ["rest"]],
  "rest of winwall: plates by hand, then used": [...REST_WW, ...W, ["area", "3"], ["plate", "15", "+"], ["rest"]],
  "rest of winwall: used, then not": [...REST_WW, ...W, ["area", "3"], ["rest"], ["rest"]],
  "rest of winwall: floor without a rest decor": [...REST_WW, ...W, ["area", "3"], ["decor", "WS229"]],
  "rest of winwall: used, another decor, yes": [...REST_WW, ...W, ["area", "3"], ["rest"], ["decor", "WS229"], ["confirm", "ok"]],
  "rest of winwall: used, another decor, cancel": [...REST_WW, ...W, ["area", "3"], ["rest"], ["decor", "WS229"], ["confirm", "cancel"]],
  "rest of winwall: floor is VIGOUR": [...REST_WW, ...W, ["sup", "hm"], ["area", "3"]],
  "rest of winwall: button on the wall step": [...REST_WW.slice(0, -1), ["use"], ["area", "3"]],
  "rest of VIGOUR: offered": [...REST_HM, ...W, ["sup", "hm"], ["area", "3"]],
  "rest of VIGOUR: used": [...REST_HM, ...W, ["sup", "hm"], ["area", "3"], ["color", "Weiß"], ["rest"]],
  "rest of VIGOUR: button on the wall step": [...REST_HM.slice(0, -1), ["use"], ["area", "3"]],
  "strips: floor added from the rest": [...STRIPS],
  "strips: floor added, then plates by hand": [...STRIPS, ["plate", "13", "+"]],
  "strips: floor on before, rest switched on": [...W, ["area", "3"], ...STRIPS, ["rest"]],
  "strips: height without a rest": [["goto", "Wandverkleidung"], ["wvon"], ["wvplate", "15"], ["wvheight", "245"], ["goto", "Fussboden"]],
  "strips: wall decor changed, floor follows (yes)": [...STRIPS, ["snap"], ["goto", "Wandverkleidung"], ["wvcolor", "WS229"], ["confirm", "ok"], ["goto", "Fussboden"]],
  "strips: wall decor changed, floor stays (no)": [...STRIPS, ["snap"], ["goto", "Wandverkleidung"], ["wvcolor", "WS229"], ["confirm", "cancel"], ["goto", "Fussboden"]],
  "strips: Bodenbelag, wall decor changed, switch to winwall": [["on"], ["tab", "floor"], ...STRIPS_NO_FLOOR, ["wvheight", "200"], ["snap"], ["wvcolor", "WS229"], ["confirm", "ok"], ["goto", "Fussboden"]],
  "strips: floor switched off by hand, no new floor": [...STRIPS, ["snap"], ["off"], ["goto", "Wandverkleidung"], ["wvplate", "15"], ["goto", "Fussboden"]],
  "old offer: only format and quantity": [["open", OLD], ["goto", "Fussboden"]],
  "old offer: a plate more": [["open", OLD], ["goto", "Fussboden"], ["plate", "15", "+"]],
  "old offer: area changed": [["open", OLD], ["goto", "Fussboden"], ["area", "9"]],
  "old offer: Vorschlag": [["open", OLD], ["goto", "Fussboden"], ["resync"]],
  "offer with plates per format": [["open", NEW], ["goto", "Fussboden"]],
  "offer with plates per format: a plate more": [["open", NEW], ["goto", "Fussboden"], ["plate", "17", "+"]],
  "offer with plates per format: a plate less": [["open", NEW], ["goto", "Fussboden"], ["plate", "15", "-"]],
  "offer with plates per format: area changed": [["open", NEW], ["goto", "Fussboden"], ["area", "9"]],
  "offer with plates per format: Vorschlag": [["open", NEW], ["goto", "Fussboden"], ["resync"]],
  "offer with plates per format: another decor": [["open", NEW], ["goto", "Fussboden"], ["decor", "WS000"]],
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

/** a fresh page on a new Badumbau, on the Fußboden step; toasts are collected in window.__toasts */
async function newPage(browser, onResponse) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  await ctx.addInitScript(() => { window.__toasts = []; window.showToast = (msg, kind) => { window.__toasts.push({ msg: String(msg), kind: kind || "" }); }; });
  const page = await ctx.newPage();
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/planning/**", (r) => r.abort());
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  if (onResponse) page.on("response", onResponse);
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash === "#Kundendaten");
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.setStep("Fussboden"));
  await page.waitForTimeout(500);
  return { ctx, page };
}

/** plays one scenario in today's UI (shared with compare-fussboden-wand-prices.cjs) */
async function play(page, steps, hooks = {}) {
  const P = "#page-Fussboden", WP = "#page-Wandverkleidung";
  const WVID = { links: "wvKLinks", back: "wvKBack", rechts: "wvKRechts" };
  const dialogs = [], snaps = [];
  let next = null;
  const dialogOpen = () => page.evaluate(() => {
    const o = document.getElementById("appConfirmOverlay");
    return o && o.classList.contains("visible") ? { title: document.getElementById("appConfirmTitle").textContent, message: document.getElementById("appConfirmMessage").textContent, ok: document.getElementById("appConfirmOk").textContent, cancel: document.getElementById("appConfirmCancel").textContent } : null;
  });
  const base = await page.evaluate(() => window.buildPayload());
  for (const [kind, a, b, c] of steps) {
    if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#fbMaster)`).click();
    else if (kind === "tab") await page.locator(a === "wall" ? "#fbTabBtnWall" : "#fbTabBtnFloor").click();
    else if (kind === "sup") await page.locator(`#wcSupplierRow .wc-sup-btn[data-sup="${a}"]`).click();
    else if (kind === "kind") await page.locator(`#wallCladdingPanel label:has(input[name="wallCladdingKind"][value="${a}"])`).click();
    else if (kind === "area") { await page.locator("#wallCladdingArea").fill(a); await page.locator("#wallCladdingArea").blur(); }
    else if (kind === "plate") await page.locator(`#wcWwPlates button[data-f="${a}"][data-d="${b === "-" ? -1 : 1}"]`).click();
    else if (kind === "resync") await page.locator("#wcWwResync").click();
    else if (kind === "decor") await page.locator(`#wcWwColors [data-c="${a}"]`).click();
    else if (kind === "custom") { await page.locator("#wallCladdingWwDecorCustom").fill(a); await page.locator("#wallCladdingWwDecorCustom").blur(); }
    else if (kind === "color") await page.locator(`#wallCladdingColors label.image-check:has(input[value="${a}"])`).click();
    else if (kind === "card") await page.locator(`#wallCladdingCards .wvc-card[data-size="${a}"]`).click();
    else if (kind === "qty") { await page.locator("#wallCladdingQtyInput").fill(a); await page.locator("#wallCladdingQtyInput").blur(); }
    else if (kind === "rest") await page.locator("#wvcLeftoverRow label.sec-switch").click();
    else if (kind === "calc") await page.locator("#wvcCalcToggle").click();
    else if (kind === "row") { await page.locator(`#wvcCalcRows .floor-calc-row:nth-child(${a}) .floor-calc-length`).fill(b); await page.locator(`#wvcCalcRows .floor-calc-row:nth-child(${a}) .floor-calc-width`).fill(c); }
    else if (kind === "apply") await page.locator("#wvcCalcApply").click();
    else if (kind === "next") { await page.locator(`${P} [data-nav="next"]`).click(); await page.waitForTimeout(400); next = { step: await page.evaluate(() => location.hash.slice(1)) }; }
    else if (kind === "confirm") await page.locator(a === "ok" ? "#appConfirmOk" : "#appConfirmCancel").click();
    else if (kind === "open") {
      await page.evaluate(async (fields) => { const p = window.buildPayload(); await window.restoreConfiguratorFromOffer({ payload: { ...p, duschwanne: { ...p.duschwanne, ...fields } } }); }, a);
      await page.waitForTimeout(1500);
    }
    else if (kind === "snap") snaps.push(await page.evaluate(() => window.buildPayload()));
    else if (kind === "goto") { await page.evaluate((st) => window.setStep(st), a); await page.waitForTimeout(500); }
    else if (kind === "wvon") await page.locator(`${WP} label.sec-switch:has(#wvEnabled)`).click();
    else if (kind === "wvline") await page.locator(`${WP} .tier-seg__btn[data-tier="${a}"]`).first().click();
    else if (kind === "wvclassic") await page.locator("#wvSimple .wvs-classic").click();
    else if (kind === "wvwidth") { await page.locator(`#${WVID[a]}`).fill(b); await page.locator(`#${WVID[a]}`).blur(); }
    else if (kind === "wvwall") await page.locator(`#wvKeramicoCalc .kc-row[data-wall="${a}"] .kc-decor`).click();
    else if (kind === "wvdecor") await page.locator(`#wvKeramicoCalc .kc-wall-body[data-body="${a}"] label.image-check:nth-child(${b})`).click();
    else if (kind === "wvplate") await page.locator(`#wvSimple .wvs-plates button[data-f="${a}"][data-d="1"]`).click();
    else if (kind === "wvcolor") await page.locator(`#wvSimple .wvs-colors [data-c="${a}"]`).click();
    else if (kind === "wvheight") { await page.locator("#wvWwHeight").fill(a); await page.locator("#wvWwHeight").blur(); }
    else if (kind === "use") { await page.waitForTimeout(500); await page.evaluate(() => document.getElementById("wvLeftoverBtn").click()); await page.waitForTimeout(600); } // the button sits under the page's fixed bar: clicked by script
    else throw new Error(`step not handled: ${kind}`);
    await page.waitForTimeout(700);
    if (kind !== "confirm") { const d = await dialogOpen(); if (d) dialogs.push(d); }
    if (hooks.after) await hooks.after(kind);
  }
  await page.waitForTimeout(900);
  if (next) await page.evaluate(() => window.setStep("Fussboden"));
  return { base, next, dialogs, snaps };
}

async function viewOf(page) {
  const step = await page.evaluate(() => location.hash.slice(1));
  const wall = await page.evaluate(() => { const b = document.getElementById("wvLeftoverBox"); return { rest: b && !b.hidden ? document.getElementById("wvLeftoverText").textContent.trim() : "", button: document.getElementById("wvLeftoverBtn")?.textContent.trim() || "" }; });
  const view = await page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const vis = (n) => !!n && n.getClientRects().length > 0;
    const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
    const tiles = (root) => [...root.querySelectorAll("label.image-check")].map((l) => ({ value: l.querySelector("input").value, caption: txt(l.querySelector(".caption")), checked: l.querySelector("input").checked, disabled: l.querySelector("input").disabled }));
    const hint = el("wcWwCustomHint"), total = el("wcWwTotal"), plates = vis(el("wcWwPlatesSection"));
    return {
      on: el("fbMaster").checked, tab: el("fbTabBtnWall").getAttribute("aria-selected") === "true" ? "wall" : "floor", shown: vis(el("wallCladdingPanel")),
      supplier: document.querySelector('#wcSupplierRow .wc-sup-btn[aria-pressed="true"]')?.dataset.sup || "", kind: document.querySelector('input[name="wallCladdingKind"]:checked')?.value || "",
      rest: { shown: vis(el("wvcLeftoverRow")), hint: txt(el("wvcLeftoverHint")), checked: el("wallCladdingUseLeftover").checked, note: vis(el("wvcLeftoverNote")) ? txt(el("wvcLeftoverNote")) : "" },
      area: el("wallCladdingArea").value, calcOpen: vis(el("wvcCalcPanel")), calcToggle: txt(el("wvcCalcToggle")), calcTotal: txt(el("wvcCalcResult")),
      resync: vis(el("wcWwResyncRow")) ? { hint: txt(el("wcWwResyncHint")), button: txt(el("wcWwResync")) } : null,
      platesShown: plates,
      plates: plates ? [...document.querySelectorAll("#wcWwPlates .wvs-plate")].map((p) => ({ size: txt(p.querySelector(".wvs-plate__size")), best: txt(p.querySelector(".wvs-plate__best")), qty: txt(p.querySelector("output")), has: p.classList.contains("has"), img: ((p.querySelector(".wvs-plate__img").getAttribute("style") || "").match(/winwall\/(\w+)\.jpg/) || [])[1] || "" })) : [],
      total: plates ? { text: txt(total.querySelector("span")), small: txt(total.querySelector("small")), short: total.classList.contains("is-short") } : null,
      decorShown: vis(el("wcWwDecorSection")),
      palette: vis(el("wcWwDecorSection")) ? [...document.querySelectorAll("#wcWwColors [data-c]")].map((b) => ({ code: b.dataset.c, name: txt(b.querySelector("span")), small: txt(b.querySelector("small")), checked: b.getAttribute("aria-checked") === "true", swatch: /winwall\/\w+\.jpg/.test(b.querySelector("i").getAttribute("style") || ""), label: txt(b.querySelector("i")) })) : [],
      customShown: vis(el("wcWwCustomRow")), custom: el("wallCladdingWwDecorCustom").value, customHint: txt(hint), customKind: hint.classList.contains("is-ok") ? "ok" : hint.classList.contains("is-warn") ? "warn" : "",
      colorsShown: vis(el("wcHmColors")), colors: tiles(el("wallCladdingColors")),
      cardsShown: vis(el("wallCladdingSuggestion")),
      cards: vis(el("wallCladdingSuggestion")) ? [...document.querySelectorAll("#wallCladdingCards .wvc-card")].map((c) => ({ size: c.dataset.size, qty: c.dataset.qty, title: txt(c.querySelector(".wvc-size")), best: !!c.querySelector(".wvc-badge"), selected: c.classList.contains("wvc-selected"), count: txt(c.querySelector(".wvc-qty")), coverage: txt(c.querySelector(".wvc-coverage")), price: txt(c.querySelector(".wvc-price")), unit: txt(c.querySelector(".wvc-unit")), label: txt(c.querySelector(".wvc-select-label")) })) : [],
      qtyShown: vis(el("wallCladdingQtyRow")), qty: el("wallCladdingQtyInput").value,
      selection: vis(el("wvcProductCard")) ? [...document.querySelectorAll("#wvcProductCard .wvc-sel")].map((r) => ({ name: txt(r.querySelector(".wvc-sel__name")), meta: txt(r.querySelector(".wvc-sel__meta")), price: txt(r.querySelector(".wvc-sel__price")), badges: txt(r.querySelector(".wvc-sel__badges")), img: r.querySelector("img")?.getAttribute("src") || "" })) : [],
      toasts: (window.__toasts || []).map((t) => t.msg),
    };
  });
  view.step = step; view.wall = wall;
  return view;
}

module.exports = { SCENARIOS, OLD, NEW, BASE, token, sortKeys, changed, newPage, play, viewOf };

if (require.main === module) (async () => {
  const { chromium } = require("../../node_modules/playwright");
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-fussboden-wand.cjs — do not edit", prices: {}, products: {}, scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (process.env.ONLY && name !== process.env.ONLY) continue;
    if (have.has(name) && !process.env.ONLY) continue;
    const record = async () => {
      const { ctx, page } = await newPage(browser, async (res) => { // what the page asked the price list
        const u = new URL(res.url());
        if (!res.ok()) return;
        try {
          const one = /^\/api\/products\/([^/]+)$/.exec(u.pathname);
          if (one) { const p = await res.json(); out.products[decodeURIComponent(one[1])] = { productId: p.productId, name: p.name, price: p.price }; }
          else if (u.pathname === "/api/vigor-prices") out.prices[u.search.slice(1)] = await res.json();
        } catch {}
      });
      const { base, next, dialogs, snaps } = await play(page, steps);
      const now = await page.evaluate(() => window.buildPayload());
      const view = await viewOf(page);
      await ctx.close();
      console.log(name);
      const elsewhere = Object.keys(now).filter((k) => !["duschwanne", "wandverkleidung", "Arbeitszeit", "materials"].includes(k) && !same(base[k], now[k]));
      return {
        name, steps, duschwanne: sortKeys(changed(base.duschwanne, now.duschwanne)), arbeitszeit: sortKeys(changed(base.Arbeitszeit, now.Arbeitszeit)), wandverkleidung: sortKeys(changed(base.wandverkleidung, now.wandverkleidung)),
        ...(snaps.length ? { snaps: snaps.map((s) => ({ duschwanne: sortKeys(changed(base.duschwanne, s.duschwanne)), wandverkleidung: sortKeys(changed(base.wandverkleidung, s.wandverkleidung)) })) } : {}),
        ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}),
        dialogs, view, ...(next ? { next } : {}),
      };
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
    if (process.env.ONLY) { console.log(JSON.stringify(entry, null, 1)); await browser.close(); return; }
    out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
