// Builds tests/golden/fixtures/ah/restore.json: every real (anonymised) AH payload is loaded
// into a FRESH legacy page through the app's own restore path
// (window.restoreConfiguratorFromOffer), then the legacy window.computeAHGesamt() result and
// the DOM/window input state it used are recorded. Verifies the TS payload→input adapter.
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { USER } = require("../../../tests/e2e/parity/global-setup.cjs");

const FIX = path.join(__dirname, "../../../tests/golden/fixtures/ah");
const payloads = JSON.parse(fs.readFileSync(path.join(FIX, "payloads.json"), "utf8"));

test("record legacy AH pricing after restoring real payloads", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
  const out = [];
  for (const c of payloads) {
    await page.goto("/", { waitUntil: "domcontentloaded" }); // fresh window state per case
    await page.waitForFunction(() =>
      typeof window.restoreConfiguratorFromOffer === "function" && typeof window.computeAHGesamt === "function");
    // admin config (Entlastungsbetrag etc.) is fetched async on boot — wait until applied
    await page.waitForFunction(() => window.__adminConfigLoaded === true || performance.now() > 3000, null, { timeout: 10000 })
      .catch(() => {});
    const rec = await page.evaluate(async (payload) => {
      await window.restoreConfiguratorFromOffer({ offerType: "ah", payload: structuredClone(payload) });
      await new Promise((r) => setTimeout(r, 250));
      const el = (id) => document.getElementById(id);
      const dom = {
        ahServicesJson: el("ahServicesJson")?.value ?? null,
        ahZoneData: window.__ahZoneData ?? null,
        ahTravelZone: el("ahTravelZone")?.value ?? null,
        travelTime: el("travelTime")?.value ?? null,
        postalCode: el("postalCode")?.value ?? null,
        payer: document.querySelector('input[name="payer"]:checked')?.value ?? "",
        entlastungsbetragNutzen: !!el("ahEntlastungsbetragNutzen")?.checked,
        zweiPersonen: !!el("ahZweiPersonen")?.checked,
        verhinderungspflegeMonat: el("ahVerhinderungspflegeMonat")?.value ?? null,
        umwidmungBeantragt: !!el("ahUmwidmungBeantragt")?.checked,
        umwidmungBetrag: el("ahUmwidmungBetrag")?.value ?? null,
        config: {
          entlastungsbetragMonat: window.__entlastungsbetragMonat,
          steuerabsetzPct: window.__steuerabsetzPct,
          steuerabsetzCapJahr: window.__steuerabsetzCapJahr,
        },
      };
      return { dom, expected: JSON.parse(JSON.stringify(window.computeAHGesamt())) };
    }, c.payload);
    out.push({ id: c.id, ...rec });
  }
  fs.writeFileSync(path.join(FIX, "restore.json"), JSON.stringify(out, null, 1));
  console.log(`wrote ${out.length} restore cases`);
});
