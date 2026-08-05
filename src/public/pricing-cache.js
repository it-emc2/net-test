// Stores the pricing inputs (/api/price/inputs) so totals can be computed
// without the server. One record, overwritten on every successful refresh.
const DB_NAME = "nt-pricing-inputs";
const STORE = "inputs";
const KEY = "current";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function saveInputs(inputs) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ ...inputs, cachedAt: new Date().toISOString() }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadInputs() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Called on every boot with signal. Failure is silent: an older snapshot is
// still better than none, and being offline here is the normal case.
export async function refreshInputs() {
  try {
    const res = await fetch("/api/price/inputs", { credentials: "include" });
    if (!res.ok) throw new Error(`inputs fetch failed (${res.status})`);
    const inputs = await res.json();
    if (!inputs?.config || !Array.isArray(inputs.products)) {
      throw new Error("inputs payload malformed");
    }
    await saveInputs(inputs);
    return inputs;
  } catch (err) {
    console.warn("[pricing-cache] refresh skipped:", err);
    return null;
  }
}
