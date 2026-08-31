/**
 * @jest-environment jsdom
 *
 * The offline half of the planning prefill, driven through the real script.js.
 *
 * planning-cache.test.js covers the store. This covers the thing the
 * salesperson actually notices: tapping a planned appointment on site with no
 * signal must still fill the Anrede and the contact fields. The
 * route-planning service carries no HONORIFIC field at all, so without the
 * enrichment cache the Anrede is simply blank.
 *
 * script.js is a classic script, evaluated the way scriptBoots.test.js does
 * it. Booted exactly once: a second window.eval() into the same window
 * re-registers every listener and timer the script installs, which compounds
 * per test until the suite crawls.
 */
import { jest } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Booting the real script.js takes ~8s alone and appreciably longer when jest
// runs suites in parallel, so the project-wide 10s (package.json testTimeout)
// times out the beforeAll hook under load. Applies to hooks and tests alike.
jest.setTimeout(120000);

const PUBLIC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src/public",
);

// Stands in for PlanningCache.js. script.js reaches it through the rewritten
// dynamic import in bootScript().
function makeFakeCache() {
  const snapshots = new Map();
  const enrichments = new Map();
  return {
    module: {
      enrichmentKey: (entry) =>
        entry?.importDealId
          ? `d:${entry.importDealId}`
          : entry?.contactId
            ? `c:${entry.contactId}`
            : "",
      saveSnapshot: async (payload) =>
        snapshots.set("current", { payload, fetchedAt: new Date().toISOString() }),
      loadSnapshot: async () => snapshots.get("current") || null,
      saveEnrichment: async (key, fields) => enrichments.set(key, { key, ...fields }),
      loadEnrichment: async (key) => enrichments.get(key) || null,
      isFresh: () => false,
    },
    snapshots,
    enrichments,
  };
}

// Swapped per test; the import stub installed at boot reads it by reference.
let fake = makeFakeCache();

const CONTACT_FIELDS = ["email", "phone", "street", "city", "postalCode"];

function bootScript() {
  document.documentElement.innerHTML = fs
    .readFileSync(path.join(PUBLIC, "index.html"), "utf8")
    .replace(/<script[\s\S]*?<\/script>/g, "");

  window.CSS = { supports: () => false, escape: (x) => String(x) };
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  // Reject by default. A resolving stub feeds script.js's background pollers
  // real-looking payloads, and one of them resets the form and bumps
  // __formGeneration — which then discards the answer under test.
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

  const noopModule = new Proxy(
    {},
    { get: (_t, k) => (k === "then" ? undefined : () => ({})) },
  );
  // Every module stubs to a no-op except PlanningCache, the one under test.
  window.__importStub = (spec) =>
    Promise.resolve(String(spec).includes("PlanningCache") ? fake.module : noopModule);

  const src = fs
    .readFileSync(path.join(PUBLIC, "script.js"), "utf8")
    .replace(/\bimport\(/g, "__importStub(");
  window.eval(src);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const salutationValue = () =>
  document.querySelector('input[name="salutation"]:checked')?.value || "";

// script.js bumps __formGeneration during its own boot (the initial form
// reset), so tests must pass whatever it currently is rather than a literal —
// otherwise the staleness guard correctly discards the answer and every
// assertion sees an empty form.
const currentGeneration = () => window.__formGeneration;

const enrich = (entry, generation = currentGeneration()) =>
  window.__debug_enrichPlanningAppointment(entry, generation);

// Answer only the Bitrix lookup and leave every other request failing. A
// blanket "everything resolves" stub also feeds script.js's background pollers,
// one of which resets the form and bumps __formGeneration mid-test.
// Note how narrow this is: /api/bitrix/activities/today and
// /api/bitrix/deals/stages are polled by the planning panel, and answering
// those re-renders the list and resets the form mid-test.
const onlyBitrixReturns = (contact) => (url) =>
  /\/api\/bitrix\/(deal|contact)\//.test(String(url))
    ? Promise.resolve({ ok: true, json: async () => ({ contact }) })
    : Promise.reject(new TypeError("Failed to fetch"));

beforeAll(async () => {
  bootScript();
  // Let boot's own async work (and its generation bump) settle first.
  await new Promise((r) => setTimeout(r, 50));
});

beforeEach(() => {
  fake = makeFakeCache();
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));
  for (const id of CONTACT_FIELDS) {
    const el = document.getElementById(id);
    if (el) el.value = "";
  }
  document
    .querySelectorAll('input[name="salutation"]')
    .forEach((el) => (el.checked = false));
});

test("offline: a planned appointment still fills Anrede and contact fields", async () => {
  // What the week-warming pass stored while the device still had signal.
  await fake.module.saveEnrichment("d:4711", {
    salutation: "Frau",
    email: "eva@example.de",
    phone: "0921 12345",
    street: "Musterweg 5",
    city: "Hof",
    postalCode: "95028",
  });

  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

  await enrich({ importDealId: "4711", contactId: "99" });
  await flush();

  expect(salutationValue()).toBe("Frau");
  expect(document.getElementById("email").value).toBe("eva@example.de");
  expect(document.getElementById("phone").value).toBe("0921 12345");
  expect(document.getElementById("city").value).toBe("Hof");
});

test("offline with nothing cached: fills nothing rather than throwing", async () => {
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

  await expect(enrich({ importDealId: "unknown" })).resolves.toBeUndefined();

  expect(salutationValue()).toBe("");
});

test("online: the live answer is written to the cache for later", async () => {
  window.fetch = onlyBitrixReturns({
    HONORIFIC: { STATUS_ID: "HNR_DE_2" },
    EMAIL: [{ VALUE: "hans@example.de" }],
    ADDRESS_CITY: "Bayreuth",
  });

  await enrich({ importDealId: "4711" });
  await flush();

  // Asserted on the cache, not the DOM: the write happens before the
  // generation guard, so it cannot race a background form reset. Whether the
  // fields reach the form is covered by the offline test above and by the
  // guard test below.
  expect(fake.enrichments.get("d:4711")).toMatchObject({
    salutation: "Herr",
    email: "hans@example.de",
    city: "Bayreuth",
  });
});

test("a form reset mid-flight discards the answer instead of filling a new offer", async () => {
  await fake.module.saveEnrichment("d:4711", {
    salutation: "Frau",
    email: "eva@example.de",
  });
  window.fetch = () => Promise.reject(new TypeError("Failed to fetch"));

  // The user went back to the Hauptmenü and started a different offer while
  // the lookup was still running.
  const pending = enrich({ importDealId: "4711" });
  window.__formGeneration = currentGeneration() + 1;
  await pending;
  await flush();

  expect(salutationValue()).toBe("");
  expect(document.getElementById("email").value).toBe("");
});

test("the HONORIFIC values Bitrix sends map to the German salutations", async () => {
  const cachedSalutation = async (honorific) => {
    window.fetch = onlyBitrixReturns({ HONORIFIC: { STATUS_ID: honorific } });
    // No flush needed: enrich() resolves after the cache write.
    await enrich({ importDealId: honorific });
    return fake.enrichments.get(`d:${honorific}`)?.salutation;
  };

  expect(await cachedSalutation("HNR_DE_1")).toBe("Frau");
  expect(await cachedSalutation("HNR_DE_2")).toBe("Herr");
  expect(await cachedSalutation("1")).toBe("Familie");
  // An unknown code must leave the Anrede blank, never guess.
  expect(await cachedSalutation("SOMETHING_ELSE")).toBe("");
});
