// Records what today's UI stores and shows on "Optionale Produkte" (Badumbau) for the two
// categories built in the second slice: "Wanne" (bathtub and Wannenaufsatz, a short wizard
// over the catalogue /api/bathtubs/catalog) and "WC" (Montageart, Sitzhöhe, required products,
// WC + seat pairs, products looked up in the price list /api/products/:id) — the reference for
// apps/web/test/optional-wanne-wc.test.tsx. The answers of the catalogue and of the price list
// are recorded with it, so the test replays the same products. The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run; ONLY=<text> records the scenarios whose name contains
// it and prints them instead of writing the file.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-optional-wanne-wc.cjs   → v2/apps/web/test/fixtures/optional-wanne-wc.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "optional-wanne-wc.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const U = [["kind", "wanne_wanne"]];
const W = [["cat", "WANNE"]];
const EL = [...W, ["set", "einbau:Ecke"], ["set", "wall:links"], ["set", "side:links"]]; // corner, wall left, door left
const T = [...EL, ["set", "mode:plain"]];
const TS = [...EL, ["set", "mode:screen"]];
const C = [["cat", "WC"]];
const WM = [...C, ["montage", "Wandmontage"]];
const BM = [...C, ["montage", "Bodenmontage"]];
// steps: ["cat", X] taps a category card · ["done"] leaves the dialog ·
//   Wanne: ["set", "key:value"] answers a question · ["act", only|reset] · ["crumb", key] changes an answer ·
//          ["more"] opens "Weitere Optionen" · ["chip", key, value] a size / drain / water / height / side-panel chip · ["pick", article] taps a product card
//   WC:    ["montage", Wandmontage|Bodenmontage] · ["seat", erhoeht|normal] · ["tile", id] taps a product
//          (a seat shown a second time: "DERSIAS__pair_DEDWWC") · ["qty", id, n] types a quantity
//   ["kind", umbauart] chooses the Umbauart on Arbeiten · ["chipx", text] removes the pick in the bar whose text contains it
const SCENARIOS = {
  "Wanne opened": [...W],
  "Wanne opened and left empty": [...W, ["done"]],
  "Wanne: corner": [...W, ["set", "einbau:Ecke"]],
  "Wanne: niche": [...W, ["set", "einbau:Nische"]],
  "Wanne: both ends free": [...W, ["set", "einbau:Vorwand"]],
  "Wanne: corner, wall right": [...W, ["set", "einbau:Ecke"], ["set", "wall:rechts"]],
  "Wanne: corner, wall left, door left": [...EL],
  "Wanne: corner, door at the free end": [...W, ["set", "einbau:Ecke"], ["set", "wall:links"], ["set", "side:rechts"]],
  "Wanne: without screen, the list": [...T],
  "Wanne: niche, without screen": [...W, ["set", "einbau:Nische"], ["set", "side:rechts"], ["set", "mode:plain"]],
  "Wanne: both ends free, without screen": [...W, ["set", "einbau:Vorwand"], ["set", "side:links"], ["set", "mode:plain"]],
  "Wanne: a size chosen": [...T, ["chip", "size", "170 × 75 cm"]],
  "Wanne: a size chosen and unchosen": [...T, ["chip", "size", "170 × 75 cm"], ["chip", "size", "170 × 75 cm"]],
  "Wanne: more options opened": [...T, ["more"]],
  "Wanne: drain Trio": [...T, ["more"], ["chip", "ablauf", "Trio"]],
  "Wanne: a tub picked": [...T, ["pick", "ST170-EL-TL"]],
  "Wanne: a tub picked, done": [...T, ["pick", "ST170-EL-TL"], ["done"]],
  "Wanne: a tub picked and unpicked": [...T, ["pick", "ST170-EL-TL"], ["pick", "ST170-EL-TL"]],
  "Wanne: another tub": [...T, ["pick", "ST170-EL-TL"], ["pick", "ST160-EL-TL-TRIO"]],
  "Wanne: Iris tub with its neck rest": [...W, ["set", "einbau:Nische"], ["set", "side:links"], ["set", "mode:plain"], ["pick", "IRIS160LS"]],
  "Wanne: with screen, no tub yet": [...TS],
  "Wanne: with screen, tub picked": [...TS, ["pick", "ST170-EL-TL"]],
  "Wanne: with screen, tub and screen": [...TS, ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"]],
  "Wanne: tub and screen, done": [...TS, ["pick", "ST170-EL-TL"], ["pick", "STSA-PT-L"], ["done"]],
  "Wanne: tub and screen, then without screen": [...TS, ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"], ["crumb", "mode"], ["set", "mode:plain"]],
  "Wanne: tub and screen, then a tub the screen does not fit": [...TS, ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"], ["crumb", "einbau"], ["set", "einbau:Vorwand"], ["set", "side:links"], ["set", "mode:plain"], ["pick", "ST170-V-TL"]],
  "Wanne: Iris corner with screen": [...W, ["set", "einbau:Ecke"], ["set", "wall:links"], ["set", "side:links"], ["set", "mode:screen"], ["pick", "IRIS160L2S"]],
  "Wanne: only a screen": [...W, ["act", "only"]],
  "Wanne: only a screen, side left": [...W, ["act", "only"], ["set", "side:links"]],
  "Wanne: only a screen, height chosen": [...W, ["act", "only"], ["set", "side:links"], ["chip", "sh", "150"]],
  "Wanne: only a screen, side panel chosen": [...W, ["act", "only"], ["set", "side:links"], ["chip", "sw", "S75"]],
  "Wanne: only a screen, picked": [...W, ["act", "only"], ["set", "side:rechts"], ["pick", "IRISWA14R"]],
  "Wanne: only a screen, picked, done": [...W, ["act", "only"], ["set", "side:rechts"], ["pick", "IRISWA14R"], ["done"]],
  "Wanne: answer changed": [...EL, ["crumb", "wall"]],
  "Wanne: begin again": [...T, ["act", "reset"]],
  "Wanne: begin again keeps the pick": [...T, ["pick", "ST170-EL-TL"], ["act", "reset"]],
  "Wanne: done, opened again": [...T, ["pick", "ST170-EL-TL"], ["done"], ["cat", "WANNE"]],
  "Wanne: tub removed in the bar": [...T, ["pick", "ST170-EL-TL"], ["done"], ["chipx", "ST170-EL-TL"]],
  "WC opened": [...C],
  "WC opened and left empty": [...C, ["done"]],
  "WC: wall": [...WM],
  "WC: wall, raised seat": [...WM, ["seat", "erhoeht"]],
  "WC: wall, normal seat": [...WM, ["seat", "normal"]],
  "WC: wall, a WC": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"]],
  "WC: wall, shower WC": [...WM, ["seat", "normal"], ["tile", "DEDWWC"]],
  "WC: wall, raised WC": [...WM, ["seat", "erhoeht"], ["tile", "CLPWWCOS5"]],
  "WC: wall, the WC off again": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["tile", "DERWWCOSVP"]],
  "WC: wall, the seat of the second pair": [...WM, ["seat", "normal"], ["tile", "DERSIAS__pair_DEDWWC"]],
  "WC: wall, the seat off": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["tile", "DERSIAS"]],
  "WC: wall, two WCs": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["qty", "DERWWCOSVP", "2"]],
  "WC: wall, seat quantity in the second pair": [...WM, ["seat", "normal"], ["tile", "DEDWWC"], ["qty", "DERSIAS__pair_DEDWWC", "2"]],
  "WC: wall, an accessory off": [...WM, ["tile", "V1DON"]],
  "WC: wall, an accessory quantity": [...WM, ["qty", "0601010003", "3"]],
  "WC: wall, raised then normal": [...WM, ["seat", "erhoeht"], ["tile", "CLPWWCOS5"], ["seat", "normal"]],
  "WC: wall, done": [...WM, ["seat", "normal"], ["tile", "DEDWWC"], ["done"]],
  "WC: wall, done, opened again": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["done"], ["cat", "WC"]],
  "WC: floor": [...BM],
  "WC: floor, the WC": [...BM, ["tile", "CLPWCF10"]],
  "WC: floor, WC and seat": [...BM, ["tile", "CLPWCF10"], ["tile", "CLPSSI"], ["qty", "CLPSSI", "2"]],
  "WC: wall, then floor": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["montage", "Bodenmontage"]],
  "WC: floor, then wall": [...BM, ["tile", "CLPWCF10"], ["montage", "Wandmontage"]],
  "WC: an accessory off, then floor and wall": [...WM, ["tile", "V1DON"], ["montage", "Bodenmontage"], ["montage", "Wandmontage"]],
  "WC: pick removed in the bar": [...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"], ["done"], ["chipx", "SCHALL"]],
  "Umbauart, a tub": [...U, ...T, ["pick", "ST170-EL-TL"]],
  "Umbauart, tub and screen": [...U, ...TS, ["pick", "ST170-EL-TL"], ["pick", "STSA-2T-L"]],
  "Umbauart, a tub picked and unpicked": [...U, ...T, ["pick", "ST170-EL-TL"], ["pick", "ST170-EL-TL"]],
  "Umbauart, a WC": [...U, ...WM, ["seat", "normal"], ["tile", "DERWWCOSVP"]],
  "Umbauart, a shower WC": [...U, ...WM, ["seat", "normal"], ["tile", "DEDWWC"]],
  "Umbauart, WC opened only": [...U, ...WM],
  "Umbauart, WC left empty": [...U, ...C, ["done"]],
};
module.exports = { SCENARIOS };
if (require.main !== module) return;

