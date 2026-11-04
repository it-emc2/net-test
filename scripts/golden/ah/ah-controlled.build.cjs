// Builds tests/golden/fixtures/ah/controlled.json: seeded input combinations fed straight
// into the REAL legacy window.computeAHGesamt() (DOM fields + window config), result recorded.
// The TS port (v2/packages/pricing/src/ah.ts) must reproduce every case.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { USER } = require("../../../tests/e2e/parity/global-setup.cjs");

const OUT = path.join(__dirname, "../../../tests/golden/fixtures/ah/controlled.json");
const N = Number(process.env.AH_CASES || 400);

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const DAUER = ["00:30", "00:45", "01:00", "01:15", "01:30", "02:00", "02:45", "03:00", "4:30", "", "bad", "1:5"];
const REGEL = ["Wöchentlich", "14-tägig", "alle drei Wochen", "Monatlich", "Vierteljährlich", "Halbjährlich", "Jährlich", "", "täglich"];

function makeService(r, type) {
  const scheds = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ dauer: pick(r, DAUER), regelmaessigkeit: pick(r, REGEL) }));
  const svc = { type, tasks: r() < 0.5 ? ["Einkaufen", "Putzen"].slice(0, 1 + Math.floor(r() * 2)) : [] };
  if (r() < 0.15) svc.schedule = scheds[0]; else svc.schedules = scheds;
  if (type === "Alltagsbegleitung") svc.combinedVisit = r() < 0.5;
  return svc;
}

function makeInput(r) {
  const services = [];
  const mode = pick(r, ["hnd", "ab", "both", "both", "none"]);
  if (mode === "hnd" || mode === "both") services.push(makeService(r, "Haushaltsnahedienstleistungen"));
  if (mode === "ab" || mode === "both") services.push(makeService(r, "Alltagsbegleitung"));
  const z = pick(r, [0, 1, 1, 2, 3, 4, 6]);
  return {
    services,
    zone: z ? { zone: z, billMin: (z - 1) * 10 + 10 } : null,
    payer: pick(r, ["Selbstzahler", "Kassenkunde", "Kassenkunde", ""]),
    entlastungsbetragNutzen: r() < 0.6,
    zweiPersonen: r() < 0.3,
    verhinderungspflegeMonat: pick(r, [0, 0, 50, 100, 201]),
    umwidmungBeantragt: r() < 0.3,
    umwidmungBetrag: pick(r, [0, 80, 150, 400]),
    config: {
      entlastungsbetragMonat: pick(r, [131, 125]),
      steuerabsetzPct: 20,
      steuerabsetzCapJahr: pick(r, [4000, 3000]),
    },
  };
}

test("record legacy AH pricing for controlled inputs", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="AH-Alltagshilfe"]').click();
  await page.waitForFunction(() => typeof window.computeAHGesamt === "function");

  const r = rng(0xa11ce);
  const cases = [];
  for (let i = 0; i < N; i++) {
    const input = makeInput(r);
    const expected = await page.evaluate((inp) => {
      const el = (id) => document.getElementById(id);
      el("ahServicesJson").value = JSON.stringify(inp.services);
      window.__ahZoneData = inp.zone;           // getAHZoneData() step 1
      el("ahTravelZone").value = "";             // no fallback when zone is null
      const tt = el("travelTime"); if (tt) tt.value = "";
      document.querySelectorAll('input[name="payer"]').forEach((x) => { x.checked = x.value === inp.payer; });
      el("ahEntlastungsbetragNutzen").checked = inp.entlastungsbetragNutzen;
      el("ahZweiPersonen").checked = inp.zweiPersonen;
      el("ahVerhinderungspflegeMonat").value = String(inp.verhinderungspflegeMonat);
      el("ahUmwidmungBeantragt").checked = inp.umwidmungBeantragt;
      el("ahUmwidmungBetrag").value = String(inp.umwidmungBetrag);
      window.__entlastungsbetragMonat = inp.config.entlastungsbetragMonat;
      window.__steuerabsetzPct = inp.config.steuerabsetzPct;
      window.__steuerabsetzCapJahr = inp.config.steuerabsetzCapJahr;
      // sanity: the DOM really holds what we set (range input step/max could clamp)
      if (Number(el("ahVerhinderungspflegeMonat").value) !== inp.verhinderungspflegeMonat) throw new Error("range clamped");
      return JSON.parse(JSON.stringify(window.computeAHGesamt()));
    }, input);
    cases.push({ id: `ah-ctl-${String(i).padStart(4, "0")}`, input, expected });
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cases, null, 1));
  console.log(`wrote ${cases.length} AH cases → ${OUT}`);
});
