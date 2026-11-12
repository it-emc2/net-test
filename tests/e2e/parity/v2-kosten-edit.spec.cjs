// v2-only (PARITY_TARGET=v2): description and net unit price of single positions on the Kosten
// page (U-014). Engine and documents are covered by v2/packages/pricing/test/line-edits.test.ts
// and the v2 contract test; this is the page itself, against the real server and catalogue.
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "../../golden/fixtures/pricing/cases.json"), "utf8"));
const BU = cases.find((c) => c.offerType === "bu" && (c.expected?.materials?.lines || []).length > 3 && !c.payload.offerOverrides).payload;

const total = (page) => page.evaluate(() => Number(window.getCanonicalPricingData()?.total));
const lineEdits = (page) => page.evaluate(() => window.buildPayload().offerOverrides?.lineEdits || []);

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__ocKostenEditApi && typeof window.restoreConfiguratorFromOffer === "function");
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => document.querySelectorAll("#sidebar a.side-link[data-step]").length > 0);
  await page.evaluate(async (payload) => {
    const { offerNumber, ...rest } = payload; // a fresh, unsent offer
    await window.restoreConfiguratorFromOffer({ offerType: "bu", payload: rest });
    await window.updatePricing?.();
    
  }, BU);
  await page.locator('#sidebar a.side-link[data-step="Kosten"]').click();
  await expect(page.locator("#costsSummary .oc-ke-btn").first()).toBeVisible({ timeout: 20000 });
});

test("price needs a reason; totals, markers and the offer data follow; reset restores", async ({ page }) => {
  const before = await total(page);
  // first material position with a real price
  const target = await page.evaluate(() => {
    const d = window.getCanonicalPricingData();
    const ids = [...document.querySelectorAll("#costsSummary [data-oc-ke-open]")].map((b) => b.getAttribute("data-oc-ke-open"));
    for (const key of ids) {
      const [block, id, source] = key.split("|");
      if (block !== "material") continue;
      const l = d.materials.lines.find((x) => String(x.productId) === id && String(x.source ?? "") === source);
      if (l && l.unitPrice > 5 && l.qty > 0) return { key, unit: l.unitPrice, qty: l.qty };
    }
    return null;
  });
  expect(target).toBeTruthy();
  await page.locator(`[data-oc-ke-open="${target.key}"]`).click();
  const ed = page.locator(".oc-ke-editor");
  await expect(ed).toBeVisible();

  const newUnit = Math.round((target.unit + 10) * 100) / 100;
  await ed.locator('[data-oc-ke="price"]').fill(String(newUnit).replace(".", ","));
  await ed.locator('[data-oc-ke="apply"]').click();
  await expect(ed.locator(".oc-ke-err")).toContainText("Grund"); // refused without a reason
  expect(await lineEdits(page)).toHaveLength(0);

  await ed.locator('[data-oc-ke="reason"]').fill("Sonderanfertigung");
  await ed.locator('[data-oc-ke="desc"]').fill("Sonderanfertigung nach Aufmaß");
  await ed.locator('[data-oc-ke="apply"]').click();

  const delta = 10 * target.qty;
  await expect.poll(() => total(page)).toBeCloseTo(before + delta * 1.19, 1);
  const edits = await lineEdits(page);
  expect(edits).toHaveLength(1);
  expect(edits[0]).toMatchObject({ block: "material", unitPriceNet: newUnit, origUnitPriceNet: target.unit, label: "Sonderanfertigung nach Aufmaß", reason: "Sonderanfertigung" });
  await expect(page.locator("#costsSummary .oc-ke-bar")).toContainText("1 Position geändert");
  await expect(page.locator("#costsSummary .oc-ke-badge")).toHaveCount(1);
  await expect(page.locator("#costsSummary .oc-ke-new").first()).toContainText("Sonderanfertigung nach Aufmaß");
  await expect(page.locator("#costsSummary .oc-ke-reason")).toContainText("Sonderanfertigung");

  // more than 20 % below the catalogue price → warning, still allowed
  await page.locator(`[data-oc-ke-open="${target.key}"]`).click();
  await page.locator('.oc-ke-editor [data-oc-ke="price"]').fill(String(Math.round(target.unit * 0.5 * 100) / 100).replace(".", ","));
  await expect(page.locator(".oc-ke-editor .oc-ke-warn")).toContainText("20 %");

  // reset this position
  await page.locator('.oc-ke-editor [data-oc-ke="reset"]').click();
  await expect.poll(() => total(page)).toBeCloseTo(before, 1);
  expect(await lineEdits(page)).toHaveLength(0);
  await expect(page.locator("#costsSummary .oc-ke-bar")).toHaveCount(0);
});

test("a change survives saving and reopening the offer data; sent offers cannot be changed", async ({ page }) => {
  const key = await page.locator("#costsSummary [data-oc-ke-open^='material|']").first().getAttribute("data-oc-ke-open");
  await page.locator(`[data-oc-ke-open="${key}"]`).click();
  await page.locator('.oc-ke-editor [data-oc-ke="desc"]').fill("Anderer Text");
  await page.locator('.oc-ke-editor [data-oc-ke="apply"]').click();
  await expect(page.locator("#costsSummary .oc-ke-badge")).toHaveCount(1);

  // what a draft/offer stores is what restores
  const saved = await page.evaluate(() => window.buildPayload());
  expect(saved.offerOverrides.lineEdits).toHaveLength(1);
  await page.evaluate(() => window.setOfferOverrides({}));
  await expect(page.locator("#costsSummary .oc-ke-badge")).toHaveCount(0);
  await page.evaluate((p) => window.setOfferOverrides(p.offerOverrides), saved);
  await expect(page.locator("#costsSummary .oc-ke-badge")).toHaveCount(1);
  await expect(page.locator("#offerOverridesBadge")).toContainText("1 Position");

  // the block price adjustment is no longer offered for offers without one
  await expect(page.locator("#offerPriceAdd")).toBeHidden();

  await page.evaluate(() => document.body.classList.add("is-sent-offer"));
  await expect(page.locator("#costsSummary .oc-ke-btn")).toHaveCount(0);
  await expect(page.locator("#costsSummary .oc-ke-badge")).toHaveCount(1); // still shown as changed
});
