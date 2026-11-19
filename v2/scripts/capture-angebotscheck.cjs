// Records what today's UI shows on the step "Angebotscheck" of a Badumbau: the overall status and,
// per section, one row per rule that applies (green rows included) — the reference for
// apps/web/test/angebotscheck.test.tsx (ADR 026, phase 4). Every scenario is recorded with the
// offer and the price its rows were drawn from; then the answers given on the page itself
// ("Nicht nötig", Ja / Nein) with what they store. The v2 add-ons are blocked.
// RESUME=1 continues an interrupted run.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-angebotscheck.cjs   → v2/apps/web/test/fixtures/angebotscheck.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "angebotscheck.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";

const AZ = ["az", "25", "030"], TRAY = ["tray"], WALL = ["wall"], CURTAIN = ["curtain"];
const pick = (...labels) => labels.map((l) => ["dapick", l]);
const DA = [["daon"], ...pick("Nischenlösung", "Pendeltür 1-teilig", "Serie 1.0 VIGOUR", "Linke Ausführung"), ["dasize", "800"]];
const BX = [["daon"], ["dasupplier", "badolux"], ...pick("Nische", "Falttür", "Anschlag links"), ["dasize", "90 cm · Lissabon"]];
const WCW = ["wc", "Wandmontage"], WCF = ["wc", "Bodenmontage"];
// set-up (each on its own step): ["az", km, travel] · ["kind", umbauart] · ["task", task] ·
//   ["tray"] a tray of 90 × 120 · ["acc", name] unticks a tray accessory · ["trayoff"] ·
//   ["wvon"] only the switch · ["wall"] a winwall wall of 170 cm · ["wvkind", value] ·
//   ["vigour", n] n VIGOUR panels · ["vtile", colour] · ["vnr", text] · ["wvacc", id] an accessory switch ·
//   ["curtain"] / ["curtainoff"] · ["daon"], ["dapick", label], ["dasize", label], ["daextra"], ["dasupplier", key] ·
//   ["opt", productId] an optional product · ["wc", montage, ...productIds] · ["auf", percent, reason] · ["payer", "sz"]
// answers on the check itself: ["ack", title] ticks / unticks "Nicht nötig" · ["rb", task, "ja" | "nein"]
//   ["wwrow", text] a winwall row more with a typed decor number (after ["wvon"] or ["wall"]).
// The wall cladding opens in the classic editor (React's; the winwall simple view of main 2026-11-18 is not built yet).
// ONLY="name|name" re-records these scenarios into the finished recording (the others stay).
const SCENARIOS = {
  "new offer": { setup: [] },
  "way to the customer entered": { setup: [AZ] },
  "Umbauart Wanne zu Dusche, nothing chosen": { setup: [AZ, ["kind", "wanne_dusche"]] },
  "Umbauart not needed": { setup: [AZ], answers: [["ack", "Umbauart gewählt"], ["ack", "Umbauart gewählt"]] },
  "tray": { setup: [AZ, TRAY] },
  "tray without Ablaufgarnitur and Stelzlager": { setup: [AZ, TRAY, ["acc", "drainSet"], ["acc", "stelzlager"]] },
  "tray and Umbauart": { setup: [AZ, ["kind", "wanne_dusche"], TRAY] },
  "old shower tray removed, no new one": { setup: [AZ, ["task", "remove_showertub"]] },
  "tray task ticked, tray switched off": { setup: [AZ, ["task", "install_tray"]] },
  "wall cladding switched on only": { setup: [AZ, ["wvon"]] },
  "wall cladding with a wall": { setup: [AZ, WALL] },
  "wall cladding with a wall and its kind": { setup: [AZ, WALL, ["wvkind", "Deckenhoch"]] },
  "VIGOUR panels": { setup: [AZ, ["vigour", 3]] },
  "VIGOUR panels with their kind": { setup: [AZ, ["vigour", 3], ["wvkind", "Deckenhoch"]] },
  "VIGOUR panels without sealing and adhesive": { setup: [AZ, ["vigour", 2], ["wvkind", "Deckenhoch"], ["wvacc", "wvSealingSelected"], ["wvacc", "wvFlachenSelected"]] },
  "VIGOUR Sonderdruck": { setup: [AZ, ["vigour", 1], ["vtile", "Sonderdekor"]] },
  "VIGOUR Sonderdruck with its number": { setup: [AZ, ["vigour", 1], ["vtile", "Sonderdekor"], ["vnr", "VI-00002468"]] },
  "wall cladding and Trockenbau": { setup: [AZ, WALL, ["task", "trockenbau_duschbereich"]] },
  "Trockenbau without wall cladding": { setup: [AZ, ["task", "trockenbau_wc"]] },
  "shower curtain": { setup: [AZ, CURTAIN] },
  "shower curtain with its task": { setup: [AZ, CURTAIN, ["task", "install_shower_curtain"]], answers: [["rb", "remove_shower_curtain", "ja"], ["rb", "remove_enclosure", "nein"], ["rb", "remove_enclosure", "ja"], ["rb", "remove_shower_curtain", "nein"]] },
  "shower curtain switched off again": { setup: [AZ, CURTAIN, ["curtainoff"]] },
  "curtain task without a curtain": { setup: [AZ, ["task", "install_shower_curtain"]] },
  "enclosure VIGOUR": { setup: [AZ, ...DA], answers: [["ack", "Verbreiterungsprofil geprüft"]] },
  "enclosure VIGOUR with widening profile and task": { setup: [AZ, ...DA, ["daextra"], ["task", "install_enclosure"]] },
  "enclosure Badolux": { setup: [AZ, ...BX] },
  "enclosure task without an enclosure": { setup: [AZ, ["task", "install_enclosure"], ["task", "install_distance_profile"]] },
  "tray and enclosure": { setup: [AZ, TRAY, ...DA] },
  "wash basin": { setup: [AZ, ["opt", "CL60"]] },
  "wash basin with its task": { setup: [AZ, ["opt", "CL60"], ["task", "install_sink"]], answers: [["rb", "remove_sink", "nein"], ["rb", "remove_sink", "ja"]] },
  "wash basin without siphon": { setup: [AZ, ["opt", "CL60"], ["opt", "RSL"]] },
  "basin task without a basin": { setup: [AZ, ["task", "install_sink"]] },
  "thermostat with its task": { setup: [AZ, ["opt", "CLTB"], ["task", "replace_thermostat"]] },
  "thermostat task without product": { setup: [AZ, ["task", "replace_thermostat"]] },
  "shower system, no task": { setup: [AZ, ["opt", "TEMPDSU250"]] },
  "shower system with one of its two tasks": { setup: [AZ, ["opt", "TEMPDSU250"], ["task", "replace_shower_with_thermo"]] },
  "basin tap, shower basket and lifting unit": { setup: [AZ, ["opt", "CL_BASIN"], ["opt", "DUSCHKORB01"], ["opt", "HEBEFIXMINI"], ["task", "install_shower_basket"]] },
  "wall-hung WC": { setup: [AZ, [...WCW, "DERWWCOSVP", "V1DON"]], answers: [["ack", "Zubehör zum WC vollständig"], ["ack", "Zubehör zum WC vollständig"]] },
  "wall-hung WC with its task": { setup: [AZ, [...WCW, "DERWWCOSVP"], ["task", "install_toilet"]], answers: [["rb", "remove_toilet", "ja"]] },
  "floor-standing WC": { setup: [AZ, [...WCF, "CLPWCF10"]] },
  "WC task without a WC": { setup: [AZ, ["task", "install_shower_wc"]] },
  "grab bar": { setup: [AZ, ["opt", "CLPESG30"]] },
  "markup under the minimum with a reason": { setup: [AZ, ["auf", "20", "Stammkunde"]] },
  "Selbstzahler, markup under the minimum": { setup: [AZ, ["payer", "sz"], ["auf", "30", "Abgesprochen"]] },
  // main 68b454a9 / 81f73fc7: winwall plates count as panels; a row with an invalid decor is no plate
  "winwall row with an invalid decor": { setup: [AZ, ["wvon"], ["wvkind", "Deckenhoch"], ["wwrow", "23014"]] },
  "winwall wall and a row with an invalid decor": { setup: [AZ, WALL, ["wvkind", "Deckenhoch"], ["wwrow", "23014"]] },
  "nearly everything in order": { setup: [AZ, ["kind", "wanne_dusche"], TRAY, ["vigour", 2], ["wvkind", "Deckenhoch"], ...DA, ["daextra"]] },
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
  const out = { note: "generated by v2/scripts/capture-angebotscheck.cjs — do not edit", scenarios: [] };
  // RESUME=1: keep what an interrupted run already recorded (this machine crashes at random)
  const kept = [OUT + ".part", OUT].find((f) => fs.existsSync(f)); // …or add scenarios to a finished recording
  const only = process.env.ONLY ? new Set(process.env.ONLY.split("|")) : null;
  if ((process.env.RESUME || only) && kept) Object.assign(out, JSON.parse(fs.readFileSync(kept, "utf8")));
  if (only && !process.env.RESUME) out.scenarios = out.scenarios.filter((x) => !only.has(x.name));
  const have = new Set(out.scenarios.map((x) => x.name));
  for (const [name, { setup, answers = [] }] of Object.entries(SCENARIOS)) {
    if (have.has(name) || (only && !only.has(name))) continue;
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
      const go = async (st) => { await page.evaluate((x) => window.setStep(x), st); await page.waitForTimeout(400); };
      const base = await page.evaluate(() => window.buildPayload());
      const exact = (t) => new RegExp(`^\\s*${String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
      const card = page.locator("#dac-configs [data-dac-card]:nth-child(1)");
      for (const [kind, a, b, ...rest] of setup) {
        if (kind === "az") { await go("Arbeitszeit"); await page.evaluate(([km, tt]) => { for (const [id, v] of [["distanceKm", km], ["travelTime", tt]]) { const el = document.getElementById(id); el.value = v; for (const e of ["input", "change"]) el.dispatchEvent(new Event(e, { bubbles: true })); el.dispatchEvent(new FocusEvent("blur")); } }, [a, b]); }
        else if (kind === "kind") { await go("Arbeiten"); await page.locator(`#page-Arbeiten label.radio-pill:has(input[value="${a}"])`).click(); }
        else if (kind === "task") { await go("Arbeiten"); await page.evaluate(() => document.querySelectorAll("#page-Arbeiten details").forEach((d) => { d.open = true; })); await page.locator(`#page-Arbeiten label.task-card:has(input[value="${a}"])`).click(); }
        else if (kind === "tray") { const P = "#page-Duschwanne"; await go("Duschwanne"); if (!(await page.locator("#dwTrayToggle").isChecked())) await page.locator(`${P} label.sec-switch:has(#dwTrayToggle)`).click(); await page.locator(`${P} input[name="tray_w_cm"]`).fill("90"); await page.locator(`${P} input[name="tray_l_cm"]`).fill("120"); await page.locator(`${P} input[name="tray_l_cm"]`).blur(); await page.waitForTimeout(1200); await page.locator("#tray-suggestions .suggestion-list:not(.suggestion-pinned .suggestion-list) label.suggestion-card:nth-child(1)").last().click(); }
        else if (kind === "trayoff") { await go("Duschwanne"); if (await page.locator("#dwTrayToggle").isChecked()) await page.locator("#page-Duschwanne label.sec-switch:has(#dwTrayToggle)").click(); }
        else if (kind === "acc") { await go("Duschwanne"); await page.evaluate((n) => document.querySelector(`#page-Duschwanne input[name="${n}"]`).click(), a); }
        else if (kind === "wvon") { await go("Wandverkleidung"); await page.locator("#page-Wandverkleidung label.sec-switch:has(#wvEnabled)").click(); await page.waitForTimeout(500); if (await page.locator("#wvSimple .wvs-classic").isVisible()) await page.locator("#wvSimple .wvs-classic").click(); }
        else if (kind === "wwrow") { await go("Wandverkleidung"); await page.locator("#wvWwRowAdd").click(); await page.locator('#wvWwDecors label.image-check:has(input[value="custom"])').click(); await page.locator("#wvWwDecorCustom").fill(a); await page.locator("#wvWwDecorCustom").blur(); }
        else if (kind === "wall") { await go("Wandverkleidung"); await page.locator("#page-Wandverkleidung label.sec-switch:has(#wvEnabled)").click(); await page.waitForTimeout(500); if (await page.locator("#wvSimple .wvs-classic").isVisible()) await page.locator("#wvSimple .wvs-classic").click(); await page.locator("#wvKBack").fill("170"); await page.locator("#wvKBack").blur(); await page.waitForTimeout(600); await page.locator('#wvKeramicoCalc .kc-row[data-wall="back"] .kc-decor').click(); await page.locator('#wvKeramicoCalc .kc-wall-body[data-body="back"] label.image-check:nth-child(7)').click(); }
        else if (kind === "vigour") { const P = "#page-Wandverkleidung"; await go("Wandverkleidung"); await page.locator(`${P} label.sec-switch:has(#wvEnabled)`).click(); await page.locator(`${P} .tier-seg__btn[data-tier="premium"]`).first().click(); await page.locator("#wvRowAdd").click(); for (let k = 1; k < a; k++) await page.locator('#wvRows .wv-row:nth-child(1) > .wv-row__step [data-d="1"]').click(); }
        else if (kind === "vtile") await page.locator(`#wvRows #wvColors label.image-check:has(input[value="${a}"])`).click();
        else if (kind === "vnr") { await page.locator("#wvSonderConfigNr").fill(a); await page.locator("#wvSonderConfigNr").blur(); }
        else if (kind === "wvacc") await page.locator(`#page-Wandverkleidung label.image-check:has(#${a}) .caption`).click();
        else if (kind === "wvkind") { await go("Wandverkleidung"); await page.locator(`#page-Wandverkleidung label:has(input[name="wvKind"][value="${a}"])`).click(); }
        else if (kind === "curtain") { await go("Duschvorhang"); await page.locator("#page-Duschvorhang label.sec-switch:has(#vorhangToggle)").click(); await page.locator('#vorhang-mount .vhc-row input[data-leg="a"]').fill("120"); await page.locator('#vorhang-mount .vhc-row input[data-leg="a"]').blur(); }
        else if (kind === "curtainoff") { await go("Duschvorhang"); await page.locator("#page-Duschvorhang label.sec-switch:has(#vorhangToggle)").click(); }
        else if (kind === "daon") { await go("DuschabtrennungNeu"); await page.locator("#dac-configs .dac-wizard").first().waitFor({ state: "attached" }); await page.locator("#page-DuschabtrennungNeu label.sec-switch:has(#daNeuToggle)").click(); }
        else if (kind === "dasupplier") { await card.locator(`.dac-supplier label:has(input[value="${a}"])`).click(); await page.waitForTimeout(700); }
        else if (kind === "dapick") await card.locator(".dac-grid .dac-opt").filter({ has: page.locator(".dac-opt-title, .dac-opt-label:not(:has(.dac-opt-title))", { hasText: exact(a) }) }).first().click();
        else if (kind === "dasize") await card.locator(".dac-component >> nth=0").locator(".dac-row--size >> nth=0").locator(".dac-seg__opt", { hasText: exact(a) }).click();
        else if (kind === "daextra") await card.locator(".dac-extras .dac-row--item .dac-row__text").first().click();
        else if (kind === "opt") { await go("Optional"); await page.evaluate((id) => { const cb = document.getElementById(`opt_${id}`); if (!cb) throw new Error(`no product ${id}`); cb.click(); }, a); }
        else if (kind === "wc") { await go("Optional"); if (!(await page.locator("#cat_WC").isChecked())) await page.locator("label.image-check:has(#cat_WC)").click(); await page.locator(`#menu_WC label:has(input[name="wcMontage"][value="${a}"])`).click(); await page.locator("#wcWallProductsGrid input[type=checkbox]").first().waitFor({ state: "attached" }); if (a === "Wandmontage") await page.locator('#menu_WC label:has(input[name="wcSeatHeight"][value="normal"])').click(); await page.waitForTimeout(500); for (const id of [b, ...rest]) await page.evaluate((x) => { const cb = document.getElementById(`opt_${x}`); if (!cb) throw new Error(`no WC product ${x}`); cb.click(); }, id); }
        else if (kind === "payer") { await go("Kundendaten"); await page.locator(`label:has(input[name="payer"][value="${a === "sz" ? "Selbstzahler" : "Kassenkunde"}"])`).first().click(); }
        else if (kind === "auf") { await go("Rabatt"); await page.waitForTimeout(500); await page.locator("#sonderaufschlagValue").fill(a); await page.locator("#sonderaufschlagValue").blur(); await page.waitForTimeout(400); await page.locator("#aufschlagBegruendung").fill(b); await page.locator("#aufschlagBegruendung").blur(); }
        else throw new Error(`step not handled: ${kind}`);
        await page.waitForTimeout(1200);
      }
      await go("Angebotscheck");
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
      const viewOf = () => page.evaluate(() => {
        const txt = (n) => (n?.textContent || "").replace(/\s+/g, " ").trim();
        const st = (n) => (n.className.match(/is-(rot|gelb|gruen)/) || [])[1] || "";
        const body = document.querySelector("#page-Angebotscheck .zf-check-body");
        return {
          heading: txt(document.querySelector("#page-Angebotscheck h2")), text: txt(document.querySelector("#page-Angebotscheck .section-subtitle")),
          status: st(body.querySelector(".zf-check-head")), head: txt(body.querySelector(".zf-check-head span:last-child")),
          groups: [...body.querySelectorAll(".zf-check-group")].map((g) => ({
            title: txt(g.querySelector(".zf-check-group__title > span:first-child")), status: st(g.querySelector(".zf-check-group__title")),
            counts: [...g.querySelectorAll(".zf-check-count")].map((c) => `${st(c)} ${txt(c).replace(/\D/g, "")}`),
            rows: [...g.querySelectorAll(".zf-check-row")].map((r) => {
              const wrap = r.closest(".zf-check-row-wrap"), box = wrap?.querySelector("input[data-ack]"), q = wrap ? [...wrap.querySelectorAll("[data-rueckbau]")] : [];
              return { status: st(r), title: txt(r.querySelector(".zf-check-row__title")), details: [...r.querySelectorAll(".zf-check-row__detail")].map(txt), target: r.dataset.target || "",
                ...(box ? { ack: { id: box.dataset.ack, on: box.checked } } : {}), ...(q.length ? { question: { task: q[0].dataset.rueckbau, answer: (q.find((b) => b.classList.contains("ang-stage-btn--primary")) || {}).dataset?.answer || "" } } : {}) };
            }),
          })),
          empty: txt(body.querySelector(".zf-check-empty")),
        };
      });
      const priceOf = () => page.evaluate(() => { const p = window.__pricing || {}; return { services: p.services && { sum: p.services.sum, lines: p.services.lines }, servicesDisplayUI: p.servicesDisplayUI, materials: p.materials && { sum: p.materials.sum, lines: p.materials.lines }, materialsDisplayUI: p.materialsDisplayUI, optionalDisplayUI: p.optionalDisplayUI }; });
      const offer = await page.evaluate(() => window.buildPayload());
      const entry = { name, setup, offer: changed(base, offer), price: await priceOf(), view: await viewOf(), answers: [] };
      for (const [kind, a, b] of answers) {
        if (kind === "ack") await page.locator("#page-Angebotscheck .zf-check-row-wrap").filter({ has: page.locator(".zf-check-row__title", { hasText: exact(a) }) }).locator("input[data-ack]").click();
        else if (kind === "rb") await page.locator(`#page-Angebotscheck [data-rueckbau="${a}"][data-answer="${b}"]`).click();
        else throw new Error(`answer not handled: ${kind}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1300);
        entry.answers.push({ answer: [kind, a, b].filter((x) => x != null), stored: changed(offer, await page.evaluate(() => window.buildPayload())), view: await viewOf() });
      }
      await ctx.close();
      console.log(name);
      return { base, entry };
    };
    let got;
    for (let attempt = 1; !got; attempt++) {
      try { got = await record(); }
      catch (err) {
        if (attempt >= 6) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    out.base = out.base || got.base;
    out.scenarios.push(got.entry);
    fs.writeFileSync(OUT + ".part", JSON.stringify(out));
  }
  await browser.close();
  out.scenarios.sort((x, y) => Object.keys(SCENARIOS).indexOf(x.name) - Object.keys(SCENARIOS).indexOf(y.name));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  fs.rmSync(OUT + ".part", { force: true });
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
