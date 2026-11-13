// Records what today's UI stores in `Arbeitszeit` and shows on the Arbeitszeit step for given
// inputs (ADR 026, phase 4): the reference the React screen is tested against
// (apps/web/test/arbeitszeit.test.tsx). The v2 add-ons are blocked; the route service is
// answered by a fixed reply so the recording does not depend on the network.
//
//   bash v2/scripts/preview.sh &
//   node v2/scripts/capture-arbeitszeit.cjs   → v2/apps/web/test/fixtures/arbeitszeit.json
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const BASE = process.env.CAPTURE_BASE || "http://localhost:3001";
const OUT = path.join(__dirname, "..", "apps", "web", "test", "fixtures", "arbeitszeit.json");
const SECRET = process.env.AUTH_SECRET || "dev-only-auth-secret-change-me";
const TILES = { bu: "BU-Badumbau", bwt: "BWT-Badewannentür", hl: "HL-Handlauf", bl: "BL-Badelift", ah: "AH-Alltagshilfe" };
const NOT_AH = ["bu", "bwt", "hl", "bl"];
/** the fixed reply of the route service */
const ROUTE = { ok: true, oneWayKm: 23.44, roundTripKm: 46.88, oneWaySeconds: 1500, from: { address: "Firma" }, to: { address: "Teststraße 1, 95028 Hof" } };
const ADDRESS = [["set", "street", "Teststraße 1"], ["set", "postalCode", "95028"], ["set", "city", "Hof"]];
const EXTRA = (row, field) => `#bwtAzExtraFieldset .bwt-az-item:nth-child(${row}) .bwt-az-${field}`;
const HELPER = (id, delta) => `#${id}Helper [data-delta="${delta}"]`;

// steps: ["type", id, text] types into the field and leaves it · ["click", selector] ·
//        ["select", id, value] · ["css", selector, text] · ["set", id, text] fills a Kundendaten
//        field without telling the page (the address the route is suggested for)
const SCENARIOS = {
  "nothing entered": [],
  "distance 25 km": [["type", "distanceKm", "25"]],
  "distance with decimals": [["type", "distanceKm", "25.5"]],
  "work 9:00, one day": { only: NOT_AH, steps: [["type", "laborHours", "900"]] },
  "work 12:00, two days": { only: NOT_AH, steps: [["type", "laborHours", "1200"], ["type", "distanceKm", "30"]] },
  "work typed as 7 and left": { only: NOT_AH, steps: [["type", "laborHours", "7"]] },
  "work emptied": { only: NOT_AH, steps: [["type", "laborHours", ""]] },
  "travel time 1:30": { only: NOT_AH, steps: [["type", "travelTime", "130"], ["type", "distanceKm", "80"]] },
  "work 20:00 with travel 1:00, three days": { only: NOT_AH, steps: [["type", "laborHours", "2000"], ["type", "travelTime", "100"], ["type", "distanceKm", "60"]] },
  "three days, one night away": { only: NOT_AH, steps: [["type", "laborHours", "2000"], ["type", "travelTime", "100"], ["type", "distanceKm", "60"], ["type", "uebernachten", "1"]] },
  "more nights than days allow": { only: NOT_AH, steps: [["type", "laborHours", "2000"], ["type", "travelTime", "100"], ["type", "uebernachten", "5"]] },
  "nights entered, then the work gets shorter": { only: NOT_AH, steps: [["type", "laborHours", "2000"], ["type", "uebernachten", "2"], ["type", "laborHours", "500"]] },
  "travel too long for a day": { only: NOT_AH, steps: [["type", "travelTime", "500"]] },
  "work +15 min and +5 min by button": { only: NOT_AH, steps: [["click", HELPER("laborHours", 15)], ["click", HELPER("laborHours", 5)]] },
  "work −15 min by button": { only: NOT_AH, steps: [["click", HELPER("laborHours", -15)]] },
  "travel +15 min twice, −5 min once by button": { only: NOT_AH, steps: [["click", HELPER("travelTime", 15)], ["click", HELPER("travelTime", 15)], ["click", HELPER("travelTime", -5)]] },
  "travel −5 min by button from empty": { only: NOT_AH, steps: [["click", HELPER("travelTime", -5)]] },
  "second worker at 25 €/h": { only: NOT_AH, steps: [["type", "travelTime", "100"], ["select", "travelSecondWorkerRate", "25"]] },
  "everything asked for": { only: NOT_AH, steps: [["type", "distanceKm", "25"], ["type", "travelTime", "030"]] },
  "Selbstzahler, everything asked for": { only: NOT_AH, payer: "Selbstzahler", steps: [["type", "distanceKm", "25"], ["type", "travelTime", "030"]] },
  "route suggested from the address": [...ADDRESS, ["click", "#btnRoutingSuggest"]],
  "route suggested, then the distance corrected": [...ADDRESS, ["click", "#btnRoutingSuggest"], ["type", "distanceKm", "30"]],
  "route asked for without an address": [["click", "#btnRoutingSuggest"]],
  "extra work: one row": { only: ["bwt"], steps: [["click", ".bwt-az-add"], ["css", EXTRA(1, "duration"), "130"], ["css", EXTRA(1, "task"), "Anpassungsarbeiten"]] },
  "extra work: two rows, the first removed": { only: ["bwt"], steps: [["click", ".bwt-az-add"], ["css", EXTRA(1, "duration"), "130"], ["css", EXTRA(1, "task"), "Anpassungsarbeiten"], ["click", ".bwt-az-add"], ["css", EXTRA(2, "duration"), "045"], ["css", EXTRA(2, "task"), "Silikonfuge"], ["click", `#bwtAzExtraFieldset .bwt-az-item:nth-child(1) .bwt-az-remove`]] },
  "extra work: a row with a task only, and an empty row": { only: ["bwt"], steps: [["click", ".bwt-az-add"], ["css", EXTRA(1, "task"), "Abstimmung"], ["click", ".bwt-az-add"]] },
  "zone 3 chosen by button": { only: ["ah"], steps: [["click", '.az-zone-btn[data-zone-min="30"]']] },
  "zone 5, then zone 1 by button": { only: ["ah"], steps: [["click", '.az-zone-btn[data-zone-min="50"]'], ["click", '.az-zone-btn[data-zone-min="10"]'], ["type", "distanceKm", "8"]] },
};

