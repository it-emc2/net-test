// Records what today's UI stores, shows and prices on the pages „WD · Winterdienst“ (step `wd`) and
// „HMS · Hausmeisterservice“ (step `hms`) — the art of support, the hours per visit and per month,
// the regularity, the note and the sketch — what the step "Kosten" then shows, and the total of the
// summary widget. The reference for apps/web/test/wd-hms.test.tsx (ADR 026, phase 4) and the price
// parity test of @oc/pricing (packages/pricing/test/wd-hms-parity.test.ts). Real clicks and typing;
// the v2 add-ons are blocked (the add-on texts that apply are listed in the React rules).
// Per scenario: the change of the section (and of any other section), the page as the user sees it,
// the price requests the steps caused and the last request + answer, the Kosten page and the total.
// Scenarios starting with ["open", section] restore a stored offer first (as opening it).
// TYPE=wd (default) or TYPE=hms; RESUME=1 continues an interrupted run; ONLY="name" records one
// scenario again. The sketch picture (PNG) is not kept, only whether there is one.
//
//   (own server up: see the port-slice skill)  TYPE=wd node v2/scripts/capture-wd-hms.cjs
//   → v2/apps/web/test/fixtures/winterdienst.json (TYPE=hms: hausmeister.json)
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const TYPE = process.env.TYPE || "wd";
const TILE = { wd: "WD-Winterdienst", hms: "HMS-Hausmeister-Service" }[TYPE];
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", TYPE === "wd" ? "winterdienst.json" : "hausmeister.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
if (!TILE) throw new Error(`TYPE must be wd or hms, not ${TYPE}`);

