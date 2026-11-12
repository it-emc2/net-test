// v2-only (PARITY_TARGET=v2): local-first saving in the real cellar case (ADR 025). The device
// has no network at all, iOS throws the page away (= reload from the offline cache), twice.
// The work must come back by itself each time and reach the server once the network is back.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

const set = (page, id, value) => page.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, [id, value]);
const hide = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
});

test("cellar: no network, the page is discarded twice — the work comes back and is transferred later", async ({ page, context }) => {
  const deal = String(660000 + (Date.now() % 100000));
  expect((await page.request.post("/api/auth/login", { data: USER })).status()).toBe(200);
  // office: the app was opened online once (worker + cache warm)
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });
  await page.reload();
  await page.waitForFunction(() => !!window.__ocDealDraft && !!window.__ocLocal, null, { timeout: 30000 });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash && location.hash !== "#home");
  await set(page, "auftragId", deal);

  // cellar
  await context.setOffline(true);
  await set(page, "firstName", "Familie");
  await set(page, "lastName", "Graul");
  await expect(page.locator("#ocAutosaveText")).toContainText("Auf Gerät gespeichert", { timeout: 20000 });
  await hide(page);
  await page.waitForTimeout(400);

  await page.reload(); // iOS discarded the tab
  await expect(page.locator("#lastName")).toHaveValue("Graul", { timeout: 30000 });
  await expect(page.locator("#firstName")).toHaveValue("Familie");
  await expect(page.locator("#ocAutosaveText")).toContainText(/Vom Gerät geladen|Auf Gerät gespeichert/, { timeout: 20000 });
  await set(page, "street", "Kellerweg 1");
  await expect.poll(() => page.evaluate((k) => window.__ocLocal.get(k).then((r) => r?.payload?.Kundendaten?.street), deal), { timeout: 15000 }).toBe("Kellerweg 1");
  await hide(page);
  await page.waitForTimeout(400);

  await page.reload(); // and again
  await expect(page.locator("#street")).toHaveValue("Kellerweg 1", { timeout: 30000 });
  await expect(page.locator("#lastName")).toHaveValue("Graul");

  // back upstairs
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#ocAutosaveText")).toContainText("Automatisch gespeichert", { timeout: 30000 });
  const saved = await (await page.request.get(`/api/deals/${deal}/draft`)).json();
  expect(saved.payload.Kundendaten).toMatchObject({ firstName: "Familie", lastName: "Graul", street: "Kellerweg 1" });
});
