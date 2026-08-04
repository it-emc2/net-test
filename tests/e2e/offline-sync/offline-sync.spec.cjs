// Full-stack offline sync: real Chromium (real IndexedDB, real offline fetch)
// against the real app on a throwaway MongoDB.
//
// The unit suite stubs IndexedDB, so its central claim — getAll() hands back
// primary-key order, and the key is a random UUID — is only ever asserted
// against a stub written to behave that way. This suite checks it against a
// real engine, then checks the fix holds end to end.
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const DB_NAME = "nt-offline-save-queue";
const STORE = "queue";

// Reads the queue straight out of the browser's IndexedDB, in the order the
// browser hands it over — no sorting on our side.
const readQueue = (page) =>
  page.evaluate(
    ([dbName, store]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(store)) return resolve([]);
          const req = db.transaction(store, "readonly").objectStore(store).getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () =>
            resolve(
              req.result.map((r) => ({
                id: r.id,
                name: r.body.name,
                savedAt: r.body.savedAt,
              })),
            );
        };
      }),
    [DB_NAME, STORE],
  );

// The name fields live on a wizard step that is not the active one, so they
// are in the DOM but not visible. Only buildDraftDefaultName() reads them, and
// driving the wizard is out of scope here, so set them directly.
const setCustomer = (page, first, last) =>
  page.evaluate(([f, l]) => {
    for (const [id, v] of [["firstName", f], ["lastName", l]]) {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [first, last]);

// Every test shares one app + one database, so scope each lookup to the
// surname that test used rather than trying to wipe state between them.
const searchDrafts = async (page, q) => {
  const res = await page.request.get(
    `/api/drafts/search?offerType=bu&q=${encodeURIComponent(q)}`,
  );
  expect(res.status()).toBe(200);
  return res.json();
};

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: USER });
  expect(login.status(), await login.text()).toBe(200);

  await page.goto("/");
  // The save entry point is installed by DraftsManager during app boot.
  await page.waitForFunction(() => typeof window.quickSaveDraft === "function", null, {
    timeout: 30000,
  });
});

test("three offline saves replay in save order and list newest first", async ({
  page,
  context,
}) => {
  await setCustomer(page, "Hans", "Meier");

  await context.setOffline(true);

  const savedNames = [];
  for (let i = 0; i < 3; i++) {
    // The generated name carries a second-resolution timestamp, so the saves
    // have to land in distinct seconds to get distinct names.
    if (i > 0) await page.waitForTimeout(1100);
    savedNames.push(await page.evaluate(() => window.quickSaveDraft()));
  }

  const queued = await readQueue(page);
  expect(queued).toHaveLength(3);

  // The premise of the whole fix, verified against real IndexedDB: getAll()
  // returns primary-key order, which for random UUIDs is unrelated to save
  // order. Whether it *happens* to match save order here is luck, so assert
  // the deterministic part.
  const ids = queued.map((r) => r.id);
  expect(ids).toEqual([...ids].sort());

  // Nothing reached the server while offline.
  await context.setOffline(false);
  expect(await searchDrafts(page, "Meier")).toHaveLength(0);

  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect
    .poll(async () => (await readQueue(page)).length, { timeout: 20000 })
    .toBe(0);

  const drafts = await searchDrafts(page, "Meier");
  expect(drafts.map((d) => d.name)).toEqual([...savedNames].reverse());
});

// v3's freeze feature made saveDraftWithName() await a fresh /api/price call
// before touching the queue, which offline threw and lost the payload outright.
// A price refresh must never cost the user their save.
test("a price refresh that fails offline still queues the draft", async ({
  page,
  context,
}) => {
  await setCustomer(page, "Freeze", "Fallback");
  await context.setOffline(true);

  const name = await page.evaluate(() => window.quickSaveDraft());
  expect(name).toBeTruthy();
  expect(await readQueue(page)).toHaveLength(1);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect
    .poll(async () => (await readQueue(page)).length, { timeout: 20000 })
    .toBe(0);
  expect(await searchDrafts(page, "Fallback")).toHaveLength(1);
});