const N = `${TYPE}Note`;
const EMPTY = { ahEinsatzUmfang: "", ahMonatUmfang: "", [N]: "", [`${TYPE}SketchDataUrl`]: "", [`${TYPE}SketchJson`]: "", sketch: { json: "", dataUrl: "" } };
const FULL = { ...EMPTY, ahArt: "Haushaltsnahedienstleistungen", ahEinsatzUmfang: "2", ahMonatUmfang: "8", ahRegelmaessigkeit: "Wöchentlich", [N]: "Zufahrt über den Hof" };
const REG = ["Einmalig", "Wöchentlich", "14-tägig", "alle drei Wochen", "Monatlich", "Vierteljährlich", "Halbjährlich", "Jährlich"];
// steps: ["art", value] tap a pill of „Angebot zur Unterstützung im Alltag“ · ["num", name, text] type into an hour field and leave it ·
//        ["reg", value] tap a pill of „Regelmäßigkeit“ · ["note", text] · ["stroke", pts] sketch · ["clear"] „Skizze löschen“ ·
//        ["open", section] restore a stored offer with this section · ["payer", "sz"] · ["next"] Weiter · ["prev"] Zurück
const SCENARIOS = {
  "opened, nothing changed": [],
  "Alltagsbegleitung": [["art", "Alltagsbegleitung"]],
  "Haushaltsnahe Dienstleistungen": [["art", "Haushaltsnahedienstleistungen"]],
  "art changed": [["art", "Alltagsbegleitung"], ["art", "Haushaltsnahedienstleistungen"]],
  "art tapped twice": [["art", "Alltagsbegleitung"], ["art", "Alltagsbegleitung"]],
  "hours per visit 2": [["num", "ahEinsatzUmfang", "2"]],
  "hours per visit 2.5": [["num", "ahEinsatzUmfang", "2.5"]],
  "hours per visit 0": [["num", "ahEinsatzUmfang", "0"]],
  "hours per visit -1": [["num", "ahEinsatzUmfang", "-1"]],
  "hours per visit typed, then cleared": [["num", "ahEinsatzUmfang", "3"], ["num", "ahEinsatzUmfang", ""]],
  "hours per month 8": [["num", "ahMonatUmfang", "8"]],
  "hours per month 12.5": [["num", "ahMonatUmfang", "12.5"]],
  ...Object.fromEntries(REG.map((r) => [`regularity ${r}`, [["reg", r]]])),
  "regularity changed": [["reg", "Wöchentlich"], ["reg", "Monatlich"]],
  "note": [["note", "Zufahrt über den Hof"]],
  "note, then cleared": [["note", "abc"], ["note", ""]],
  "note with line breaks": [["note", "Zeile 1\nZeile 2"]],
  "sketch: one stroke": [["stroke", [[40, 40], [80, 60], [120, 50]]]],
  "sketch: one stroke, then cleared": [["stroke", [[40, 40], [80, 60], [120, 50]]], ["clear"]],
  "Weiter, nothing entered": [["next"]],
  "Zurück": [["prev"]],
  "everything": [["art", "Haushaltsnahedienstleistungen"], ["num", "ahEinsatzUmfang", "2"], ["num", "ahMonatUmfang", "8"], ["reg", "Wöchentlich"], ["note", "Zufahrt über den Hof"]],
  "everything, then Weiter": [["art", "Alltagsbegleitung"], ["num", "ahEinsatzUmfang", "1.5"], ["num", "ahMonatUmfang", "6"], ["reg", "14-tägig"], ["note", "Hinweis"], ["next"]],
  "Kosten: Selbstzahler": [["payer", "sz"]],
  "Kosten: Selbstzahler, everything": [["payer", "sz"], ["art", "Alltagsbegleitung"], ["num", "ahEinsatzUmfang", "2"], ["reg", "Monatlich"]],
  "reopened: everything stored": [["open", FULL]],
  "reopened: everything stored, then a note": [["open", FULL], ["note", "neu"]],
  "reopened: everything stored, then Alltagsbegleitung": [["open", FULL], ["art", "Alltagsbegleitung"]],
  "reopened: note only": [["open", { ...EMPTY, [N]: "Alt\nNotiz" }]],
  "reopened: nothing stored": [["open", {}]],
  "reopened: nothing stored, then a note": [["open", {}], ["note", "neu"]],
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
/** the logged-in user's signature name is a person's login — never kept; the date is the day of the recording,
 *  the offer number the moment of it */
const NUM = /ANG\d{4}-\d{4}-\d{6}/g;
const anon = (o) => {
  if (o && typeof o === "object") { if ("ourSignatureUser" in o) o.ourSignatureUser = "<user>"; if (o.Kundendaten?.date) o.Kundendaten.date = "<today>"; }
  return JSON.parse(JSON.stringify(o).replace(NUM, "<number>"));
};
const png = (o) => {
  const s = o?.[TYPE];
  if (s?.sketch?.dataUrl?.startsWith("data:image/png")) s.sketch.dataUrl = "<png>";
  if (typeof s?.[`${TYPE}SketchDataUrl`] === "string" && s[`${TYPE}SketchDataUrl`].startsWith("data:image/png")) s[`${TYPE}SketchDataUrl`] = "<png>";
  return o;
};

/** a new offer of TYPE in today's UI, on its own step; outside calls faked, price calls watched */
async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const page = await ctx.newPage();
  const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
  await page.route("**/api/planning/**", (r) => r.abort());
  await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const prices = [];
  page.on("response", async (res) => {
    const req = res.request();
    if (req.method() === "POST" && new URL(res.url()).pathname === "/api/price") { try { prices.push({ body: JSON.parse(req.postData() || "null"), answer: await res.json() }); } catch { /* gone */ } }
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.locator(`.tile-btn[data-step="${TILE}"]`).click();
  await page.waitForFunction(() => location.hash === "#Kundendaten");
  await page.waitForTimeout(1200);
  await page.evaluate((t) => window.setStep(t), TYPE);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__toasts = [];
    const t = window.toast;
    if (t) for (const k of Object.keys(t)) if (typeof t[k] === "function") { const f = t[k]; t[k] = function (...a) { window.__toasts.push([k, ...a.map(String)]); return f.apply(this, a); }; }
    const n = window.showNiceToast;
    if (n) window.showNiceToast = function (...a) { window.__toasts.push(["nice", ...a.map(String)]); return n.apply(this, a); };
  });
  return { ctx, page, prices };
}

