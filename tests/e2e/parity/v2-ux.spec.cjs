// v2-only (PARITY_TARGET=v2): Phase 7 UX changes approved by the owner (ADR 022) in a real browser.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

test("P7-1: one „Öffnen“ field — deal number and ANG number open directly, text searches", async ({ page }) => {
  const calls = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (/^\/api\/(bitrix\/deal|offers)\//.test(u.pathname)) calls.push(u.pathname); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#homeSearchHeading")).toHaveText("Öffnen");
  await expect(page.locator("#loadOfferNumber")).toBeHidden();
  await expect(page.locator("#homeDealIdInput")).toBeHidden();
  const field = page.locator("#globalOfferSearchInput");

  await field.fill("9001");
  await expect(page.locator("#ocOpenHint")).toHaveText("Eingabetaste öffnet Deal 9001");
  await field.press("Enter");
  await expect.poll(() => calls).toContain("/api/bitrix/deal/9001");
  await expect(page.locator("#homeDealStatus")).toBeVisible(); // Bitrix unreachable here → the app's own error text, now visible

  await field.fill("ang2026-1104-093242");
  await field.press("Enter");
  await expect.poll(() => calls).toContain("/api/offers/ANG2026-1104-093242");
});

test("P7-2: text ≥ 16 px, buttons ≥ 48 px", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  const m = await page.evaluate(() => {
    const next = document.querySelector('[data-nav="next"]');
    const input = document.getElementById("firstName");
    return {
      body: parseFloat(getComputedStyle(document.body).fontSize),
      btn: next.getBoundingClientRect().height,
      input: input.getBoundingClientRect().height,
      inputFont: parseFloat(getComputedStyle(input).fontSize),
    };
  });
  expect(m.body).toBeGreaterThanOrEqual(16);
  expect(m.btn).toBeGreaterThanOrEqual(48);
  expect(m.input).toBeGreaterThanOrEqual(44);
  expect(m.inputFont).toBeGreaterThanOrEqual(16);
});

test("P7-3: Adobe card gone; developer tools visible for admins (parity user is admin)", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.classList.contains("oc-admin"));
  const r = await page.evaluate(() => ({
    adobe: [...document.querySelectorAll(".adobe-section")].every((e) => getComputedStyle(e).display === "none"),
    dev: [...document.querySelectorAll(".developer-section")].some((e) => getComputedStyle(e).display !== "none"),
  }));
  expect(r).toEqual({ adobe: true, dev: true });
  // without the admin flag (normal staff) the developer tools are hidden
  const staff = await page.evaluate(() => {
    document.documentElement.classList.remove("oc-admin");
    return [...document.querySelectorAll(".developer-section")].every((e) => getComputedStyle(e).display === "none");
  });
  expect(staff).toBe(true);
});

test("P7-4: alert() becomes an in-page notice; technical texts become a plain sentence", async ({ page }) => {
  const native = [];
  page.on("dialog", async (d) => { native.push(d.message()); await d.dismiss(); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.alert("Bitte füllen Sie alle Pflichtfelder aus."));
  await expect(page.locator(".oc-notice").last()).toContainText("Bitte füllen Sie alle Pflichtfelder aus.");
  await page.evaluate(() => window.alert("Payload (siehe Konsole für vollständige Daten)"));
  await expect(page.locator(".oc-notice").last()).toContainText("Das hat leider nicht geklappt");
  await page.locator(".oc-notice").last().getByRole("button", { name: "Hinweis schließen" }).click();
  expect(native).toEqual([]); // no browser pop-up at all
  // the confirm() questions are rewritten to the app's own dialog (checked in v2 unit test rewrites.test.ts)
  const served = await (await page.request.get("/script.js")).text();
  expect(served).toContain("Ja, neuen Link erstellen");
  expect(served).not.toContain("Trotzdem fortfahren?");
});

test("P7-5: save buttons gone; „An Planung übergeben“ only for a deal on today's planning list", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await expect(page.locator("#btnSaveDraft")).toBeHidden();
  await expect(page.locator("#btnSaveDraftAs")).toBeHidden();
  const handOver = page.locator("#ocHandOver");
  await expect(handOver).toBeHidden(); // no deal yet

  // a deal that is on today's planning list (the list is filled in the browser) → button appears
  await page.evaluate(() => {
    const el = document.getElementById("auftragId");
    el.value = "4711";
    window.__debug_getPlanningAppointments = () => [{ importDealId: "4711" }];
    window.isDealDone = () => false;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(handOver).toBeVisible();
  const moved = page.waitForRequest((r) => r.url().endsWith("/api/bitrix/deal/4711/move-zuteilen") && r.method() === "POST");
  await handOver.click();
  await moved; // same Bitrix call as today's quick save (Bitrix is a dead port here → plain notice)
  await expect(page.locator(".oc-notice").last()).toContainText("Übergabe an die Planung hat nicht geklappt");
});

test("U-008 clean header: save status + Versionen in the header only while an offer is open; settings in the user menu", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Hauptmenü: no save status, no box at the bottom
  await expect(page.locator("#ocAutosave")).toBeHidden();
  // user menu holds theme, light/dark, Klassisch/Neu, reload, logout — the original controls
  await page.locator("#ocUserMenuBtn").click();
  const menu = page.locator("#ocUserMenu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("#ocThemeSelect")).toBeVisible();
  await expect(menu.locator(".oc-seg")).toBeVisible();
  await expect(menu.getByText("Dunkler Modus")).toBeVisible();
  // the menu's switch operates today's light/dark control
  const before = await page.evaluate(() => document.getElementById("modeToggle").checked);
  await menu.locator("label[for=ocDarkToggle]").click();
  expect(await page.evaluate(() => document.getElementById("modeToggle").checked)).toBe(!before);
  await menu.locator("label[for=ocDarkToggle]").click();
  // the menu's theme select operates today's theme select
  await menu.locator("#ocThemeSelect").selectOption("pflege");
  expect(await page.evaluate(() => document.getElementById("themeSelect").value)).toBe("pflege");
  await expect(menu.getByText("App neu laden")).toBeVisible();
  await expect(menu.getByText("Abmelden")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  // in an offer, after the first entry: status + Versionen sit in the header
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.locator("#firstName").fill("Kopfzeile");
  const pill = page.locator("header #ocSaveSlot #ocAutosave");
  await expect(pill).toBeVisible({ timeout: 15000 });
  await expect(pill).toContainText("gespeichert");
  await expect(pill.getByRole("button", { name: "Versionen" })).toBeVisible();
});
