// v2-only (PARITY_TARGET=v2): local-first saving (ADR 025). Every change is on the device
// first; without a connection nothing is lost by a reload, and it reaches the server on its own
// afterwards. "No connection" here = the draft API cannot be reached (the page itself still
// loads; the real offline start is covered by the offline suite).
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

test.skip(process.env.PARITY_TARGET !== "v2", "v2 add-on");

let n = 0;
const freshDeal = () => String(770000 + Date.now() % 100000 + n++);
const offline = (page) => page.route("**/api/deals/**", (route) => route.abort("internetdisconnected"));
const online = (page) => page.unroute("**/api/deals/**");

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: USER })).ok()).toBeTruthy();
});

async function startBu(page, dealId) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('.tile-btn[data-step="BU-Badumbau"]').click();
  await page.waitForFunction(() => location.hash && location.hash !== "#home" && !!window.__ocDealDraft);
  if (dealId) await setField(page, "auftragId", dealId);
}
async function setField(page, id, value) {
  await page.evaluate(([i, v]) => {
    const el = document.getElementById(i);
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, value]);
}
const serverDraft = async (page, id) => { const r = await page.request.get(`/api/deals/${id}/draft`); return r.ok() ? r.json() : null; };
const device = (page, key) => page.evaluate((k) => window.__ocLocal.get(k), key);

test("no connection: the work is kept on the device, survives a reload and reaches the server afterwards", async ({ page }) => {
  const deal = freshDeal();
  await offline(page);
  await startBu(page, deal);
  await setField(page, "firstName", "Erika");
  await setField(page, "lastName", "Keller");
  await expect(page.locator("#ocAutosaveText")).toContainText("Auf Gerät gespeichert", { timeout: 15000 });
  expect(await serverDraft(page, deal)).toBeNull();
  await expect.poll(async () => (await device(page, deal))?.payload?.Kundendaten?.lastName).toBe("Keller");
  expect(await device(page, deal)).toMatchObject({ dirty: true, offerType: "bu", title: "Erika Keller" });

  // the page is reloaded while there is still no connection: nothing is lost
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#firstName")).toHaveValue("Erika", { timeout: 20000 });
  await expect(page.locator("#lastName")).toHaveValue("Keller");
  await expect(page.locator("#ocAutosaveText")).toContainText(/Vom Gerät geladen|Auf Gerät gespeichert/);
  await setField(page, "street", "Kellerweg 1");
  await expect.poll(async () => (await device(page, deal))?.payload?.Kundendaten?.street).toBe("Kellerweg 1");

  // connection back: transferred without any action
  await online(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#ocAutosaveText")).toContainText("Automatisch gespeichert", { timeout: 20000 });
  const saved = await serverDraft(page, deal);
  expect(saved.payload.Kundendaten).toMatchObject({ firstName: "Erika", lastName: "Keller", street: "Kellerweg 1" });
  await expect.poll(async () => (await device(page, deal))?.dirty).toBe(false);
});

test("a draft that is no longer open is transferred in the background and listed on the start page", async ({ page }) => {
  const deal = freshDeal();
  await offline(page);
  await startBu(page, deal);
  await setField(page, "firstName", "Bruno");
  await setField(page, "lastName", "Hintergrund");
  await expect(page.locator("#ocAutosaveText")).toContainText("Auf Gerät gespeichert", { timeout: 15000 });

  // the app is opened again on the start page, still without connection
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const row = page.locator(`#ocDeviceDrafts [data-oc-device="${deal}"]`);
  await expect(row).toContainText("Bruno Hintergrund", { timeout: 15000 });
  await expect(row).toContainText("wartet auf Internet");
  expect(await serverDraft(page, deal)).toBeNull();

  await online(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(row).toContainText("übertragen", { timeout: 20000 });
  expect((await serverDraft(page, deal)).payload.Kundendaten.lastName).toBe("Hintergrund");

  // and it can be opened from the device list without a connection
  await offline(page);
  await row.getByRole("button", { name: "Öffnen" }).click();
  await expect(page.locator("#lastName")).toHaveValue("Hintergrund", { timeout: 20000 });
});

test("changed elsewhere meanwhile: nothing is overwritten silently; the device state can be saved as a new version", async ({ page }) => {
  const deal = freshDeal();
  await startBu(page, deal);
  await setField(page, "firstName", "Carla");
  await expect(page.locator("#ocAutosaveText")).toContainText("Automatisch gespeichert", { timeout: 15000 });
  const first = await serverDraft(page, deal);

  await offline(page);
  await setField(page, "lastName", "VomGeraet");
  await expect(page.locator("#ocAutosaveText")).toContainText("Auf Gerät gespeichert", { timeout: 15000 });
  // a colleague saves the same deal in the office
  const other = await page.request.put(`/api/deals/${deal}/draft`, { data: { offerType: "bu", baseRevision: first.revision, payload: { ...first.payload, Kundendaten: { ...first.payload.Kundendaten, lastName: "AusDemBuero" } } } });
  expect(other.ok()).toBeTruthy();

  await online(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("#ocAutosaveText")).toContainText("Nicht gespeichert", { timeout: 20000 });
  expect((await serverDraft(page, deal)).payload.Kundendaten.lastName).toBe("AusDemBuero"); // untouched
  expect((await device(page, deal)).payload.Kundendaten.lastName).toBe("VomGeraet");       // kept

  await page.locator("#ocVersionsBtn").click();
  await page.locator("[data-oc-keep-mine]").click();
  await expect(page.locator("#ocAutosaveText")).toContainText("Automatisch gespeichert", { timeout: 20000 });
  const now = await serverDraft(page, deal);
  expect(now.payload.Kundendaten.lastName).toBe("VomGeraet");
  expect(now.revision).toBeGreaterThan(first.revision + 1); // the colleague's version is still in the history
});

test("without a deal number: kept on the device under the temporary draft, restored after a reload", async ({ page }) => {
  await offline(page);
  await startBu(page, "");
  await setField(page, "firstName", "Ohne");
  await setField(page, "lastName", "Nummer");
  await expect(page.locator("#ocAutosaveText")).toContainText("Auf Gerät gespeichert", { timeout: 15000 });
  const key = new URL(page.url()).searchParams.get("entwurf");
  expect(key).toMatch(/^t-[0-9a-f]{24}$/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#lastName")).toHaveValue("Nummer", { timeout: 20000 });
  await online(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(async () => (await serverDraft(page, key))?.payload?.Kundendaten?.lastName, { timeout: 20000 }).toBe("Nummer");
});

test("device history: earlier states can be brought back without a connection", async ({ page }) => {
  const deal = freshDeal();
  await offline(page);
  await startBu(page, deal);
  await setField(page, "firstName", "Erster");
  await page.evaluate(() => window.__ocDealDraft.writeLocal(true));
  await setField(page, "firstName", "Zweiter");
  await page.evaluate(() => window.__ocDealDraft.writeLocal(true));
  await page.locator("#ocVersionsBtn").click();
  await expect(page.locator("#ocVersions")).toContainText("Keine Verbindung");
  const rows = page.locator("[data-oc-device-version]");
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByRole("button", { name: "Wiederherstellen" }).click();
  await expect(page.locator("#firstName")).toHaveValue("Erster");
});
