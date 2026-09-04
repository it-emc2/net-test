// PlanningCache.js
// Keeps the "Heutige Planung" data available without a connection.
//
// The salesperson's main job on site is to start an offer from a planned
// appointment with the customer's Bitrix data already filled in. Without a
// cache that is exactly what breaks first: /api/planning/current fails, the
// list renders "Fehler beim Laden der Planungstermine", and everything has to
// be typed by hand — which is the work the planning integration exists to
// remove.
//
// Two stores, because they have different lifetimes:
//   snapshot   — one record, the whole week, overwritten on every refresh
//   enrichment — one record per appointment, the Bitrix fields the
//                route-planning service does not carry (above all the Anrede)
//
// Everything is stored verbatim as the endpoints returned it, so the render
// path consumes a cache hit through the exact same code as a live response.
// No second mapping layer to keep in sync.
const DB_NAME = "nt-planning-cache";
const SNAPSHOT_STORE = "snapshot";
const ENRICHMENT_STORE = "enrichment";
const SNAPSHOT_KEY = "current";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE);
      }
      if (!db.objectStoreNames.contains(ENRICHMENT_STORE)) {
        db.createObjectStore(ENRICHMENT_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const out = run(t.objectStore(storeName));
        // `out` is an IDBRequest for reads and undefined for writes. Test for
        // the property rather than its value: a miss has `result === undefined`
        // and must resolve to undefined, not to the request object.
        // Guard the type as well as the property: a store method that hands
        // back a primitive would make `in` throw inside oncomplete, and the
        // promise would then never settle at all.
        t.oncomplete = () =>
          resolve(out && typeof out === "object" && "result" in out ? out.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

// Stable cache key for one appointment. The enrich path resolves a deal first
// and only falls back to the contact, so the key follows the same preference —
// look-ups and writes derive it from the same entry and therefore agree.
export function enrichmentKey(entry) {
  const dealId = String(entry?.importDealId || "").trim();
  if (dealId) return `d:${dealId}`;
  const contactId = String(entry?.contactId || "").trim();
  return contactId ? `c:${contactId}` : "";
}

// ---------- snapshot ----------

// `payload` is the /api/planning/current body verbatim (the whole week:
// planning.days[].customers[] plus planning.futurePlanned[]), after the
// Bitrix appointment times have been merged into it in place — so the times
// ride along and need no separate record.
//
// Deliberately not cached: per-deal "done" state (markDealStage). It's only
// ever set locally when this app itself moves a deal's stage, and an unknown
// stage already falls through to "show it" — absent behaves the same as stale.
export async function saveSnapshot(payload) {
  try {
    await tx(SNAPSHOT_STORE, "readwrite", (s) =>
      s.put({ payload, fetchedAt: new Date().toISOString() }, SNAPSHOT_KEY),
    );
  } catch (err) {
    // A cache write must never break a load that already succeeded.
    console.warn("[planning-cache] snapshot save failed:", err);
  }
}

export async function loadSnapshot() {
  try {
    const rec = await tx(SNAPSHOT_STORE, "readonly", (s) => s.get(SNAPSHOT_KEY));
    return rec?.payload ? rec : null;
  } catch (err) {
    console.warn("[planning-cache] snapshot load failed:", err);
    return null;
  }
}

// ---------- enrichment ----------

export async function saveEnrichment(key, fields) {
  if (!key) return;
  try {
    await tx(ENRICHMENT_STORE, "readwrite", (s) =>
      s.put({ key, ...fields, fetchedAt: new Date().toISOString() }),
    );
  } catch (err) {
    console.warn("[planning-cache] enrichment save failed:", err);
  }
}

export async function loadEnrichment(key) {
  if (!key) return null;
  try {
    return (await tx(ENRICHMENT_STORE, "readonly", (s) => s.get(key))) || null;
  } catch (err) {
    console.warn("[planning-cache] enrichment load failed:", err);
    return null;
  }
}

export function isFresh(record, maxAgeMs) {
  const at = Date.parse(record?.fetchedAt || "");
  return Number.isFinite(at) && Date.now() - at < maxAgeMs;
}
