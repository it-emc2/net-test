// Records what today's UI stores and shows on the Wandverkleidung step of a Badumbau in the winwall
// simple view (main 64a75e08 … f14d46ec, item 2 of the main sync 2026-11-19): decor chips, the four
// plates with Menge, the total, the cladding height, the palette and "Anderes Dekor", the switch
// between simple and classic view, the folded Produktlinie, offers reopened with and without
// `wvUi`, and what the wall does to the floor (Fußboden added from the rest, decor follows).
// The reference for apps/web/test/wv-einfach.test.tsx. Inputs are real clicks and key presses
// ("Anderes Dekor" is typed key by key, as a user does). The v2 add-ons are blocked.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-wv-einfach.cjs   → v2/apps/web/test/fixtures/wv-einfach.json
//   ONLY="name|name" re-records these scenarios into the existing file; RESUME=1 continues a crashed run.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const FIXTURE = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "wv-einfach.json");
const OUT = process.env.OUT || FIXTURE;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split("|")) : null;
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const ON = ["on"];
const P = (fmt, d = "+") => ["plate", fmt, d];
const ROWS = (list) => JSON.stringify(list);
// an offer saved earlier: winwall, 2 × 100×250 Marmor weiß + 1 × 150×250 Struktur steingrau
const SAVED = { wvEnabled: true, wvSupplier: "ww", wvKind: "Deckenhoch", wvWwQty_15: "2", wvWwQty_17: "1", wvWwRows: ROWS([{ code: "WS203", fmt: "15", qty: 2 }, { code: "WS229", fmt: "17", qty: 1 }]) };
// steps: ["on"] / ["off"] the switch · ["plate", fmt, "+"|"-"] · ["color", code] a palette tile · ["tab", n] a decor chip ·
//        ["add"] "+ weiteres Dekor" · ["del", n] the × of chip n · ["other", text] typed into "Anderes Dekor", key by key ·
//        ["height", cm] "Höhe der Verkleidung" (typed, then left) · ["classic"] "Alter Konfigurator" · ["simple"] "Zur neuen Ansicht
//        wechseln" · ["fix"] "Im alten Konfigurator korrigieren" · ["lineopen"] the Produktlinie row · ["line", tier] · ["kind", value] ·
//        ["acc", sku] an accessory switch · ["open", wandverkleidung fields] reopens the offer with these fields ("<removed>" drops one) ·
//        ["confirm", "ok"|"cancel"] the open question · ["goto", step] · on the Fußboden step: ["fbon"] · ["fbwall"] the tab
//        "Wandverkleidung als Fußboden" · ["fbarea", m²] · ["next"]
const SCENARIOS = {
  "switched on": [ON],
  "one plate 100 × 250": [ON, P("15")],
  "plates in all four formats": [ON, P("13"), P("15"), P("15"), P("16"), P("17")],
  "a plate back to zero": [ON, P("15"), P("15", "-")],
  "minus at zero does nothing": [ON, P("15", "-")],
  "another decor": [ON, P("15"), ["color", "WS229"]],
  "decor without a tile (NW 230)": [ON, P("15"), P("17"), ["color", "NW230"]],
  "decor first, then plates": [ON, ["color", "NW222"], P("16")],
  "a second decor": [ON, P("15"), ["add"], P("17")],
  "a second decor without plates": [ON, P("15"), ["add"]],
  "a second decor removed": [ON, P("15"), ["add"], P("17"), ["del", 1]],
  "the palette picks the other chip's decor": [ON, P("15"), ["add"], ["color", "WS203"]],
  "chip switched, plates of the first decor": [ON, P("15"), ["add"], P("17"), ["tab", 1], P("13")],
  "typed decor number WS 233": [ON, P("15"), ["other", "WS 233"]],
  "typed article number 23013": [ON, ["other", "23013"]],
  "typed article number, format has plates": [ON, P("13"), P("13"), ["other", "NW 23013"]],
  "typed: not recognised": [ON, P("15"), ["other", "XY"]],
  "typed: not in the catalogue": [ON, P("15"), ["other", "WS 999"]],
  "typed plain colour WS 023": [ON, P("15"), ["other", "WS023"]],
  "typed, then a tile": [ON, P("15"), ["other", "23015"], ["color", "WS000"]],
  "height 230 cm": [ON, P("15"), P("15"), ["height", "230"]],
  "height above the plates": [ON, P("15"), ["height", "260"]],
  "height without a rest": [ON, P("15"), ["height", "245"]],
  "height, two decors": [ON, P("15"), P("15"), ["add"], P("17"), ["height", "200"]],
  "to the classic editor": [ON, P("15"), ["classic"]],
  "classic and back to the simple view": [ON, P("15"), ["add"], P("17"), ["classic"], ["simple"]],
  "Produktlinie row opened": [ON, ["lineopen"]],
  "line VIGOUR from the simple view": [ON, P("15"), ["lineopen"], ["line", "premium"]],
  "line VIGOUR and back": [ON, P("15"), ["lineopen"], ["line", "premium"], ["line", "ww"]],
  "line Badolux": [ON, ["lineopen"], ["line", "standard"]],
  "Ausführung and plates": [ON, ["kind", "Deckenhoch"], P("16")],
  "accessory set by hand, then a plate": [ON, P("15"), ["acc", "WS80110"], P("15")],
  "switched off": [ON, P("15"), ["off"]],
  "reopened: simple offer": [["open", { ...SAVED, wvUi: "simple" }]],
  "reopened: simple offer, a plate more": [["open", { ...SAVED, wvUi: "simple" }], P("17")],
  "reopened: older offer without wvUi (classic)": [["open", { ...SAVED, wvUi: "<removed>" }]],
  "reopened: classic offer to the simple view": [["open", { ...SAVED, wvUi: "<removed>" }], ["simple"], P("15")],
  "reopened: invalid row": [["open", { ...SAVED, wvUi: "simple", wvWwRows: ROWS([{ code: "WS203", fmt: "15", qty: 2 }, { code: null, fmt: "16", qty: 1, custom: true, text: "23014" }]) }]],
  "reopened: invalid row, plate more keeps it": [["open", { ...SAVED, wvUi: "simple", wvWwRows: ROWS([{ code: "WS203", fmt: "15", qty: 2 }, { code: null, fmt: "16", qty: 1, custom: true, text: "23014" }]) }], P("15")],
  "reopened: invalid row, to the classic editor": [["open", { ...SAVED, wvUi: "simple", wvWwRows: ROWS([{ code: "WS203", fmt: "15", qty: 2 }, { code: null, fmt: "16", qty: 1, custom: true, text: "23014" }]) }], ["fix"]],
  "floor: added from the rest": [ON, P("15"), P("15"), P("15"), ["height", "200"]],
  "floor: added, then the wall decor changes": [ON, P("15"), P("15"), P("15"), ["height", "200"], ["color", "WS229"]],
  "floor: area typed, wall decor changes (yes)": [["goto", "Fussboden"], ["fbon"], ["fbwall"], ["goto", "Wandverkleidung"], ON, P("15"), P("15"), P("15"), ["height", "200"], ["goto", "Fussboden"], ["fbarea", "3"], ["goto", "Wandverkleidung"], ["color", "WS229"], ["confirm", "ok"]],
  "floor: area typed, wall decor changes (no)": [["goto", "Fussboden"], ["fbon"], ["fbwall"], ["goto", "Wandverkleidung"], ON, P("15"), P("15"), P("15"), ["height", "200"], ["goto", "Fussboden"], ["fbarea", "3"], ["goto", "Wandverkleidung"], ["color", "WS229"], ["confirm", "cancel"]],
  "floor: rest used up by a lower height": [ON, P("15"), P("15"), P("15"), ["height", "200"], ["height", "248"]],
  "Weiter": [ON, P("15"), ["next"]],
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

/** a fresh page on a new Badumbau, on the Wandverkleidung step; toasts are collected in window.__toasts */
async function newPage(browser, onResponse) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  await ctx.addInitScript(() => { window.__toasts = []; });
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
  await page.evaluate(() => window.setStep("Wandverkleidung"));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const push = (m) => window.__toasts.push({ msg: String(m), kind: "" });
    if (window.toast) for (const k of Object.keys(window.toast)) if (typeof window.toast[k] === "function") { const f = window.toast[k]; window.toast[k] = (t, m, ...r) => { push(m ?? t); return f(t, m, ...r); }; }
    if (window.showNiceToast) { const f = window.showNiceToast; window.showNiceToast = (m, ...r) => { push(m); return f(m, ...r); }; }
  });
  return { ctx, page };
}