async function play(page, steps) {
  const P = `#page-${TYPE}`, SK = `${P} .project-sketch`;
  const go = async (st) => { if ((await page.evaluate(() => location.hash)) !== `#${st}`) { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(500); } };
  let next = null;
  for (const [kind, a, b] of steps) {
    if (kind === "payer") await go("Kundendaten"); else if (!["next", "prev", "open"].includes(kind)) await go(TYPE);
    if (kind === "art") await page.locator(`${P} label.radio-pill:has(input[name="ahArt"][value="${a}"])`).click();
    else if (kind === "reg") await page.locator(`${P} label.radio-pill:has(input[name="ahRegelmaessigkeit"][value="${a}"])`).click();
    else if (kind === "num") { const i = page.locator(`${P} input[name="${a}"]`); await i.scrollIntoViewIfNeeded(); await i.fill(b); await i.blur(); }
    else if (kind === "note") { await page.locator(`#${TYPE}Note`).fill(a); await page.locator(`#${TYPE}Note`).blur(); }
    else if (kind === "stroke") {
      const canvas = page.locator(`${SK} .project-sketch__canvas`); await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox(), pts = a.map(([x, y]) => [box.x + x, box.y + y]);
      await page.mouse.move(...pts[0]); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...p); await page.mouse.up();
    }
    else if (kind === "clear") await page.locator(`${SK} .pad-clear`).click();
    else if (kind === "open") {
      await page.evaluate(async ([t, section]) => {
        const p = window.buildPayload();
        await window.restoreConfiguratorFromOffer({ payload: { ...p, [t]: section } });
        window.setStep(t);
      }, [TYPE, a]);
      await page.waitForTimeout(1500);
    }
    else if (kind === "payer") await page.locator(`label:has(input[name="payer"][value="${a === "sz" ? "Selbstzahler" : "Kassenkunde"}"])`).first().click();
    else if (kind === "next" || kind === "prev") { await go(TYPE); await page.locator(`${P} [data-nav="${kind}"]`).click(); await page.waitForTimeout(500); next = await page.evaluate(() => location.hash.slice(1)); }
    else throw new Error(`step not handled: ${kind}`);
    await page.waitForTimeout(350);
  }
  return next;
}

/** the page as the user sees it */
const viewOf = (page, type) => page.evaluate((t) => {
  const P = document.getElementById(`page-${t}`), txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
  const shown = (n) => !!n && n.getClientRects().length > 0;
  const pills = (name) => [...P.querySelectorAll(`input[name="${name}"]`)].map((i) => ({ value: i.value, label: txt(i.closest("label")), checked: i.checked, shown: shown(i.closest("label")) }));
  const field = (name) => { const i = P.querySelector(`input[name="${name}"]`); return { label: txt(P.querySelector(`label[for="${i.id}"]`)), value: i.value, placeholder: i.placeholder, min: i.min, step: i.step }; };
  return {
    heading: txt(P.querySelector("h2")),
    artLabel: txt(P.querySelector('[aria-label="Art der Unterstützung"]').closest(".field").querySelector(":scope > label")),
    art: pills("ahArt"), detailShown: shown(P.querySelector("#ahLeistungsTypWrap")), detail: pills("ahLeistungsTyp"),
    section: { title: txt(P.querySelector(".section-title")), subtitle: txt(P.querySelector(".section-subtitle")) },
    perVisit: field("ahEinsatzUmfang"), perMonth: field("ahMonatUmfang"),
    regLabel: txt(P.querySelector("#ahRegelmaessigkeitGroup").closest(".field").querySelector(":scope > label")), reg: pills("ahRegelmaessigkeit"),
    noteLabel: txt(P.querySelector(`label[for="${t}Note"]`)), note: P.querySelector(`#${t}Note`).value, notePlaceholder: P.querySelector(`#${t}Note`).placeholder,
    sketch: { title: txt(P.querySelector(".project-sketch__title")), subtitle: txt(P.querySelector(".project-sketch__subtitle")), hint: txt(P.querySelector(".project-sketch__hint")) },
    nav: [...P.querySelectorAll("[data-nav]")].map(txt),
    total: txt(document.getElementById("swTotalValue")),
    toasts: window.__toasts || [],
  };
}, type);

