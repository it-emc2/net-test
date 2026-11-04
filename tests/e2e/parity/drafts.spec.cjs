// UI parity — drafts as they behave TODAY (documented, not endorsed):
//  * every "⚡ Schnellspeichern" click inserts a NEW draft named
//    ANG-{TYPE}-{First}-{Last}-{DDMMYYYY}-{HHMMSS}
//  * "Entwurf laden (aktueller Bereich)" restores the form from a saved draft.
// ADR 007 (one draft per deal + history) will intentionally change the first point;
// when it lands, this spec is updated together with UX-CHANGES.md.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const NAME_RE = /^ANG-BU-Max-Paritaet-\d{8}-\d{6}$/;

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

test("bu: each quick save creates a new draft; loading restores the form", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.locator("#firstName").fill("Max");
  await page.locator("#lastName").fill("Paritaet");

  const quickSave = page.getByRole("button", { name: /Schnellspeichern/ });
  for (let i = 0; i < 2; i++) {
    const resp = page.waitForResponse((r) => r.url().endsWith("/api/drafts") && r.request().method() === "POST");
    await quickSave.click();
    expect((await resp).status()).toBeLessThan(300);
    await page.waitForTimeout(1100); // name has second resolution
  }

  const list = await (await page.request.get("/api/drafts/search?offerType=bu&q=Paritaet")).json();
  expect(list).toHaveLength(2);
  for (const d of list) expect(d.name).toMatch(NAME_RE);
  expect(new Set(list.map((d) => d.name)).size).toBe(2);

  const full = await (await page.request.get(`/api/drafts/${list[0]._id}`)).json();
  expect(full.payload?.Kundendaten?.firstName).toBe("Max");
  // Load the newest one into a fresh BU form.
  await page.locator("#firstName").fill("");
  await page.locator("#lastName").fill("");
  await page.locator("#draftSearchInput").fill(list[0].name);
  // today: clicking a suggestion row loads it immediately (autoLoadOnClick)
  const loads = [];
  page.on("request", (r) => { if (/\/api\/drafts\/[0-9a-f]{24}$/.test(r.url())) loads.push(r.url()); });
  await page.locator("#draftSearchResults > *").filter({ hasText: list[0].name }).first().click();
  await expect(page.locator("#firstName")).toHaveValue("Max", { timeout: 10000 });
  await expect(page.locator("#lastName")).toHaveValue("Paritaet");
  // documented quirk: the same draft is fetched twice per load today
  expect(loads.length).toBeGreaterThanOrEqual(1);
});
