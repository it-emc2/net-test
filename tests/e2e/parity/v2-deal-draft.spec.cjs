// v2-only (PARITY_TARGET=v2): one draft per deal (ADR 007) — autosave, reload restore,
// versions + restore, and the autosaved state in the "Deal laden" dialog. Real browser.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

let n = 0;
const freshDeal = () => String(880000 + Date.now() % 100000 + n++); // a new deal per test

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

async function startBu(page, dealId) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash && location.hash !== "#home");
  await page.evaluate((id) => {
    const el = document.getElementById("auftragId");
    el.value = id;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, dealId);
}
async function setField(page, id, value) {
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, value]);
}
const draftOf = (page, id) => page.request.get(`/api/deals/${id}/draft`).then((r) => r.json());

test("changes are saved automatically and come back after a reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  const deal = freshDeal();
  await startBu(page, deal);
  await setField(page, "firstName", "Erika");
  await setField(page, "lastName", "Muster");
  await expect(page.locator("#ocAutosaveText")).toContainText("Automatisch gespeichert", { timeout: 15000 });
  const saved = await draftOf(page, deal);
  expect(saved.offerType).toBe("bu");
  expect(saved.payload.Kundendaten.firstName).toBe("Erika");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#firstName")).toHaveValue("Erika", { timeout: 15000 });
  await expect(page.locator("#lastName")).toHaveValue("Muster");
  await expect(page.locator("#ocAutosaveText")).toContainText("geladen");
  expect(errors).toEqual([]);
});

test("versions: every change is a version; restoring an old one brings its values back (and is itself a new version)", async ({ page }) => {
  const deal = freshDeal();
  await startBu(page, deal);
  await setField(page, "firstName", "Erste");
  await expect.poll(async () => (await draftOf(page, deal)).revision ?? 0, { timeout: 15000 }).toBeGreaterThan(0);
  const v1 = (await draftOf(page, deal)).revision;
  await setField(page, "firstName", "Zweite");
  await expect.poll(async () => (await draftOf(page, deal)).payload?.Kundendaten?.firstName, { timeout: 15000 }).toBe("Zweite");

  await page.locator("#ocVersionsBtn").click();
  const dialog = page.getByRole("dialog", { name: "Gespeicherte Versionen" });
  await expect(dialog).toBeVisible();
  const row = dialog.locator("div", { hasText: `Version ${v1} ·` }).last();
  await row.getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.locator("#firstName")).toHaveValue("Erste", { timeout: 15000 });
  const after = await draftOf(page, deal);
  expect(after.payload.Kundendaten.firstName).toBe("Erste");
  const revs = (await (await page.request.get(`/api/deals/${deal}/draft/revisions`)).json()).revisions;
  expect(revs[0].note).toBe(`Version ${v1} wiederhergestellt`);
});

test("'Deal laden' dialog offers the autosaved state and opens it", async ({ page }) => {
  const deal = freshDeal();
  await startBu(page, deal);
  await setField(page, "firstName", "Dialog");
  await expect.poll(async () => (await draftOf(page, deal)).payload?.Kundendaten?.firstName, { timeout: 15000 }).toBe("Dialog");

  // Bitrix is a dead port in this stack → answer the deal lookup in the browser
  await page.route(`**/api/bitrix/deal/${deal}`, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ deal: { id: deal, title: "Testdeal" }, contact: { ID: "101", NAME: "Dialog", LAST_NAME: "Test" } }),
  }));
  await page.route(`**/api/offers/by-deal/${deal}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.goto(`/deal/${deal}`, { waitUntil: "domcontentloaded" });
  const open = page.locator("[data-oc-autosaved]");
  await expect(open).toBeVisible({ timeout: 15000 });
  await expect(open).toContainText("Automatisch gespeicherten Stand öffnen");
  await open.click();
  await expect(page.locator("#firstName")).toHaveValue("Dialog", { timeout: 15000 });
});

test("option A: an offer started WITHOUT a deal number is saved too, survives a reload, and joins the deal when the number is entered", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash && location.hash !== "#home");
  expect(new URL(page.url()).searchParams.get("entwurf")).toBe(null); // just opening creates nothing
  await setField(page, "firstName", "Vorläufig");
  await expect(page.locator("#ocAutosaveText")).toContainText("Vorläufig gespeichert", { timeout: 15000 });
  const temp = new URL(page.url()).searchParams.get("entwurf");
  expect(temp).toMatch(/^t-[0-9a-f]{24}$/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#firstName")).toHaveValue("Vorläufig", { timeout: 15000 });

  const deal = freshDeal();
  await page.evaluate((id) => {
    const el = document.getElementById("auftragId");
    el.value = id;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, deal);
  await expect.poll(async () => (await draftOf(page, deal)).payload?.Kundendaten?.firstName, { timeout: 15000 }).toBe("Vorläufig");
  await expect.poll(() => new URL(page.url()).searchParams.get("entwurf")).toBe(null);
  await expect.poll(() => new URL(page.url()).searchParams.get("deal")).toBe(deal);
  const revs = (await (await page.request.get(`/api/deals/${deal}/draft/revisions`)).json()).revisions;
  expect(revs.at(-1).note).toContain("ohne Deal-Nummer begonnen");
  expect(errors).toEqual([]);
});

test("autosave switched off: nothing saves by itself; „Speichern“ at the bottom adds a version to the SAME deal draft; tab close warns", async ({ page }) => {
  const deal = freshDeal();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#ocUserMenuBtn").click();
  await page.locator("label[for=ocAutosaveToggle]").click(); // switch off
  await page.keyboard.press("Escape");
  await startBu(page, deal);
  const btn = page.locator("#ocManualSave");
  await expect(btn).toBeVisible();
  await setField(page, "firstName", "Manuell");
  await expect(page.locator("#ocAutosaveText")).toContainText("Nicht gespeichert", { timeout: 10000 });
  await page.waitForTimeout(4000); // longer than the autosave delay
  expect((await page.request.get(`/api/deals/${deal}/draft`)).status()).toBe(404); // nothing saved by itself

  await btn.click();
  await expect.poll(async () => (await draftOf(page, deal)).revision ?? 0, { timeout: 10000 }).toBe(1);
  await setField(page, "lastName", "Speicher");
  await btn.click();
  await expect.poll(async () => (await draftOf(page, deal)).revision ?? 0, { timeout: 10000 }).toBe(2);
  const revs = (await (await page.request.get(`/api/deals/${deal}/draft/revisions`)).json()).revisions;
  expect(revs).toHaveLength(2); // versions of ONE draft — no extra copies
  expect((await page.request.get(`/api/drafts/search?offerType=bu&q=Speicher`)).ok()).toBeTruthy();
  const legacyCopies = await (await page.request.get(`/api/drafts/search?offerType=bu&q=Speicher`)).json();
  expect(Array.isArray(legacyCopies) ? legacyCopies.length : (legacyCopies.items || []).length).toBe(0); // no old-style drafts

  // unsaved change + leaving → the browser asks (beforeunload)
  await setField(page, "lastName", "Ungespeichert");
  await page.waitForTimeout(800);
  let asked = false;
  page.on("dialog", async (d) => { asked = d.type() === "beforeunload"; await d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toBe(true);
});