/** the step "Kosten" as the user sees it (same reading as capture-badelift.cjs) */
const kostenOf = (page) => page.evaluate(() => {
  const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
  const own = (n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join("").replace(/\s+/g, " ").trim();
  const sections = [...document.querySelectorAll("#costsSummary .kosten-section")].map((sec) => {
    const title = sec.querySelector(".kosten-section__title"), grid = sec.querySelector('.kosten-section__body div[style*="grid-template-columns"]');
    const cells = grid ? [...grid.children].slice(4) : [], rows = [];
    for (let k = 0; k < cells.length;) {
      if (cells[k].style.gridColumn) { rows.push({ subtitle: txt(cells[k]) }); k += 1; continue; }
      rows.push({ id: cells[k].dataset.lineId || "", label: own(cells[k]), tags: [...cells[k].querySelectorAll(".kosten-tag")].map(txt), qty: txt(cells[k + 1]), unit: txt(cells[k + 2]), total: txt(cells[k + 3]) }); k += 4;
    }
    return { num: txt(title.querySelector(".side-num")), title: own(title), head: grid ? [...grid.children].slice(0, 4).map(txt) : [], rows, empty: txt(sec.querySelector(".kosten-section__body > .muted")), footer: txt(sec.querySelector(".kosten-section__footer")), sums: [...sec.querySelectorAll(".kosten-sums > div")].map((d) => d.classList.contains("kosten-sums__note") ? { note: txt(d) } : { num: txt(d.querySelector(".side-num")), label: own(d.querySelector("span")), value: txt(d.querySelector("b")), rule: d.classList.contains("kosten-sums__rule"), total: d.classList.contains("kosten-sums__total") }) };
  });
  return { heading: txt(document.querySelector("#page-Kosten h2")), text: txt(document.getElementById("kostenDetailsDesc")), sections, recompute: txt(document.getElementById("btnRecomputePrice")), total: txt(document.getElementById("swTotalValue")) };
});

async function settle(page, prices, quiet = 2000) { let n = -1; while (n !== prices.length) { n = prices.length; await page.waitForTimeout(quiet); } }

module.exports = { SCENARIOS, TYPE, BASE, token, sortKeys, changed, png, anon, newPage, play, viewOf, kostenOf, settle };
if (require.main !== module) return;

const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "../../node_modules/playwright");
(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-wd-hms.cjs — do not edit", type: TYPE, base: null, scenarios: [] };
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if ((process.env.RESUME || process.env.ONLY) && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  if (process.env.ONLY) out.scenarios = out.scenarios.filter((s) => s.name !== process.env.ONLY);
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (process.env.ONLY && process.env.ONLY !== name)) continue;
    const record = async () => {
      const { ctx, page, prices } = await newPage(browser);
      try {
        await settle(page, prices, 1500);
        const base = png(await page.evaluate(() => window.buildPayload()));
        const before = prices.length;
        const next = await play(page, steps);
        await settle(page, prices);
        const now = png(await page.evaluate(() => window.buildPayload()));
        if (next !== null) await page.evaluate((t) => window.setStep(t), TYPE);
        await page.waitForTimeout(300);
        const view = await viewOf(page, TYPE);
        const last = prices.at(-1);
        await page.evaluate(() => window.setStep("Kosten"));
        await settle(page, prices, 1500);
        const kosten = await kostenOf(page);
        const price = prices.at(-1)?.answer ?? null;
        console.log(name);
        const elsewhere = Object.keys(now).filter((k) => k !== TYPE && !same(base[k], now[k]));
        return {
          name, steps, base: sortKeys(base[TYPE]), section: sortKeys(changed(base[TYPE], now[TYPE])), stored: sortKeys(now[TYPE]),
          ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(now[k] && base[k] && typeof now[k] === "object" && typeof base[k] === "object" ? changed(base[k], now[k]) : now[k])])) } : {}),
          view, ...(next !== null ? { next } : {}), priceCalls: prices.length - before,
          lastPrice: last ? { request: sortKeys(anon(png(last.body))), answer: sortKeys(last.answer) } : null,
          kosten, price,
        };
      } finally { await ctx.close(); }
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
    out.scenarios.push(JSON.parse(JSON.stringify(entry).replace(NUM, "<number>"))); // the offer number is the moment of the recording
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