const token = (() => {
  const payload = `${Date.now() + 3600e3}:capture@local.test`;
  return Buffer.from(payload).toString("base64url") + "." + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
})();
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;

(async () => {
  let browser = await chromium.launch({ headless: true });
  const out = { note: "generated by v2/scripts/capture-arbeitszeit.cjs — do not edit", route: ROUTE, scenarios: [] };
  for (const type of Object.keys(TILES)) for (const [name, spec] of Object.entries(SCENARIOS)) {
    const steps = Array.isArray(spec) ? spec : spec.steps;
    if (!Array.isArray(spec) && spec.only && !spec.only.includes(type)) continue;
    const payer = Array.isArray(spec) ? null : spec.payer || null;
    const record = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
      await ctx.addCookies([{ name: "net_session", value: token, url: BASE }]);
      const page = await ctx.newPage();
      const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/api/auth/me", (r) => r.fulfill(json({ user: { email: "capture@local.test", name: "Capture", role: "user" } })));
      await page.route("**/api/planning/**", (r) => r.abort());
      await page.route("**/api/routing/suggest-distance", (r) => r.fulfill(json(ROUTE)));
      await page.route("**/v2/addons/**", (r) => (r.request().url().endsWith("/error-compat.js") ? r.continue() : r.abort()));
      await page.goto(BASE + "/", { waitUntil: "load" });
      await page.locator(`.tile-btn[data-step="${TILES[type]}"]`).click();
      await page.waitForFunction(() => location.hash === "#Kundendaten");
      await page.waitForTimeout(1200);
      if (payer) await page.evaluate((p) => {
        const el = document.querySelector(`#form-Kundendaten input[name="payer"][value="${p}"]`);
        el.checked = true; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
      }, payer);
      await page.evaluate(() => window.setStep("Arbeitszeit"));
      await page.waitForTimeout(400);
      for (const [kind, target, value] of steps) {
        await page.evaluate(([k, t, v]) => {
          const tell = (el, ...events) => events.forEach((e) => el.dispatchEvent(new Event(e, { bubbles: true })));
          if (k === "click") { document.querySelector(t).click(); return; }
          if (k === "set") { document.getElementById(t).value = v; return; }
          const el = k === "css" ? document.querySelector(t) : document.getElementById(t);
          el.value = v;
          tell(el, "input", "change");
          if (k !== "select") el.dispatchEvent(new FocusEvent("blur"));
        }, [kind, target, value]);
        await page.waitForTimeout(kind === "click" && target === "#btnRoutingSuggest" ? 600 : 80);
      }
      await page.waitForTimeout(500);
      const az = await page.evaluate(() => window.buildPayload().Arbeitszeit);
      const view = await page.evaluate(() => {
        const el = (id) => document.getElementById(id);
        const vis = (n) => !!n && n.getClientRects().length > 0;
        const txt = (id) => (el(id)?.innerText || "").replace(/\s+/g, " ").trim();
        return {
          fields: Object.fromEntries(["distanceKm", "uebernachten", "laborHours", "travelTime", "travelSecondWorkerRate"].map((id) => [id, vis(el(id)) ? el(id).value : null])),
          total: vis(el("totalHoursHHMM")) ? txt("totalHoursHHMM") : null,
          roundTrip: txt("roundTripPreview"), travelDays: txt("travelDaysPreview"),
          routing: txt("routingSuggestion"),
          zoneButtons: vis(el("travelZoneButtons")), zonePressed: [...document.querySelectorAll('.az-zone-btn[aria-pressed="true"]')].map((b) => b.dataset.zoneMin),
          zone: vis(el("ahZoneDisplay")) ? txt("ahZoneDisplayValue") : null,
          extraRows: vis(el("bwtAzExtraFieldset")) ? [...document.querySelectorAll("#bwtAzExtraFieldset .bwt-az-item")].map((r) => [r.querySelector(".bwt-az-duration").value, r.querySelector(".bwt-az-task").value]) : null,
          costs: vis(el("travelCostDebugText")) || el("travelCostDebugText")?.closest("details") ? txt("travelCostDebugText") : null,
        };
      });
      const next = await page.evaluate(async () => {
        document.querySelector('#page-Arbeitszeit [data-nav="next"]').click();
        await new Promise((r) => setTimeout(r, 400));
        return location.hash.slice(1);
      });
      await ctx.close();
      console.log(`${type} · ${name}`);
      return { type, name, ...(payer ? { payer } : {}), steps, arbeitszeit: sortKeys(az), view, next };
    };
    let entry;
    for (let attempt = 1; !entry; attempt++) {
      try { entry = await record(); }
      catch (err) {
        if (attempt >= 5) throw err;
        console.log(`  retry ${attempt} (${String(err.message || err).split("\n")[0]})`);
        await browser.close().catch(() => {});
        browser = await chromium.launch({ headless: true });
      }
    }
    out.scenarios.push(entry);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${out.scenarios.length} recordings → ${path.relative(process.cwd(), OUT)}`);
})().catch((e) => { console.error(e); process.exit(1); });