/** plays one scenario in today's UI (shared with compare-wv-einfach-prices.cjs) */
async function play(page, steps, hooks = {}) {
  const WP = "#page-Wandverkleidung", S = "#wvSimple";
  const dialogs = [];
  let next = null;
  const dialogOpen = () => page.evaluate(() => {
    const o = document.getElementById("appConfirmOverlay");
    return o && o.classList.contains("visible") ? { title: document.getElementById("appConfirmTitle").textContent, message: document.getElementById("appConfirmMessage").textContent, ok: document.getElementById("appConfirmOk").textContent, cancel: document.getElementById("appConfirmCancel").textContent } : null;
  });
  const base = await page.evaluate(() => window.buildPayload());
  for (const [kind, a, b] of steps) {
    if (kind === "on" || kind === "off") await page.locator(`${WP} label.sec-switch:has(#wvEnabled)`).click();
    else if (kind === "plate") await page.locator(`${S} .wvs-plates button[data-f="${a}"][data-d="${b === "-" ? -1 : 1}"]`).click();
    else if (kind === "color") await page.locator(`${S} .wvs-colors [data-c="${a}"]`).click();
    else if (kind === "tab") await page.locator(`${S} .wvs-tab[data-i="${a - 1}"]`).click({ position: { x: 12, y: 12 } });
    else if (kind === "add") await page.locator(`${S} .wvs-tab--add`).click();
    else if (kind === "del") await page.locator(`${S} .wvs-tab__del[data-del="${a - 1}"]`).click();
    else if (kind === "other") { await page.locator(`${S} .wvs-other-input`).click(); await page.locator(`${S} .wvs-other-input`).pressSequentially(a, { delay: 60 }); }
    else if (kind === "height") { await page.locator("#wvWwHeight").fill(a); await page.locator("#wvWwHeight").blur(); }
    else if (kind === "classic") await page.locator(`${S} .wvs-classic`).click();
    else if (kind === "simple") await page.locator("#wvToSimple").click();
    else if (kind === "fix") await page.locator(`${S} .wvs-bad__fix`).click();
    else if (kind === "lineopen") await page.locator("#wvLineBtn").click();
    else if (kind === "line") await page.locator(`#wvSettingsBlock .tier-seg__btn[data-tier="${a}"]`).click();
    else if (kind === "kind") await page.locator(`${WP} label.ios-check-row:has(input[name="wvKind"][value="${a}"])`).click();
    else if (kind === "acc") await page.locator(`#wvWwAccSection label.image-check:has(#wvWw_${a}) .sec-switch__track`).click();
    else if (kind === "open") {
      await page.evaluate(async (fields) => {
        const p = window.buildPayload(), wv = { ...p.wandverkleidung, ...fields };
        for (const k of Object.keys(wv)) if (wv[k] === "<removed>") delete wv[k];
        await window.restoreConfiguratorFromOffer({ payload: { ...p, wandverkleidung: wv } });
        window.setStep("Wandverkleidung");
      }, a);
      await page.waitForTimeout(1500);
    }
    else if (kind === "confirm") await page.locator(a === "ok" ? "#appConfirmOk" : "#appConfirmCancel").click();
    else if (kind === "goto") { await page.evaluate((st) => window.setStep(st), a); await page.waitForTimeout(500); }
    else if (kind === "fbon") await page.locator("#page-Fussboden label.sec-switch:has(#fbMaster)").click();
    else if (kind === "fbwall") await page.locator("#fbTabBtnWall").click();
    else if (kind === "fbarea") { await page.locator("#wallCladdingArea").fill(a); await page.locator("#wallCladdingArea").blur(); }
    else if (kind === "next") { await page.locator(`${WP} [data-nav="next"]`).click(); await page.waitForTimeout(400); next = { step: await page.evaluate(() => location.hash.slice(1)) }; }
    else throw new Error(`step not handled: ${kind}`);
    await page.waitForTimeout(700);
    if (kind !== "confirm") { const d = await dialogOpen(); if (d) dialogs.push(d); }
    if (hooks.after) await hooks.after(kind);
  }
  await page.waitForTimeout(900);
  if (next) await page.evaluate(() => window.setStep("Wandverkleidung"));
  return { base, next, dialogs };
}

