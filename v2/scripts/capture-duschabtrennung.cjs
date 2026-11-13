// Records what today's UI stores and shows on the step "Duschabtrennung (neu)": the switch, the
// cards (one enclosure each, VIGOUR or Badolux), the wizard (structure → finish → sizes), the
// widening profile, the matching quarter-circle tray and "Ihre Auswahl" — the reference for
// apps/web/test/duschabtrennung.test.tsx (ADR 026, phase 4). The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run. The VIGOUR model is 10 MB: the recording keeps the
// articles only of the enclosures the scenarios reach (fixtures/da-model-vigour.json).
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-duschabtrennung.cjs   → v2/apps/web/test/fixtures/duschabtrennung.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "duschabtrennung.json");
const MODEL_OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "da-model-vigour.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const pick = (...labels) => labels.map((l) => ["pick", 1, l]);
const N = [["on"], ...pick("Nischenlösung", "Pendeltür 1-teilig", "Serie 1.0 VIGOUR", "Linke Ausführung")];
const N8 = [...N, ["size", 1, 1, 1, "800"]];
const Q = [["on"], ...pick("Viertelkreis", "Pendeltür 2-teilig", "Radius 550 mm", "mit Beschichtung (wasserabweisend)", "silber matt")];
const BX = [["on"], ["supplier", 1, "badolux"]];
const BXN = [...BX, ...pick("Nische", "Falttür", "Anschlag links"), ["size", 1, 1, 1, "90 cm · Lissabon"]];
// steps: ["on"] / ["off"] · ["supplier", card, key] · ["pick", card, label] an answer of the open step ·
//        ["size", card, part, row, label] (row 1 = width, 2 = height) · ["answered", card, n] taps an answered row ·
//        ["back", card] · ["reset", card] · ["extra", card] the widening profile · ["extraqty", card, "+"|"-"] ·
//        ["tray", card, n] · ["add"] · ["remove", card]. Today's page has no "Weiter" button and no check of its own
const SCENARIOS = {
  "switched on": [["on"]],
  "first answer": [["on"], ...pick("Nischenlösung")],
  "structure answered": [...N],
  "complete: one door": [...N8],
  "size changed": [...N8, ["size", 1, 1, 1, "900"]],
  "with widening profile": [...N8, ["extra", 1]],
  "widening profile, three": [...N8, ["extra", 1], ["extraqty", 1, "+"], ["extraqty", 1, "+"]],
  "widening profile on and off": [...N8, ["extra", 1], ["extraqty", 1, "+"], ["extra", 1]],
  "widening profile before the size": [...N, ["extra", 1]],
  "complete, then switched off": [...N8, ["off"]],
  "complete, off and on again": [...N8, ["off"], ["on"]],
  "answered row tapped": [...N8, ["answered", 1, 2]],
  "back": [...N, ["back", 1]],
  "back twice": [...N, ["back", 1], ["back", 1]],
  "new configuration": [...N8, ["extra", 1], ["reset", 1]],
  "glass step": [["on"], ...pick("Nischenlösung", "Gleittür 3-teilig", "Linke Ausführung")],
  "glass picked, complete": [["on"], ...pick("Nischenlösung", "Gleittür 3-teilig", "Linke Ausführung", "ESG klar"), ["size", 1, 1, 1, "900"]],
  "two parts, one sized": [["on"], ...pick("Ecklösung", "Eck mit Seitenwand", "Pendeltür 1-teilig", "Serie 1.0 VIGOUR", "Linke Ausführung"), ["size", 1, 1, 1, "800"]],
  "two parts, complete": [["on"], ...pick("Ecklösung", "Eck mit Seitenwand", "Pendeltür 1-teilig", "Serie 1.0 VIGOUR", "Linke Ausführung"), ["size", 1, 1, 1, "800"], ["size", 1, 2, 1, "900"]],
  "one size only: sized by itself": [["on"], ...pick("Badewannenlösung", "Faltwand 3-teilig", "Linke Ausführung", "ESG klar")],
  "quarter circle: profile colours after the coating": [["on"], ...pick("Viertelkreis", "Pendeltür 2-teilig", "Radius 500 mm", "mit Beschichtung (wasserabweisend)")],
  "quarter circle with tray": [...Q, ["size", 1, 1, 1, "900"], ["tray", 1, 5]],
  "quarter circle, tray picked and unpicked": [...Q, ["size", 1, 1, 1, "900"], ["tray", 1, 1], ["tray", 1, 1]],
  "quarter circle, tray, then another width": [...Q, ["size", 1, 1, 1, "900"], ["tray", 1, 5], ["size", 1, 1, 1, "1000"]],
  "quarter circle, Sondermaß": [...Q, ["size", 1, 1, 1, "Sondermaß 1"]],
  "Badolux chosen": [...BX],
  "Badolux: niche, folding door": [...BXN],
  "Badolux: pendulum door": [...BX, ...pick("Nische", "Pendeltür", "Festglas links"), ["size", 1, 1, 1, "80 cm (Front 120 cm)"]],
  "Badolux: corner": [...BX, ...pick("Ecke"), ["size", 1, 1, 1, "90 cm"], ["size", 1, 2, 1, "100 cm"]],
  "Badolux: walk-in": [...BX, ...pick("Walk-In", "Wandanschluss rechts"), ["size", 1, 1, 1, "100 cm"]],
  "Badolux, then VIGOUR again": [...BXN, ["supplier", 1, "vigour"]],
  "second enclosure added": [...N8, ["add"]],
  "two enclosures, complete": [...N8, ["add"], ["supplier", 2, "badolux"], ["pick", 2, "Nische"], ["pick", 2, "Falttür"], ["pick", 2, "Anschlag links"], ["size", 2, 1, 1, "90 cm · Lissabon"]],
  "second enclosure removed": [...N8, ["add"], ["remove", 2]],
  "first of two removed": [...N8, ["add"], ["supplier", 2, "badolux"], ["pick", 2, "Nische"], ["pick", 2, "Falttür"], ["pick", 2, "Anschlag links"], ["size", 2, 1, 1, "90 cm · Lissabon"], ["remove", 1]],
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
  const out = { note: "generated by v2/scripts/capture-duschabtrennung.cjs — do not edit", visited: [], scenarios: [] };
  const visited = new Set();
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  if (process.env.RESUME && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  for (const v of out.visited || []) visited.add(v);
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
      await page.evaluate(() => window.setStep("DuschabtrennungNeu"));
      await page.waitForTimeout(500);
      const base = await page.evaluate(() => window.buildPayload());
      const P = "#page-DuschabtrennungNeu";
      await page.locator("#dac-configs .dac-wizard").first().waitFor({ state: "attached" });
      const row = (n) => `#wvWwRows .wv-row:nth-child(${n})`;
      let next = null;
      const card = (n) => page.locator(`#dac-configs [data-dac-card]:nth-child(${n})`);
      const exact = (t) => new RegExp(`^\\s*${String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
      const leaves = () => page.evaluate(() => (window.__daConfigurator.getState() || []).map((x) => x.__supplier === "vigour" && x.selections?.Duschabtrennung).filter(Boolean));
      for (const [kind, a, b, c, d] of steps) {
        if (kind === "on" || kind === "off") await page.locator(`${P} label.sec-switch:has(#daNeuToggle)`).click();
        else if (kind === "supplier") { await card(a).locator(`.dac-supplier label:has(input[value="${b}"])`).click(); await page.waitForTimeout(700); }
        else if (kind === "pick") await card(a).locator(".dac-grid .dac-opt").filter({ has: page.locator(".dac-opt-title, .dac-opt-label:not(:has(.dac-opt-title))", { hasText: exact(b) }) }).first().click();
        else if (kind === "size") await card(a).locator(`.dac-component >> nth=${b - 1}`).locator(`.dac-row--size >> nth=${c - 1}`).locator(".dac-seg__opt", { hasText: exact(d) }).click();
        else if (kind === "answered") await card(a).locator(`.dac-answered .dac-row--nav >> nth=${b - 1}`).click();
        else if (kind === "back") await card(a).locator(".dac-back").click();
        else if (kind === "reset") await card(a).locator(".dac-reset").click();
        else if (kind === "extra") await card(a).locator(".dac-extras .dac-row--item .dac-row__text").first().click();
        else if (kind === "extraqty") await card(a).locator(`.dac-extras .ios-stepper [data-step="${b === "+" ? 1 : -1}"]`).first().click();
        else if (kind === "tray") await card(a).locator(`.dac-dw .dac-row--item >> nth=${b - 1}`).locator(".dac-row__text").click();
        else if (kind === "add") { await page.locator("#dac-add-config").click(); await page.locator("#dac-configs [data-dac-card]:last-child .dac-wizard").waitFor({ state: "attached" }); }
        else if (kind === "remove") await card(a).locator("[data-dac-remove]").click();
        else if (kind === "next") { await page.locator(`${P} [data-nav="next"]`).click(); await page.waitForTimeout(400); next = { step: await page.evaluate(() => location.hash.slice(1)), alerts: [...alerts] }; }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(500);
        if (kind !== "next") for (const v of await leaves()) visited.add(v);
      }
      await page.waitForTimeout(900);
      if (next) await page.evaluate(() => window.setStep("DuschabtrennungNeu"));
      const now = await page.evaluate(() => window.buildPayload());
      const view = await page.evaluate(() => {
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (n) => (n?.innerText || "").replace(/\s+/g, " ").trim();
        const all = (root, sel) => [...root.querySelectorAll(sel)];
        const item = (r) => ({ title: txt(r.querySelector(".dac-row__text strong")), sub: txt(r.querySelector(".dac-row__text small")), on: r.getAttribute("aria-pressed") === "true", qty: r.querySelector(".ios-stepper input")?.value ?? null, stock: txt(r.querySelector(".dac-line-stock")) });
        return {
          on: document.getElementById("daNeuToggle").checked, addShown: vis(document.getElementById("dac-add-config")),
          cards: all(document, "#dac-configs [data-dac-card]").map((c) => {
            const main = c.querySelector(".dac-main"), aside = c.querySelector(".dac-summary");
            return {
              shown: vis(c), title: txt(c.querySelector("[data-dac-config-title]")), supplier: c.querySelector("[data-dac-supplier-input]:checked")?.value || "", removeShown: vis(c.querySelector("[data-dac-remove]")),
              answered: all(main, ".dac-answered .dac-row--nav").map((r) => ({ k: txt(r.querySelector(".dac-row__k")), v: txt(r.querySelector(".dac-row__v")) })),
              step: txt(main.querySelector(".dac-step-title")), back: !!main.querySelector(".dac-back"),
              options: all(main, ".dac-grid .dac-opt").map((o) => ({ title: txt(o.querySelector(".dac-opt-title") || o.querySelector(".dac-opt-label")), sub: txt(o.querySelector(".dac-opt-sub")), picture: o.querySelector(".dac-opt-sketch") ? "sketch" : o.querySelector(".dac-opt-img img")?.getAttribute("src") || "" })),
              parts: all(main, ".dac-component").map((g) => ({ label: txt(g.previousElementSibling), rows: all(g, ".dac-row--size").map((r) => ({ k: txt(r.querySelector(".dac-row__k")), opts: all(r, ".dac-seg__opt").map((b) => `${b.getAttribute("aria-pressed") === "true" ? "*" : ""}${txt(b)}`) })) })),
              extras: all(main, ".dac-extras .dac-row--item").map(item), trays: all(main, ".dac-dw .dac-row--item").map(item),
              reset: !!main.querySelector(".dac-reset"), sketch: !!main.querySelector(".dac-sketch"), info: txt(main.querySelector(".dac-info summary")),
              preview: txt(main.querySelector(".dac-leaf-preview-label")), previewSrc: main.querySelector(".dac-leaf-preview > img")?.getAttribute("src") || "",
              summary: { hint: txt(aside.querySelector(".dac-hint")), lines: all(aside, ".dac-line").map((r) => ({ ...item(r), price: txt(r.querySelector(".dac-line-price")), link: r.querySelector(".dac-line-gc")?.getAttribute("href") || "" })).map(({ on, qty, ...x }) => x), total: txt(aside.querySelector(".dac-total")) },
            };
          }),
        };
      });
      await ctx.close();
      console.log(name);
      const elsewhere = Object.keys(now).filter((k) => k !== "duschabtrennung" && !same(base[k], now[k]));
      return { name, steps, duschabtrennung: sortKeys(changed(base.duschabtrennung, now.duschabtrennung)), ...(elsewhere.length ? { elsewhere: Object.fromEntries(elsewhere.map((k) => [k, sortKeys(changed(base[k] || {}, now[k] || {}))])) } : {}), view, ...(next ? { next } : {}) };
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
    out.visited = [...visited].sort();
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  // the VIGOUR model, with the articles only of the enclosures the scenarios reached
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
  const model = await (await ctx.request.get(BASE + "/api/da-config/model/vigour")).json();
  for (const leaf of model.leaves) if (!visited.has(leaf.selections.Duschabtrennung)) for (const c of leaf.components) c.articles = [];
  fs.writeFileSync(MODEL_OUT, JSON.stringify({ note: "generated by v2/scripts/capture-duschabtrennung.cjs — do not edit", ...model }) + "\n");
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
