// Records what today's UI stores, shows and prices on the step "Badelift" (`bl`) — the main product
// card, the four accessory cards with their quantity, the free items (Freier Posten / Quick Add)
// with "+" and the trash can, the note and the sketch — and what the step "Kosten" then shows for
// the offer. The reference for apps/web/test/badelift.test.tsx and kosten-bl.test.tsx (ADR 026,
// phase 4). Real clicks and typing; the v2 add-ons are blocked (the page itself has none).
// Per scenario: the change of `bl` (and of any other section), the page as the user sees it, the
// price requests the steps caused and the last answer, and the Kosten page with the price it was
// drawn from. Scenarios starting with ["open", bl] restore a stored offer first (as opening it).
// RESUME=1 continues an interrupted run; ONLY="name" records one scenario again. The sketch
// picture (PNG) is not kept, only whether there is one.
//
//   (own server up: see the port-slice skill)  CAPTURE_BASE=http://localhost:5173 node v2/scripts/capture-badelift.cjs
//   → v2/apps/web/test/fixtures/badelift.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "badelift.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

/** the cards of the page: product id → the checkbox id of today's page */
const CARDS = { "BRS-912": "bl_brs_912", "BRS-909": "bl_brs_909", "BHT-914": "bl_bht_914", "BHT-2013": "bl_bht_2013", "BRS-802": "bl_brs_802" };
const ROW1 = [["row", 0, "name", "Sonderzubehör Sitz"], ["row", 0, "price", "199,00"], ["row", 0, "id", "BL-123"]];
const item = (productId, label, qty = 1) => ({ kind: "bl-item", group: "Badelift", label, productId, qty });
const custom = (label, productId, qty, price) => ({ kind: "bl-custom", group: "QuickAdd", label, productId, qty, price });
const MAIN = item("BRS-912", "Juwel Tuchlift Premium");
const EMPTY = { blNote: "", sketch: { json: "", dataUrl: "" } };
// steps: ["tick", productId] tap the card · ["qty", productId, text] · ["row", i, name|price|qty|id, text] fill + leave ·
//        ["add"] "+" · ["remove", i] trash can · ["note", text] · ["stroke", pts] sketch ·
//        ["open", bl] restore a stored offer with this `bl` section · ["payer", "sz"] · ["auf", text] markup (Kundendaten) · ["next"] Weiter
const SCENARIOS = {
  "opened, nothing changed": [],
  "main product off": [["tick", "BRS-912"]],
  "main product off and on again": [["tick", "BRS-912"], ["tick", "BRS-912"]],
  "main product quantity 2": [["qty", "BRS-912", "2"]],
  "main product quantity cleared": [["qty", "BRS-912", ""]],
  "main product quantity 0": [["qty", "BRS-912", "0"]],
  "main product quantity 2.5": [["qty", "BRS-912", "2.5"]],
  "main product quantity 3, off, on": [["qty", "BRS-912", "3"], ["tick", "BRS-912"], ["tick", "BRS-912"]],
  "main product quantity cleared, off": [["qty", "BRS-912", ""], ["tick", "BRS-912"]],
  "Gleittuch": [["tick", "BRS-909"]],
  "all accessories": [["tick", "BRS-909"], ["tick", "BHT-914"], ["tick", "BHT-2013"], ["tick", "BRS-802"]],
  "Halterung, quantity 2": [["tick", "BHT-914"], ["qty", "BHT-914", "2"]],
  "Ladegerät on and off": [["tick", "BHT-2013"], ["tick", "BHT-2013"]],
  "accessories only, main product off": [["tick", "BRS-912"], ["tick", "BRS-909"], ["tick", "BRS-802"]],
  "free item: complete": [...ROW1],
  "free item: name only": [["row", 0, "name", "Sonderzubehör Sitz"]],
  "free item: without article id": [["row", 0, "name", "Sitz"], ["row", 0, "price", "199,00"]],
  "free item: without price": [["row", 0, "name", "Sitz"], ["row", 0, "id", "BL-1"]],
  "free item: quantity 3": [...ROW1, ["row", 0, "qty", "3"]],
  "free item: quantity 0": [...ROW1, ["row", 0, "qty", "0"]],
  "free item: quantity 2.5": [...ROW1, ["row", 0, "qty", "2.5"]],
  "free item: price with thousands": [["row", 0, "name", "Montage"], ["row", 0, "price", "1.234,56"], ["row", 0, "id", "X1"]],
  "free item: price with a dot": [["row", 0, "name", "Montage"], ["row", 0, "price", "99.5"], ["row", 0, "id", "X2"]],
  "free item: price with letters and euro": [["row", 0, "name", "Montage"], ["row", 0, "price", "ab 12,5 €"], ["row", 0, "id", "X3"]],
  "free item: price 0": [["row", 0, "name", "Gratis"], ["row", 0, "price", "0"], ["row", 0, "id", "G1"]],
  "free item: text with spaces": [["row", 0, "name", "  Sitz  "], ["row", 0, "price", "10"], ["row", 0, "id", " A1 "]],
  "plus on an empty row": [["add"]],
  "plus on a row without article id": [["row", 0, "name", "Sitz"], ["row", 0, "price", "10"], ["add"]],
  "plus after a complete row": [...ROW1, ["add"]],
  "two free items": [...ROW1, ["add"], ["row", 1, "name", "Zweiter Posten"], ["row", 1, "price", "50"], ["row", 1, "id", "BL-2"], ["row", 1, "qty", "2"]],
  "two free items, first removed": [...ROW1, ["add"], ["row", 1, "name", "Zweiter Posten"], ["row", 1, "price", "50"], ["row", 1, "id", "BL-2"], ["remove", 0]],
  "only free item removed (cleared)": [...ROW1, ["remove", 0]],
  "note": [["note", "Badewanne 170 cm, Tuchlift passt"]],
  "note, then cleared": [["note", "abc"], ["note", ""]],
  "note with line breaks": [["note", "Zeile 1\nZeile 2"]],
  "sketch: one stroke": [["stroke", [[40, 40], [80, 60], [120, 50]]]],
  "Weiter": [["next"]],
  "everything": [["tick", "BRS-909"], ["tick", "BHT-914"], ["qty", "BHT-914", "2"], ...ROW1, ["row", 0, "qty", "2"], ["note", "Hinweis"]],
  "reopened: real offer with three products": [["open", { quickAdd: [MAIN, item("BRS-909", "Gleittuch"), item("BHT-914", "Halterung ohne zu bohren")], ...EMPTY }]],
  "reopened: quantities and two free items": [["open", { quickAdd: [item("BRS-912", "Juwel Tuchlift Premium", 2), item("BRS-802", "Akkupack für Juwel Tuchlift (Ersatzteil)", 3), custom("Sitz", "BL-1", 1, 199), custom("Montage", "BL-2", 2, 99.5)], blNote: "Alt\nNotiz", sketch: { json: "", dataUrl: "" } }]],
  "reopened: without the main product": [["open", { quickAdd: [item("BRS-909", "Gleittuch")], ...EMPTY }]],
  // a card ticked by opening an offer keeps its quantity locked until it is tapped off and on (today's restore sends no change event)
  "reopened: without the main product, then Gleittuch off, on, quantity 2": [["open", { quickAdd: [item("BRS-909", "Gleittuch")], ...EMPTY }], ["tick", "BRS-909"], ["tick", "BRS-909"], ["qty", "BRS-909", "2"]],
  "reopened: nothing chosen": [["open", { ...EMPTY }]],
  "reopened: unknown product id": [["open", { quickAdd: [MAIN, item("BRS-999", "Altes Teil")], ...EMPTY }]],
  "reopened: unknown product id, then a note": [["open", { quickAdd: [MAIN, item("BRS-999", "Altes Teil")], ...EMPTY }], ["note", "neu"]],
  "Kosten: Selbstzahler": [["payer", "sz"]],
  "Kosten: markup 60": [["auf", "60"]],
  "Kosten: markup 60, accessories and a free item": [["auf", "60"], ["tick", "BRS-909"], ["tick", "BHT-2013"], ...ROW1, ["row", 0, "qty", "2"]],
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
/** the logged-in user's signature name is a person's login — never kept */
const anon = (o) => { if (o && typeof o === "object" && "ourSignatureUser" in o) o.ourSignatureUser = "<user>"; return o; };
const png = (o) => { if (o?.bl?.sketch?.dataUrl?.startsWith("data:image/png")) o.bl.sketch.dataUrl = "<png>"; return o; };

/** a new Badelift offer in today's UI, on the step "bl"; outside calls faked, price calls watched */
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
  await page.locator('.tile-btn[data-step="BL-Badelift"]').click();
  await page.waitForFunction(() => location.hash === "#Kundendaten");
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.setStep("bl"));
  await page.waitForTimeout(600);
  // the toasts the page raises ("+" on an incomplete row)
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
  const P = "#page-bl", SK = `${P} .project-sketch`;
  const go = async (st) => { if ((await page.evaluate(() => location.hash)) !== `#${st}`) { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(500); } };
  const cell = (i, f) => page.locator(`${P} #blQuickAddItems .da-item`).nth(i).locator(`.da-${f}`);
  let next = null;
  for (const [kind, a, b, c] of steps) {
    if (["payer", "auf"].includes(kind)) await go("Kundendaten"); else if (kind !== "next" && kind !== "open") await go("bl");
    if (kind === "tick") await page.locator(`${P} label.bl-product-card:has(#${CARDS[a]}) .img-wrap`).click();
    else if (kind === "qty") { const i = page.locator(`#qty_${CARDS[a]}`); await i.scrollIntoViewIfNeeded(); await i.fill(b); await i.blur(); }
    else if (kind === "row") { const i = cell(a, b); await i.scrollIntoViewIfNeeded(); await i.fill(c); await i.blur(); }
    else if (kind === "add") await page.locator("#blQuickAddAdd").click();
    else if (kind === "remove") await page.locator(`${P} #blQuickAddItems .da-item`).nth(a).locator(".da-remove").click();
    else if (kind === "note") { await page.locator("#blNote").fill(a); await page.locator("#blNote").blur(); }
    else if (kind === "stroke") {
      const canvas = page.locator(`${SK} .project-sketch__canvas`); await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox(), pts = a.map(([x, y]) => [box.x + x, box.y + y]);
      await page.mouse.move(...pts[0]); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...p); await page.mouse.up();
    }
    else if (kind === "open") {
      await page.evaluate(async (bl) => {
        const p = window.buildPayload();
        await window.restoreConfiguratorFromOffer({ payload: { ...p, bl } });
        window.setStep("bl");
      }, a);
      await page.waitForTimeout(1500);
    }
    else if (kind === "payer") await page.locator(`label:has(input[name="payer"][value="${a === "sz" ? "Selbstzahler" : "Kassenkunde"}"])`).first().click();
    else if (kind === "auf") { await page.locator("#sonderaufschlagValue").fill(a); await page.locator("#sonderaufschlagValue").blur(); }
    else if (kind === "next") { await go("bl"); await page.locator(`${P} [data-nav="next"]`).click(); await page.waitForTimeout(500); next = await page.evaluate(() => location.hash.slice(1)); }
    else throw new Error(`step not handled: ${kind}`);
    await page.waitForTimeout(350);
  }
  return next;
}

