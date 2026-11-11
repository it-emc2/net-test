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

// ---------------------------------------------------------------------------
// Data loss 10.11.2026: technician in a cellar (no signal) on an iPad. iOS
// reloaded the tab, the banner came up, and before it was answered the page was
// hidden again (app switch to MagicPlan, lock screen, next discard) — the
// snapshot was deleted. Or the technician started on the form next to the
// banner — the snapshot was overwritten. 53 and 94 minutes of work were gone.
// These tests replay exactly that, offline.
// ---------------------------------------------------------------------------
const hide = (page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

// Office: app opened online once (worker + cache warm). Cellar: offline, work, tab discarded.
async function workInTheCellar(page, context) {
  await bootedWithRecovery(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });
  await bootedWithRecovery(page);
  await context.setOffline(true);
  await fillSurvey(page);
  await hide(page); // app switch → flush
  await page.waitForTimeout(400);
  await page.reload(); // iOS discarded the tab
  await page.waitForFunction(() => window.__sessionRecoveryReady !== undefined, null, { timeout: 30000 });
  await page.evaluate(() => window.__sessionRecoveryReady);
  await expect(page.locator(BAR)).toBeVisible();
}
const reloadOffline = async (page) => {
  await page.reload();
  await page.waitForFunction(() => window.__sessionRecoveryReady !== undefined, null, { timeout: 30000 });
  await page.evaluate(() => window.__sessionRecoveryReady);
};

test("cellar: app switch while the banner is still unanswered keeps the work", async ({ page, context }) => {
  await workInTheCellar(page, context);
  await hide(page); // MagicPlan again, banner not answered
  await page.waitForTimeout(800);
  await reloadOffline(page); // next discard

  await expect(page.locator(BAR)).toBeVisible();
  await page.click("#sessionRecoveryRestore");
  expect((await readSurvey(page)).lastName).toBe("Graul");
});

test("cellar: several app switches and discards in a row keep the work", async ({ page, context }) => {
  await workInTheCellar(page, context);
  for (let i = 0; i < 3; i++) {
    await hide(page);
    await page.waitForTimeout(300);
    await reloadOffline(page);
    await expect(page.locator(BAR)).toBeVisible();
  }
  await page.click("#sessionRecoveryRestore");
  expect((await readSurvey(page)).lastName).toBe("Graul");
});

test("cellar: starting on a new offer next to the banner never destroys the old one", async ({ page, context }) => {
  await workInTheCellar(page, context);
  // technician ignores the banner and starts a new offer
  await page.evaluate(() => {
    const el = document.getElementById("lastName");
    el.value = "Neu"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    const nr = document.getElementById("offerNumber");
    nr.value = "ANG2026-1110-150138"; nr.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(1700); // debounced save of the new work
  await hide(page);
  await reloadOffline(page);

  // banner offers the newest work and, under „Älterer Stand“, the first offer
  await expect(page.locator(BAR)).toBeVisible();
  const older = page.locator("#sessionRecoveryOlder");
  await expect(older).toBeVisible();
  const label = await older.locator("option").nth(1).textContent();
  expect(label).toContain("Graul");
  await older.selectOption({ index: 1 });
  await expect(page.locator(BAR)).toHaveCount(0);
  const s = await readSurvey(page);
  expect(s.lastName).toBe("Graul");
  expect(s.offerNumber).toBe("ANG2026-0815-120000");
});

test("typing before the recovery check resolves does not overwrite the old work", async ({ page, context }) => {
  await workInTheCellar(page, context);
  // next start: the technician types before the (slow, offline) check is done
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.getElementById("firstName");
      if (el) { el.value = "Früh"; el.dispatchEvent(new Event("input", { bubbles: true })); }
    });
  });
  await reloadOffline(page);
  await page.waitForTimeout(1700);
  await hide(page);
  await reloadOffline(page);

  await expect(page.locator(BAR)).toBeVisible();
  // the Graul offer is either the one offered or listed under „Älterer Stand“
  const older = page.locator("#sessionRecoveryOlder");
  const idx = (await older.count())
    ? await older.evaluate((sel) => [...sel.options].findIndex((o) => o.textContent.includes("Graul")))
    : -1;
  if (idx > 0) await older.selectOption({ index: idx });
  else await page.click("#sessionRecoveryRestore");
  expect((await readSurvey(page)).lastName).toBe("Graul");
});
