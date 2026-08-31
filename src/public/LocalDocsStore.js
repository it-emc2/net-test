// LocalDocsStore.js
// The drafts you saved on site but have not synced yet.
//
// OfflineSaveQueue already guarantees a queued save is not *lost* — it replays
// on reconnect. What it cannot do is give the draft back to you before then:
// the drafts list and load both go through /api/drafts, so offline they fail
// and the morning's work is invisible until signal returns. Two customers
// before finding a bar of signal is a normal morning.
//
// Scope is deliberately narrow: **only work that has not reached the server**.
// A synced draft is on the server, findable by the normal search, so its record
// here is deleted. The store is therefore small — it holds the backlog, not an
// archive.
//
// ponytail: no index, no pagination. getAll() + filter is plenty for a backlog
// that is realistically a handful of records; revisit if it ever isn't.
const DB_NAME = "nt-local-docs";
const STORE = "docs";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const out = run(t.objectStore(STORE));
        // `out` is an IDBRequest for reads and undefined for writes. Test for
        // the property, not its value: a miss has result === undefined and
        // must resolve to undefined rather than to the request object.
        // Guard the type as well as the property: a store method that hands
        // back a primitive would make `in` throw inside oncomplete, and the
        // promise would then never settle at all.
        t.oncomplete = () =>
          resolve(out && typeof out === "object" && "result" in out ? out.result : undefined);
        t.onerror = () => reject(t.error);
      }),
  );
}

/// `key` is the queue's own offerKey, so a record here and the queued save it
/// belongs to always agree, and re-saving the same draft name overwrites
/// instead of piling up duplicates.
export async function save({ key, kind, offerType, name, payload, savedAt }) {
  if (!key) return;
  try {
    await tx("readwrite", (s) =>
      s.put({
        key,
        kind: kind || "draft",
        offerType: String(offerType || "").toLowerCase(),
        name: name || "",
        payload,
        savedAt: savedAt || new Date().toISOString(),
      }),
    );
  } catch (err) {
    // Never let bookkeeping break a save that the queue already accepted.
    console.warn("[local-docs] save failed:", err);
  }
}

export async function get(key) {
  if (!key) return null;
  try {
    return (await tx("readonly", (s) => s.get(key))) || null;
  } catch (err) {
    console.warn("[local-docs] get failed:", err);
    return null;
  }
}

/// Called once a queued save actually reaches the server: the draft is now
/// findable through the normal search, so the local copy has done its job.
export async function markSynced(key) {
  if (!key) return;
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch (err) {
    console.warn("[local-docs] markSynced failed:", err);
  }
}

/// Pending drafts for one offer type, newest first, optionally name-filtered —
/// the same shape the drafts list renders from.
export async function listPending({ offerType, query } = {}) {
  let all = [];
  try {
    all = (await tx("readonly", (s) => s.getAll())) || [];
  } catch (err) {
    console.warn("[local-docs] list failed:", err);
    return [];
  }

  const wantType = String(offerType || "").toLowerCase();
  const needle = String(query || "").trim().toLowerCase();

  return all
    .filter((d) => d.kind === "draft")
    .filter((d) => !wantType || d.offerType === wantType)
    .filter((d) => !needle || String(d.name || "").toLowerCase().includes(needle))
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

export async function countPending() {
  return (await listPending()).length;
}