// Locking pins a total permanently, so it must not happen against a price the
// server never computed.
test("Sperren offline saves the draft but does not lock it", async ({ page, context }) => {
  await setCustomer(page, "Lock", "Offline");
  await context.setOffline(true);

  // #summaryWidget is display:none on the landing step, so the button has no
  // box to click. Dispatch on the element instead — same real handler, and
  // driving the wizard to reveal the rail is out of scope for this suite.
  await page.evaluate(() => document.getElementById("btnLockOffer").click());

  await expect.poll(async () => (await readQueue(page)).length, { timeout: 20000 }).toBe(1);
  expect(await page.evaluate(() => window.__locked)).toBe(false);
  expect(await page.evaluate(() => window.__frozen)).toBe(false);

  // The queued payload must not claim to be locked or frozen either.
  const payload = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("nt-offline-save-queue");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result
            .transaction("queue", "readonly")
            .objectStore("queue")
            .getAll();
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result[0].body.payload);
        };
      }),
  );
  expect(payload.locked).toBe(false);
  expect(payload.frozen).toBe(false);

  // The lock button still offers to lock, rather than to unlock.
  expect(await page.textContent("#btnLockOffer")).toContain("Sperren");
});

// Without a service worker, "offline" only lasted as long as the tab stayed
// open: a reload on site gave a blank page and no route back to the queued
// saves. The shell has to survive a reload, and API reads must still fail
// rather than come back stale.
test("the app still loads after a reload while offline", async ({ page, context }) => {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 30000 },
  );
  // Reload once online so the shell and its modules go through the worker and
  // land in the cache; wait for the full boot, since the managers arrive via
  // dynamic import well after the load event.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => typeof window.quickSaveDraft === "function", null, {
    timeout: 30000,
  });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  // The app booted from cache, not from the network.
  await page.waitForFunction(() => typeof window.quickSaveDraft === "function", null, {
    timeout: 30000,
  });

  // Offline must not bounce to /login: that page needs the network, and with
  // a cached shell the redirect loops.
  expect(new URL(page.url()).pathname).not.toBe("/login");

  // A save still queues, so the technician is not stranded.
  await setCustomer(page, "Reload", "Offline");
  await page.evaluate(() => window.quickSaveDraft());
  expect(await readQueue(page)).toHaveLength(1);

  // API reads must not be served from cache.
  const apiFailed = await page.evaluate(() =>
    fetch("/api/drafts/search?offerType=bu").then(
      () => false,
      () => true,
    ),
  );
  expect(apiFailed).toBe(true);
});

// Guards the normal path against the offline carve-out above.
test("Sperren online locks, freezes and saves", async ({ page }) => {
  await setCustomer(page, "Lock", "Online");

  await page.evaluate(() => document.getElementById("btnLockOffer").click());

  await expect.poll(async () => (await searchDrafts(page, "Online")).length).toBe(1);
  expect(await page.evaluate(() => window.__locked)).toBe(true);
  expect(await page.evaluate(() => window.__frozen)).toBe(true);
  expect(await page.textContent("#btnLockOffer")).toContain("Entsperren");
});

test("a save whose response is lost is not duplicated on the next sweep", async ({
  page,
  context,
}) => {
  await setCustomer(page, "Lost", "Response");

  await context.setOffline(true);
  const name = await page.evaluate(() => window.quickSaveDraft());
  expect(await readQueue(page)).toHaveLength(1);

  // Install the intercept before reconnecting: going online fires the
  // browser's own `online` event, and that first sweep is the one whose
  // response has to go missing. It lets the request reach the server, then
  // kills the response before the page sees it.
  await page.route("**/api/drafts", async (route) => {
    await route.fetch();
    await route.abort("connectionfailed");
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect.poll(async () => (await searchDrafts(page, "Response")).length).toBe(1);
  expect(await readQueue(page)).toHaveLength(1); // client still thinks it is pending

  // Second sweep: the server matches clientSaveId and answers 200.
  await page.unroute("**/api/drafts");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect
    .poll(async () => (await readQueue(page)).length, { timeout: 20000 })
    .toBe(0);

  const drafts = await searchDrafts(page, "Response");
  expect(drafts).toHaveLength(1); // no duplicate
  expect(drafts[0].name).toBe(name); // and not renamed
});