async function viewOf(page) {
  await page.evaluate(() => window.setStep("Wandverkleidung"));
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const el = (id) => document.getElementById(id);
    const vis = (n) => !!n && n.getClientRects().length > 0;
    const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
    const S = el("wvSimple"), simple = vis(S);
    const hint = S.querySelector(".wvs-hint"), hh = S.querySelector(".wvs-height-hint"), bad = S.querySelector(".wvs-bad");
    const sw = (n) => ((n?.getAttribute("style") || "").match(/winwall\/(\w+)\.jpg/) || [])[1] || "";
    return {
      on: el("wvEnabled").checked,
      line: document.querySelector('#wvSettingsBlock .tier-seg__btn[aria-pressed="true"]')?.dataset.tier || "",
      lineRow: vis(el("wvLineRow")) ? txt(el("wvLineText")) : null, lineOpen: vis(el("wvSettingsBlock")),
      simple, classic: vis(el("wvWallsBlock")), toSimple: vis(el("wvToSimpleRow")),
      tabs: simple ? [...S.querySelectorAll(".wvs-tab:not(.wvs-tab--add)")].map((t) => { const c = t.cloneNode(true); c.querySelector(".wvs-tab__del")?.remove(); return { text: txt(c), pressed: t.getAttribute("aria-pressed") === "true", removable: !!t.querySelector(".wvs-tab__del"), swatch: sw(t.querySelector("i")) }; }) : [],
      plates: simple ? [...S.querySelectorAll(".wvs-plate")].map((p) => ({ size: txt(p.querySelector(".wvs-plate__size")), meta: txt(p.querySelector(".wvs-plate__meta")), qty: txt(p.querySelector("output")), has: p.classList.contains("has"), img: sw(p.querySelector(".wvs-plate__img")) })) : [],
      total: simple ? txt(S.querySelector(".wvs-total")) : "",
      bad: simple && vis(bad) ? txt(bad.querySelector("span")) : "",
      height: el("wvWwHeight").value, heightHint: simple ? txt(hh) : "", heightOk: hh.classList.contains("is-ok"),
      palette: simple ? [...S.querySelectorAll(".wvs-colors [data-c]")].map((b) => ({ code: b.dataset.c, name: txt(b.querySelector("span")), small: txt(b.querySelector("small")), checked: b.getAttribute("aria-checked") === "true", swatch: !!sw(b.querySelector("i")), label: txt(b.querySelector("i")) })) : [],
      other: S.querySelector(".wvs-other-input").value, otherHint: txt(hint), otherKind: hint.classList.contains("is-ok") ? "ok" : hint.classList.contains("is-warn") ? "warn" : "",
      rows: vis(el("wvWwRows")) ? [...document.querySelectorAll("#wvWwRows .wv-row")].map((r) => ({ title: txt(r.querySelector(".wv-row__name b")), fmt: r.querySelector("select").value, qty: txt(r.querySelector("output")) })) : null,
      toasts: (window.__toasts || []).map((t) => t.msg),
    };
  });
}

module.exports = { SCENARIOS, BASE, token, sortKeys, changed, newPage, play, viewOf };

if (require.main === module) (async () => {
  const { chromium } = require("../../node_modules/playwright");
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-wv-einfach.cjs — do not edit", scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if ((process.env.RESUME || ONLY) && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (ONLY ? !ONLY.has(name) : have.has(name)) continue;
    const record = async () => {
      const { ctx, page } = await newPage(browser);
      const { base, next, dialogs } = await play(page, steps);
      const now = await page.evaluate(() => window.buildPayload());
      const view = await viewOf(page);
      await ctx.close();
      console.log(name);
      return {
        name, steps, wandverkleidung: sortKeys(changed(base.wandverkleidung, now.wandverkleidung)), duschwanne: sortKeys(changed(base.duschwanne, now.duschwanne)),
        arbeitszeit: sortKeys(changed(base.Arbeitszeit, now.Arbeitszeit)), dialogs, view, ...(next ? { next } : {}),
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
    const at = out.scenarios.findIndex((x) => x.name === name);
    if (at >= 0) out.scenarios[at] = entry; else out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
