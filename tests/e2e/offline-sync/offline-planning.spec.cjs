// Offline "Heutige Planung" — the primary field workflow, in a real browser
// with a real service worker and a real IndexedDB.
//
// On site the salesperson picks a planned appointment and gets the customer's
// Bitrix data prefilled. Without a cache that collapses entirely: the list
// renders "Fehler beim Laden der Planungstermine", and the Anrede cannot be
// filled at all because the route-planning service carries no HONORIFIC field.
//
// The unit suites stub IndexedDB and the module boundary. This one drives the
// real stores across a reload. "Offline" here means the APIs are unreachable
// while the shell still loads — see cutTheApisOff() for why that is not
// context.setOffline().
const { test, expect } = require("@playwright/test");
const { USER } = require("./global-setup.cjs");

const DEAL_ID = "4711";
const CUSTOMER = "Meier, Hans";

// buildPlanningEntries() prefers planning.futurePlanned filtered to today, and
// today is derived with toLocaleDateString("sv-SE").
const todayKey = () => new Date().toLocaleDateString("sv-SE");

const planningPayload = () => ({
  planning: {
    futurePlanned: [
      {
        id: "e2e-planning-1",
        name: CUSTOMER,
        address: "Musterweg 5, 95028 Hof",
        email: "hans@example.de",
        phone: "0921 12345",
        plannedDate: todayKey(),
        importDealId: DEAL_ID,
        contactId: "99",
        duration: 90,
        dayIndex: 0,
      },
    ],
    days: [],
  },
});

// The Bitrix contact behind that appointment. HNR_DE_2 -> "Herr"; this is the
// field the planning service cannot supply.
const bitrixContact = {
  HONORIFIC: { STATUS_ID: "HNR_DE_2" },
  EMAIL: [{ VALUE: "hans@example.de" }],
  PHONE: [{ VALUE: "0921 12345" }],
  ADDRESS: "Musterweg 5",
  ADDRESS_CITY: "Hof",
  ADDRESS_POSTAL_CODE: "95028",
};

const json = (body) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

// Everything the planning panel calls. The upstream route-planning service and
// Bitrix are not reachable from this suite, so they are served here — which is
// also what keeps the test about the client-side cache rather than the proxy.
async function serveOnline(page) {
  await page.route("**/api/planning/current", (r) => r.fulfill(json(planningPayload())));
  await page.route("**/api/planning/stream", (r) => r.abort());
  await page.route("**/api/bitrix/activities/today", (r) => r.fulfill(json({ byDealId: {} })));
  await page.route("**/api/bitrix/deals/stages*", (r) => r.fulfill(json({ stages: {} })));
  await page.route(`**/api/bitrix/deal/${DEAL_ID}`, (r) =>
    r.fulfill(json({ contact: bitrixContact })),
  );
}

// Reads the enrichment store the same way the app does, so the assertion is
// against the real database rather than a stub.
const readEnrichment = (page, key) =>
  page.evaluate(
    (k) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("nt-planning-cache");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("enrichment")) return resolve(null);
          const req = db.transaction("enrichment", "readonly").objectStore("enrichment").get(k);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => resolve(req.result || null);
        };
      }),
    key,
  );

const listText = (page) => page.locator("#todayPlanningList").innerText();
const metaText = (page) => page.locator("#todayPlanningMeta").innerText();

// The shell has to be cached before the network goes away, or the reload has
// nothing to load and the test would be measuring the service worker instead.
async function waitForControllingWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30000,
  });
}

// Cuts the app off from its APIs while leaving static assets reachable.
//
// Deliberately not context.setOffline(true): under a full Chromium offline
// emulation every dynamic import() fails after a reload — including
// pre-existing ones like /pricing-client.js and /OfflineSaveQueue.js, which
// are precached by sw.js and served correctly to fetch(). That is a real
// question about the service-worker shell, but it predates this cache and is
// not what these tests are about. Killing the APIs reproduces exactly the
// condition the code under test handles: fetchTodayPlanningSnapshot() throws
// and has to fall back.
async function cutTheApisOff(page) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route("**/api/**", (r) => r.abort());
}

test.beforeEach(async ({ page }) => {
  const login = await page.request.post("/api/auth/login", { data: USER });
  expect(login.status(), await login.text()).toBe(200);
  await serveOnline(page);
});

test("the planned week survives a reload with the APIs unreachable", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => listText(page), { timeout: 30000 }).toContain(CUSTOMER);
  await waitForControllingWorker(page);

  // The week-warming pass has to have stored the Anrede while there was still
  // signal — that is the whole point of it.
  await expect
    .poll(() => readEnrichment(page, `d:${DEAL_ID}`), { timeout: 30000 })
    .toMatchObject({ salutation: "Herr", city: "Hof" });

  await cutTheApisOff(page);
  await page.reload();

  // The appointment list is still there…
  await expect.poll(() => listText(page), { timeout: 30000 }).toContain(CUSTOMER);
  // …and is honest about being a cached copy rather than today's live plan.
  expect(await metaText(page)).toMatch(/Offline – Stand/);
});

test("with the APIs down, tapping a planned appointment still fills the Anrede", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => listText(page), { timeout: 30000 }).toContain(CUSTOMER);
  await waitForControllingWorker(page);
  await expect
    .poll(() => readEnrichment(page, `d:${DEAL_ID}`), { timeout: 30000 })
    .toMatchObject({ salutation: "Herr" });

  await cutTheApisOff(page);
  await page.reload();
  await expect.poll(() => listText(page), { timeout: 30000 }).toContain(CUSTOMER);

  // The enrichment step of the prefill, with the network gone. Driven directly
  // rather than through the card + offer-picker modal so the assertion is
  // about the cache, not about the modal's markup.
  const filled = await page.evaluate(
    async ([dealId, contactId]) => {
      await window.__debug_enrichPlanningAppointment(
        { importDealId: dealId, contactId },
        window.__formGeneration,
      );
      return {
        salutation:
          document.querySelector('input[name="salutation"]:checked')?.value || "",
        city: document.getElementById("city")?.value || "",
        postalCode: document.getElementById("postalCode")?.value || "",
      };
    },
    [DEAL_ID, "99"],
  );

  expect(filled.salutation).toBe("Herr");
  expect(filled.city).toBe("Hof");
  expect(filled.postalCode).toBe("95028");
});

test("with an empty cache the list still reports the failure", async ({ page }) => {
  // A cache miss must not be silently rendered as "no appointments today" —
  // that reads as an empty day rather than as missing data.
  await page.goto("/");
  await waitForControllingWorker(page);

  await page.evaluate(() => indexedDB.deleteDatabase("nt-planning-cache"));
  await cutTheApisOff(page);
  await page.reload();

  await expect
    .poll(() => metaText(page), { timeout: 30000 })
    .toMatch(/konnten nicht geladen werden/);
});
