// v2-only (PARITY_TARGET=v2): the deal-link add-on (ADR 006/021) in a real browser.
// Bitrix points at a dead port in this stack, so "load deal" ends with its normal error text —
// which proves the app's own flow ran with the linked ID.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

test("Hauptmenü hides HMS and WD (ADR 011), the other tiles stay", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const visible = await page.$$eval(".tile-btn[data-step]", (as) => as.filter((a) => a.offsetParent !== null).map((a) => a.dataset.step));
  expect(visible).toEqual(["BU-Badumbau", "BWT-Badewannentür", "HL-Handlauf", "BL-Badelift", "AH-Alltagshilfe"]);
});

test("/deal/<id> opens the app at / with ?deal=<id> and runs the existing 'Deal laden' flow", async ({ page }) => {
  const calls = [];
  page.on("request", (r) => { if (r.url().includes("/api/bitrix/deal/")) calls.push(new URL(r.url()).pathname); });
  await page.goto("/deal/9001", { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).pathname).toBe("/");
  expect(new URL(page.url()).searchParams.get("deal")).toBe("9001");
  await expect(page.locator("#homeDealIdInput")).toHaveValue("9001");
  await expect.poll(() => calls).toEqual(["/api/bitrix/deal/9001"]);
  await expect(page.locator("#homeDealStatus")).toBeVisible(); // Bitrix unreachable here → the app's error text
  // assets still load from "/" (relative paths) — no page errors
});

test("while working, the address follows the current Auftrag-ID; reload keeps step and deal, no second dialog", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash && location.hash !== "#home");
  await page.evaluate(() => {
    const el = document.getElementById("auftragId");
    el.value = "4711";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => new URL(page.url()).searchParams.get("deal")).toBe("4711");
  const hashBefore = new URL(page.url()).hash;
  const calls = [];
  page.on("request", (r) => { if (r.url().includes("/api/bitrix/deal/")) calls.push(r.url()); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).hash).toBe(hashBefore);
  expect(new URL(page.url()).searchParams.get("deal")).toBe("4711");
  expect(calls).toEqual([]); // reload mid-wizard never re-opens the deal dialog
  // back to the Hauptmenü → link removed. Since main PR #332 (F03) the app asks before it
  // throws the offer away, also when the address changes to #home.
  await page.evaluate(() => { location.hash = "home"; });
  await page.locator("#homeConfirmGo").click();
  await expect.poll(() => new URL(page.url()).searchParams.get("deal")).toBe(null);
  expect(errors).toEqual([]);
});

test("not logged in: /deal/<id> goes through the login and comes back to the deal", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto("/deal/9001", { waitUntil: "domcontentloaded" });
  expect(new URL(page.url()).pathname).toBe("/login");
  expect(new URL(page.url()).searchParams.get("next")).toBe("/deal/9001");
  await page.fill('input[type="email"], #email', USER.email);
  await page.fill('input[type="password"], #password', USER.password);
  await page.click("#btn");
  await page.waitForURL((u) => u.searchParams.get("deal") === "9001");
  await expect(page.locator("#homeDealIdInput")).toHaveValue("9001");
  await ctx.close();
});