/** the step "bl" as the user sees it */
const viewOf = (page) => page.evaluate(() => {
  const P = document.getElementById("page-bl"), q = (s) => P.querySelector(s), txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
  return {
    heading: txt(q("h2")), sections: [...P.querySelectorAll(".bl-section > .section-header")].map(txt),
    cards: [...P.querySelectorAll("label.bl-product-card")].map((l) => {
      const cb = l.querySelector('input[type="checkbox"]'), qty = P.querySelector(`#qty_${cb.id}`), img = l.querySelector(".img-wrap img");
      return { productId: cb.dataset.productId, value: cb.value, title: txt(l.querySelector(".caption strong")), sub: txt(l.querySelector(".caption-sub")), checked: cb.checked, qty: qty.value, qtyDisabled: qty.disabled, img: img.getAttribute("src"), alt: img.alt, qtyLabel: txt(l.querySelector(".bl-qty-row label")) };
    }),
    preview: { src: q(".bl-product-preview img")?.getAttribute("src") || "", alt: q(".bl-product-preview img")?.alt || "" },
    legend: q("#blQuickAddPanel .da-legend").childNodes[0].textContent.trim(), help: txt(q("#bl-quickadd-help")),
    rows: [...P.querySelectorAll("#blQuickAddItems .da-item")].map((r) => ({ name: r.querySelector(".da-name").value, price: r.querySelector(".da-price").value, qty: r.querySelector(".da-qty").value, id: r.querySelector(".da-id").value })),
    fieldLabels: [...P.querySelectorAll("#blQuickAddItems .da-item:first-child .da-label")].map((l) => l.childNodes[0].textContent.trim()),
    placeholders: [...P.querySelectorAll("#blQuickAddItems .da-item:first-child input")].map((i) => i.placeholder),
    noteLabel: txt(q('label[for="blNote"]')), note: q("#blNote").value, notePlaceholder: q("#blNote").placeholder,
    sketch: { title: txt(q(".project-sketch__title")), subtitle: txt(q(".project-sketch__subtitle")), hint: txt(q(".project-sketch__hint")) },
    toasts: window.__toasts || [],
  };
});

