// Reopening work you saved on site but have not synced yet.
//
// The offline queue already guaranteed such a draft was not *lost*. What it
// could not do was give it back: the drafts list and load both go through
// /api/drafts, so with no signal the morning's work was invisible until sync.
// Two customers before finding a bar of signal is a normal morning.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const LOCAL_DB = "nt-local-docs";

const setCustomer = (page, first, last) =>
  page.evaluate(([f, l]) => {
    for (const [id, v] of [["firstName", f], ["lastName", l]]) {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [first, last]);

// Reads the store the app actually writes, not a stub.
const readLocalDocs = (page) =>
  page.evaluate(
    (dbName) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("docs")) return resolve([]);
          const req = db.transaction("docs", "readonly").objectStore("docs").getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () =>
            resolve(req.result.map((d) => ({ key: d.key, name: d.name, offerType: d.offerType })));
        };
      }),
    LOCAL_DB,
  );

const searchDraftsInUI = (page, query) =>
  page.evaluate((q) => window.searchDraftsForCurrentOfferType(q), query);

// Cuts the app off from its APIs while leaving static assets reachable.
//
// Deliberately not context.setOffline(true): under Chromium's full offline
// emulation every dynamic import() fails, including precached ones, so the
// test would fail loading LocalDocsStore.js rather than testing it. Phase 0
// verified on a real iPad WKWebView that this is a CDP artifact and not real
// behaviour — see docs/plan-ipad-local-first.md. Aborting the API is the same
// condition the save path actually handles: fetch rejects and it queues.
const cutTheApisOff = (page) => page.route("**/api/**", (r) => r.abort("connectionfailed"));
const restoreTheApis = (page) => page.unrouteAll({ behavior: "ignoreErrors" });

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: USER });
  expect(login.status(), await login.text()).toBe(200);
  await page.goto("/");
  await page.waitForFunction(() => typeof window.quickSaveDraft === "function", null, {
    timeout: 30000,
  });
});

test("a draft saved with no signal can be found and reopened before it syncs", async ({
  page,
}) => {
  await setCustomer(page, "Ingrid", "Offlinedraft");
  await cutTheApisOff(page);

  const name = await page.evaluate(() => window.quickSaveDraft());
  expect(name).toBeTruthy();

  // It is in the local store, keyed the same way the queue keys the save.
  const docs = await readLocalDocs(page);
  expect(docs.map((d) => d.name)).toContain(name);

  // The list still answers, from IndexedDB, with the server unreachable.
  const results = await searchDraftsInUI(page, "Offlinedraft");
  const hit = results.find((d) => d.name === name);
  expect(hit, "the offline draft should appear in the drafts list").toBeTruthy();
  expect(hit.id).toMatch(/^local:/);

  // And it reopens: the customer name comes back out of the payload. Clear the
  // form first so a pass cannot be the values that were simply never removed.
  await page.evaluate(() => {
    for (const id of ["firstName", "lastName"]) document.getElementById(id).value = "";
  });
  await page.evaluate((id) => window.loadDraftById(id), hit.id);

  await expect
    .poll(() => page.evaluate(() => document.getElementById("lastName")?.value), { timeout: 15000 })
    .toBe("Offlinedraft");
});

test("once it syncs, the local copy is released so the list shows it once", async ({
  page,
}) => {
  await setCustomer(page, "Sync", "Releasedraft");
  await cutTheApisOff(page);
  const name = await page.evaluate(() => window.quickSaveDraft());

  expect((await readLocalDocs(page)).map((d) => d.name)).toContain(name);

  await restoreTheApis(page);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // The server has it now, so the local copy has done its job and goes.
  await expect
    .poll(async () => (await readLocalDocs(page)).map((d) => d.name), { timeout: 20000 })
    .not.toContain(name);

  const results = await searchDraftsInUI(page, "Releasedraft");
  expect(results.filter((d) => d.name === name)).toHaveLength(1);
  // Server rows carry _id; only local ones use the `local:` id prefix.
  const row = results.find((d) => d.name === name);
  expect(String(row._id || row.id || "")).not.toMatch(/^local:/);
});

test("a queued draft is listed while online too, before the sweep lands", async ({
  page,
}) => {
  // Saved offline, then back online but not yet swept: the server does not
  // have it and the local store does. Without merging the two the draft would
  // simply disappear from the list in between.
  await setCustomer(page, "Between", "Mergedraft");
  await cutTheApisOff(page);
  const name = await page.evaluate(() => window.quickSaveDraft());

  // Reachable again, but deliberately without dispatching `online`, so no sweep.
  await restoreTheApis(page);

  const results = await searchDraftsInUI(page, "Mergedraft");
  const hit = results.find((d) => d.name === name);
  expect(hit, "a queued draft must stay visible while online").toBeTruthy();
  expect(hit.id).toMatch(/^local:/);
});
