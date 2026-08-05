// Offline pricing: the browser runs src/logic/pricing-core.js — the same file
// the server runs — against a cached snapshot of the inputs.
//
// The only assertion that really matters is that the two agree. A local total
// that quietly differs from the server's would be worse than no total, so the
// tests below compare them on identical payloads rather than checking that the
// offline path merely produces *a* number.
const { test, expect } = require("@playwright/test");
const { USER, LABOR_RATE_OVERRIDE } = require("./global-setup.cjs");

const priceNow = (page) =>
  page.evaluate(async () => {
    const payload = window.buildPayload();
    const result = await window.updatePricing(payload);
    return {
      total: result?.total ?? null,
      selfPay: result?.selfPayAmount ?? null,
      local: result?._local === true,
      lines: result?.materials?.lines?.length ?? null,
      // The catalog side. With an empty Products collection every line prices
      // at 0 and an equality check proves nothing about material pricing.
      materialSum: result?.materials?.sum ?? null,
      productsInSnapshot: (await (await import("/pricing-cache.js")).loadInputs())
        ?.products?.length ?? 0,
    };
  });

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: USER });
  expect(login.status(), await login.text()).toBe(200);

  await page.goto("/");
  await page.waitForFunction(
    () => typeof window.buildPayload === "function" && typeof window.updatePricing === "function",
    null,
    { timeout: 30000 },
  );
  // Boot caches the inputs snapshot and warms the offline pricing module. Wait
  // for that promise rather than racing it — going offline mid-preload is what
  // "cannot import the fallback" looks like.
  await page.waitForFunction(() => window.__pricingInputsReady !== undefined, null, {
    timeout: 30000,
  });
  await page.evaluate(() => window.__pricingInputsReady);
});

test("the inputs snapshot carries the config and product prices", async ({ page }) => {
  const inputs = await page.evaluate(async () => {
    const m = await import("/pricing-cache.js");
    const i = await m.loadInputs();
    return {
      hasTaxRate: i.config.TAX_RATE !== undefined,
      hasLabourRate: i.config.LABOR_RATE_KK !== undefined,
      hasKmRate: i.config.KM_RATE !== undefined,
      productsIsArray: Array.isArray(i.products),
      cachedAt: typeof i.cachedAt,
    };
  });

  expect(inputs).toEqual({
    hasTaxRate: true,
    hasLabourRate: true,
    hasKmRate: true,
    productsIsArray: true,
    cachedAt: "string",
  });

  // The admin override, not pricing-core's hardcoded fallback. If the snapshot
  // carried defaults instead, the equality test below could not tell.
  // Only meaningful in-memory: against a shared database we deliberately do not
  // write an override, because that would change a real labour rate.
  test.skip(
    !LABOR_RATE_OVERRIDE,
    "external database: no override seeded, so cached and default coincide",
  );
  const rate = await page.evaluate(async () => {
    const m = await import("/pricing-cache.js");
    return (await m.loadInputs()).config.LABOR_RATE_KK;
  });
  expect(rate).toBe(LABOR_RATE_OVERRIDE.value);
});

test("the offline total matches the server total for the same payload", async ({
  page,
  context,
}) => {
  const online = await priceNow(page);
  expect(online.local).toBe(false);
  expect(online.total).not.toBeNull();

  await context.setOffline(true);
  const offline = await priceNow(page);

  expect(offline.local).toBe(true); // it really did compute locally
  expect(offline.total).toBe(online.total);
  expect(offline.selfPay).toBe(online.selfPay);
  expect(offline.lines).toBe(online.lines);
  expect(offline.materialSum).toBe(online.materialSum);

  // Guard against a vacuous pass: with no catalog every material line is 0, so
  // the totals above would agree without the product lookups ever mattering.
  if (online.productsInSnapshot > 0) {
    expect(online.materialSum).toBeGreaterThan(0);
  } else {
    console.warn(
      "[pricing] no products in the snapshot — material pricing not exercised",
    );
  }
});

test("a locally computed total is never frozen or locked", async ({ page, context }) => {
  await context.setOffline(true);

  // A total is available…
  const offline = await priceNow(page);
  expect(offline.local).toBe(true);

  // …but freezing refuses it, so Sperren cannot pin a price the server has not
  // confirmed. Both must stay false.
  const frozen = await page.evaluate(() => window.freezeCurrentPricing());
  expect(frozen).toBeNull();
  expect(await page.evaluate(() => window.__frozen)).toBe(false);
  expect(await page.evaluate(() => window.__locked)).toBe(false);
});

test("with no cached snapshot, pricing fails instead of inventing a number", async ({
  page,
  context,
}) => {
  // Clear the store rather than deleteDatabase: pricing-cache.js keeps its
  // connection open, so a delete just blocks and leaves the data in place.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("nt-pricing-inputs");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("inputs", "readwrite");
          tx.objectStore("inputs").clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await context.setOffline(true);

  const outcome = await page.evaluate(async () => {
    try {
      const m = await import("/pricing-client.js");
      return { computed: await m.computePricesLocally(window.buildPayload()) };
    } catch (e) {
      return { threw: String(e) };
    }
  });

  expect(outcome.computed ?? null).toBeNull();
});