/** the step "Kosten" as the user sees it (same reading as capture-kosten-bwt.cjs) */
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
  return { heading: txt(document.querySelector("#page-Kosten h2")), text: txt(document.getElementById("kostenDetailsDesc")), sections, recompute: txt(document.getElementById("btnRecomputePrice")) };
});

async function settle(page, prices, quiet = 2000) { let n = -1; while (n !== prices.length) { n = prices.length; await page.waitForTimeout(quiet); } }

module.exports = { SCENARIOS, CARDS, BASE, token, sortKeys, changed, png, anon, newPage, play, viewOf, kostenOf, settle };
if (require.main !== module) return;

const { chromium } = require("../../node_modules/playwright");
(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-badelift.cjs — do not edit", base: null, scenarios: [] };
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
        if (next !== null) await page.evaluate(() => window.setStep("bl"));
        await page.waitForTimeout(300);
        const view = await viewOf(page);
        const last = prices.at(-1);
        await page.evaluate(() => window.setStep("Kosten"));
        await settle(page, prices, 1500);
        const kosten = await kostenOf(page);
        // the answer the Kosten page was drawn from: the last price answer (getCanonicalPricingData can lag behind it)
        const price = prices.at(-1)?.answer ?? await page.evaluate(() => window.getCanonicalPricingData?.() || window.__pricing || null);
        console.log(name);
        const elsewhere = Object.keys(now).filter((k) => k !== "bl" && !same(base[k], now[k]));
        return {
          name, steps, base: sortKeys(base.bl), bl: sortKeys(changed(base.bl, now.bl)), stored: sortKeys(now.bl),
          ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(now[k] && base[k] && typeof now[k] === "object" && typeof base[k] === "object" ? changed(base[k], now[k]) : now[k])])) } : {}),
          view, ...(next !== null ? { next } : {}), priceCalls: prices.length - before,
          lastPrice: last ? { request: sortKeys(anon(png(last.body))), total: last.answer?.total ?? null } : null,
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
    out.scenarios.push(entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
