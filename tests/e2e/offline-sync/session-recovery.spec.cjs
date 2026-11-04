// Recovery of work in progress after the browser discards the page.
//
// Field report: technician saved the survey, switched to MagicPlan, iOS threw
// the tab away, and on return most of the form was empty — including the offer
// number, which went out as "1234". A reload is the same thing the browser does
// after a discard, so that is what these tests do.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const BAR = "#sessionRecoveryBar";

const bootedWithRecovery = async (page) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__sessionRecoveryReady !== undefined, null, {
    timeout: 30000,
  });
  await page.evaluate(() => window.__sessionRecoveryReady);
};

// Fields deliberately spread across different wizard steps: the reported loss
// kept the Duschwanne values (they have their own localStorage keys) and lost
// the Wandverkleidung colour (it has none).
const fillSurvey = (page) =>
  page.evaluate(() => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    return {
      firstName: set("firstName", "Familie"),
      lastName: set("lastName", "Graul"),
      offerNumber: set("offerNumber", "ANG2026-0815-120000"),
    };
  });

const readSurvey = (page) =>
  page.evaluate(() => ({
    firstName: document.getElementById("firstName")?.value ?? null,
    lastName: document.getElementById("lastName")?.value ?? null,
    offerNumber: document.getElementById("offerNumber")?.value ?? null,
  }));

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: USER });
  expect(login.status(), await login.text()).toBe(200);
});

test("an untouched form never offers a restore", async ({ page }) => {
  await bootedWithRecovery(page);
  await page.reload();
  await bootedWithRecovery(page);

  await expect(page.locator(BAR)).toHaveCount(0);
});

test("work survives a discard and is restored on demand", async ({ page }) => {
  await bootedWithRecovery(page);
  const filled = await fillSurvey(page);
  expect(filled).toEqual({ firstName: true, lastName: true, offerNumber: true });

  // Switching apps is what actually triggers the flush on iOS.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // The discard itself.
  await page.reload();
  await bootedWithRecovery(page);

  // Nothing is applied silently.
  await expect(page.locator(BAR)).toBeVisible();
  const afterDiscard = await readSurvey(page);
  expect(afterDiscard.firstName).toBe("");
  expect(afterDiscard.lastName).toBe("");
  // Not empty: boot mints a *new* offer number, which is precisely how the
  // technician's original one got replaced.
  expect(afterDiscard.offerNumber).not.toBe("ANG2026-0815-120000");

  await page.click("#sessionRecoveryRestore");
  await expect(page.locator(BAR)).toHaveCount(0);

  const restored = await readSurvey(page);
  expect(restored.firstName).toBe("Familie");
  expect(restored.lastName).toBe("Graul");
  // The specific thing that went out as "1234".
  expect(restored.offerNumber).toBe("ANG2026-0815-120000");
});

test("a restored session is snapshotted again immediately", async ({ page }) => {
  await bootedWithRecovery(page);
  await fillSurvey(page);
  await page.evaluate(() => import("/session-recovery.js").then((m) => m.__internals.save()));

  await page.reload();
  await bootedWithRecovery(page);
  await page.click("#sessionRecoveryRestore");
  await expect(page.locator(BAR)).toHaveCount(0);

  // Discarded again without touching anything — the restore must still be there.
  await page.reload();
  await bootedWithRecovery(page);
  await expect(page.locator(BAR)).toBeVisible();

  await page.click("#sessionRecoveryRestore");
  expect((await readSurvey(page)).lastName).toBe("Graul");
});

test("discarding clears the snapshot for good", async ({ page }) => {
  await bootedWithRecovery(page);
  await fillSurvey(page);
  await page.evaluate(() => import("/session-recovery.js").then((m) => m.__internals.save()));

  await page.reload();
  await bootedWithRecovery(page);
  await page.click("#sessionRecoveryDiscard");
  await expect(page.locator(BAR)).toHaveCount(0);

  await page.reload();
  await bootedWithRecovery(page);
  await expect(page.locator(BAR)).toHaveCount(0);
});

test("the snapshot survives with no connection", async ({ page, context }) => {
  await bootedWithRecovery(page);
  // The load that installs the worker does not go through it, so its modules
  // are never cached. Reload once online — which is what actually happens when
  // the app is opened at the office before a visit — so the cache is warm.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30000,
  });
  await bootedWithRecovery(page);
  await fillSurvey(page);

  await context.setOffline(true);
  await page.evaluate(() => import("/session-recovery.js").then((m) => m.__internals.save()));
  await page.reload();
  await bootedWithRecovery(page);

  await expect(page.locator(BAR)).toBeVisible();
  await page.click("#sessionRecoveryRestore");
  expect((await readSurvey(page)).lastName).toBe("Graul");
});
