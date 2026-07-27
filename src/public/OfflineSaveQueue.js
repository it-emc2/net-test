// OfflineSaveQueue.js
// Offline-safe save queue: wraps a save `fetch` so that a network failure
// (offline) queues the request in IndexedDB instead of losing it. Queued
// records are retried on reconnect and on page load.
const DB_NAME = "nt-offline-save-queue";
const STORE = "queue";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("offerKey", "offerKey", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function addRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRecord(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function notifySynced(count) {
  window.toast?.success?.(
    "Synchronisiert",
    count === 1
      ? "1 gespeicherter Eintrag wurde übertragen."
      : `${count} gespeicherte Einträge wurden übertragen.`,
  );
}

function notifyConflict(record) {
  const label =
    record.kind === "offer" ? `Angebot ${record.offerKey}` : `Entwurf ${record.offerKey}`;
  window.toast?.error?.(
    "Synchronisierung fehlgeschlagen",
    `${label} konnte nicht automatisch synchronisiert werden (Konflikt) – bitte öffnen und Stand prüfen.`,
  );
}

// The only entry point call sites use for a save. Native `fetch` throws only
// on real network failure, never on 4xx/5xx — that's the offline signal.
export async function trySaveOrQueue({ kind, offerKey, url, body }) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return { queued: false, res };
  } catch (err) {
    const record = {
      id: crypto.randomUUID(),
      kind,
      offerKey,
      url,
      body,
      createdAt: new Date().toISOString(),
    };
    await addRecord(record);
    renderBadge();
    return { queued: true, id: record.id };
  }
}

// Sweeps every queued record. Called on reconnect and on page load.
export async function retryAll() {
  const records = await getAllRecords();
  let syncedCount = 0;

  for (const record of records) {
    let res;
    try {
      res = await fetch(record.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(record.body),
      });
    } catch (err) {
      continue; // still offline, leave queued for the next sweep
    }

    if (res.ok) {
      await deleteRecord(record.id);
      syncedCount++;
      continue;
    }

    if (res.status === 409) {
      if (record.kind === "draft") {
        // Only retryAll ever replays a record, so a 409 here can only mean
        // this exact queued save already went through (a genuine name
        // collision is caught synchronously in trySaveOrQueue's caller and
        // never reaches the queue at all).
        await deleteRecord(record.id);
        syncedCount++;
      } else {
        // Offer upserts by offerNumber, so a 409 here is a rare but real
        // conflict — don't silently drop it, and don't retry it forever.
        await deleteRecord(record.id);
        notifyConflict(record);
      }
      continue;
    }

    // ponytail: no backoff/retry cap — a permanently failing record just
    // keeps retrying quietly on every reconnect/page load. Acceptable
    // ceiling for v1; add a cap if that's ever actually observed.
  }

  if (syncedCount > 0) notifySynced(syncedCount);
  renderBadge();
}

export async function getPendingCount() {
  const all = await getAllRecords();
  return all.length;
}

export async function getPendingCountForOffer(offerKey) {
  const all = await getAllRecords();
  return all.filter((r) => r.offerKey === offerKey).length;
}

let badgeEl = null;

function ensureBadgeEl() {
  if (badgeEl && document.body.contains(badgeEl)) return badgeEl;
  const container = document.querySelector("#summaryWidget .sw-actions");
  if (!container) return null;
  badgeEl = document.getElementById("swOfflineBadge");
  if (!badgeEl) {
    badgeEl = document.createElement("span");
    badgeEl.id = "swOfflineBadge";
    // No display in the inline styles — an inline display would override the
    // [hidden] attribute and show an empty pill. Layout lives in index.html CSS.
    badgeEl.style.cssText =
      "padding:4px 10px;border-radius:999px;" +
      "font-size:.85rem;font-weight:600;background:rgba(217,119,6,.12);color:#b45309;" +
      "border:1px solid rgba(217,119,6,.35);";
    badgeEl.hidden = true;
    container.appendChild(badgeEl);
  }
  return badgeEl;
}

export async function renderBadge() {
  const el = ensureBadgeEl();
  if (!el) return;
  const count = await getPendingCount();
  if (count <= 0) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent =
    count === 1 ? "1 ausstehend – wird synchronisiert" : `${count} ausstehend – wird synchronisiert`;
}

export function initBadge() {
  renderBadge();
}

// Module boot: registers the reconnect listener and flushes anything left
// over from a previous session the moment the app is (re)opened.
window.addEventListener("online", () => retryAll());
initBadge();
retryAll();