const { chromium } = require("../../node_modules/playwright");
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
  const out = { note: "generated by v2/scripts/capture-optional-wanne-wc.cjs — do not edit", catalog: null, products: {}, scenarios: [] };
  const only = process.env.ONLY || "";
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f));
  if (process.env.RESUME && kept && !only) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, steps] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (only && !name.includes(only))) continue;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort()); // product photos from outside
      // the answers the page gets: the catalogue once, the price list per article
      page.on("response", async (res) => {
        const url = res.url();
        try {
          if (url.endsWith("/api/bathtubs/catalog") && res.ok() && !out.catalog) out.catalog = await res.json();
          const m = url.match(/\/api\/products\/([^/?]+)$/);
          if (m && res.ok()) { const p = await res.json(); out.products[decodeURIComponent(m[1])] = { productId: p.productId, name: p.name ?? null, price: p.price ?? null }; }
        } catch { /* body gone */ }
      });
      page.on("dialog", (d) => { d.accept().catch(() => {}); });
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.setStep("Optional"));
      await page.waitForTimeout(800);
      const base = await page.evaluate(() => window.buildPayload());
      const type = async (sel, text) => { const inp = page.locator(sel); await inp.fill(String(text)); await inp.blur(); };
      for (const [kind, a, b] of steps) {
        if (kind === "cat") await page.locator(`#optCategories label.image-check:has(#cat_${a})`).click();
        else if (kind === "done") await page.locator("#optCategoryModal .opt-modal-done").click();
        else if (kind === "set") await page.locator(`#menu_WANNE [data-set="${a}"]`).click();
        else if (kind === "act") await page.locator(`#menu_WANNE [data-act="${a}"]`).click();
        else if (kind === "crumb") await page.locator(`#menu_WANNE [data-crumb="${a}"]`).click();
        else if (kind === "chip") await page.locator(`#menu_WANNE [data-chip="${a}"][data-val="${b}"]`).click();
        else if (kind === "more") await page.locator("#menu_WANNE .wz-more summary").click();
        else if (kind === "pick") await page.locator(`#menu_WANNE .wanne-card[data-art="${a}"]`).click();
        else if (kind === "montage") await page.locator(`#menu_WC label:has(input[name="wcMontage"][value="${a}"])`).click();
        else if (kind === "seat") await page.locator(`#menu_WC label:has(input[name="wcSeatHeight"][value="${a}"])`).click();
        else if (kind === "tile") await page.locator(`#menu_WC label.image-check:has(#opt_${a})`).click();
        else if (kind === "qty") await type(`#qty_${a}`, b);
        else if (kind === "chipx") await page.locator("#optSelectionChips .opt-chip").filter({ has: page.locator(".opt-chip-label", { hasText: a }) }).locator("button").click();
        else if (kind === "kind") {
          await page.evaluate(() => window.setStep("Arbeiten"));
          await page.locator(`#page-Arbeiten label.radio-pill:has(input[value="${a}"])`).click();
          await page.waitForTimeout(700);
          await page.evaluate(() => window.setStep("Optional"));
        }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(kind === "montage" || kind === "cat" ? 900 : 500);
      }
      await page.waitForTimeout(1500); // the tasks follow after the price answer
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const all = (sel, r = document) => [...r.querySelectorAll(sel)];
        const modal = document.getElementById("optCategoryModal");
        const panel = modal.hidden ? null : document.querySelector("#optModalBody .opt-modal-panel.is-current");
        const bar = document.getElementById("optSelectionBar");
        const cat = panel?.id.replace(/^menu_/, "");
        let wanne = null, wc = null;
        if (cat === "WANNE") {
          const step = document.getElementById("wanneStep"), res = document.getElementById("wanneResults");
          wanne = {
            question: txt(step.querySelector(".wz-q")) || null,
            tiles: all(".wz-tile", step).map((t) => ({ set: t.dataset.set, title: txt(t.querySelector("b")), sub: txt(t.querySelector("small")), off: t.disabled })),
            only: !!step.querySelector('[data-act="only"]'),
            crumbs: all("#wanneCrumbs .wz-crumb").map((c) => [c.dataset.crumb, txt(c)]),
            reset: !!document.querySelector('#wanneCrumbs [data-act="reset"]'),
            hint: txt(res.querySelector(".wanne-summary")) || null,
            heads: all(".wz-h", res).map(txt),
            notes: all(".wanne-empty", res).filter((n) => !n.closest("details") || n.closest("details").open).map(txt),
            more: res.querySelector(".wz-more") ? { summary: txt(res.querySelector(".wz-more summary")), open: res.querySelector(".wz-more").open } : null,
            chips: all("[data-chip]", res).map((c) => [c.dataset.chip, c.dataset.val, txt(c), c.getAttribute("aria-pressed") === "true"]),
            cards: all(".wanne-card", res).map((c) => ({
              art: c.dataset.art, on: c.getAttribute("aria-pressed") === "true", reco: !!c.querySelector(".wanne-reco"),
              title: txt(c.querySelector(".wanne-title")), pills: all(".wanne-pill", c).map(txt), notes: all(".wanne-note", c).map(txt),
              name: txt(c.querySelector(".wanne-name")), price: txt(c.querySelector(".wanne-price")), link: c.querySelector(".wanne-link")?.dataset.href || null,
            })),
            empty: all(".muted", res).map(txt),
            summary: txt(document.getElementById("wanneSummary")),
          };
        }
        if (cat === "WC") {
          const pick = (name) => document.querySelector(`#menu_WC input[name="${name}"]:checked`)?.value || "";
          const tile = (item) => {
            const cb = item.querySelector('input[type="checkbox"]'), id = cb.id.replace(/^opt_/, "");
            const qty = document.getElementById(`qty_${id}`);
            const cap = item.querySelector(".caption");
            return {
              id, name: txt(cap?.firstChild), art: txt(cap?.querySelector(".wc-db-meta")) || null, price: txt(cap?.querySelector(".wc-db-price")) || null,
              dims: all(".wc-dims__item", item).map((d) => [txt(d.querySelector(".wc-dims__label")), txt(d.querySelector(".wc-dims__value"))]),
              on: cb.checked, locked: cb.disabled, qty: vis(qty) ? qty.value : null,
            };
          };
          wc = {
            montage: pick("wcMontage"), seat: vis(document.getElementById("wcSeatHeightWrap")) ? pick("wcSeatHeight") : null,
            groups: all("#wcWallProductsGrid .wc-generated-group").filter(vis).map((g) => ({
              kind: g.dataset.kind, head: txt(g.querySelector("h4")),
              items: g.dataset.kind === "wc"
                ? all(".wc-pair", g).filter(vis).map((p) => all(".opt-item", p).filter(vis).map(tile))
                : all(".opt-item", g).filter(vis).map((x) => [tile(x)]),
            })),
          };
        }
        return {
          step: location.hash.slice(1),
          cards: all("#optCategories label.image-check").map((l) => ({ id: l.querySelector("input").id.replace(/^cat_/, ""), on: l.querySelector("input").checked, badge: txt(l.querySelector(".opt-cat-badge")), counted: !!l.querySelector(".opt-cat-badge.has-sel") })).filter((c) => c.on || c.counted || c.badge !== "✓ 0"),
          bar: vis(bar) ? { head: txt(bar.querySelector(".opt-selbar-head")), chips: all(".opt-chip", bar).map((c) => ({ text: txt(c.querySelector(".opt-chip-label")), title: c.title, fixed: !c.querySelector("button") })) } : null,
          dialog: panel ? { title: txt(document.getElementById("optModalTitle")), cat, wanne, wc } : null,
        };
      });
      await ctx.close();
      console.log(name);
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
  out.products = sortKeys(out.products);
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
