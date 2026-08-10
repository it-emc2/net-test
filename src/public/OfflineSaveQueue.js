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

async function putRecord(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
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

function notifyRenamed(oldName, newName) {
  window.toast?.warn?.(
    "Entwurf umbenannt",
    `„${oldName}“ existierte bereits – der offline gespeicherte Stand wurde als „${newName}“ übertragen.`,
  );
}

// How many times a record may be rejected by the *server* before it is parked.
// Being offline does not count: postRecord returns null then and the record is
// left untouched.
const MAX_ATTEMPTS = 5;

function notifyStuck(record, status) {
  const label =
    record.kind === "offer" ? `Angebot ${record.offerKey}` : `Entwurf ${record.offerKey}`;
  window.toast?.error?.(
    "Synchronisierung gestoppt",
    `${label} wurde vom Server abgelehnt (${status}) und wird nicht weiter versucht.`,
  );
}

// A draft is readable offline out of LocalDocsStore only until it reaches the
// server; after that the normal drafts search finds it and the local copy is
// just a stale duplicate.
async function releaseLocalDoc(record) {
  if (record.kind !== "draft") return;
  try {
    const store = await import("./LocalDocsStore.js");
    await store.markSynced(record.offerKey);
  } catch (err) {
    console.warn("[offline-queue] local doc cleanup failed:", err);
  }
}

// Resolves to the Response, or to null on a real network failure (offline).
// Native `fetch` throws only on network failure, never on 4xx/5xx.
async function postRecord(record) {
  try {
    return await fetch(record.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(record.body),
    });
  } catch (err) {
    return null;
  }
}

// The only entry point call sites use for a save.
export async function trySaveOrQueue({ kind, offerKey, url, body }) {
  // `savedAt` is stamped here so the server records when the user actually
  // saved, not when the sweep happened to reach the record. `clientSaveId`
  // makes a replay of this exact save idempotent server-side.
  const id = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  const record = {
    id,
    kind,
    offerKey,
    url,
    body: { ...body, savedAt, clientSaveId: id },
    createdAt: savedAt,
  };

  const res = await postRecord(record);
  if (res) return { queued: false, res };

  await addRecord(record);
  renderBadge();
  return { queued: true, id };
}

// Sweeps every queued record. Called on reconnect and on page load.
export async function retryAll() {
  // IndexedDB getAll() yields primary-key order, and the primary key is a
  // random UUID — replaying in that order lets an older save land last and
  // win. Sort by save time so the server sees them as the user made them.
  const records = (await getAllRecords()).sort((a, b) =>
    String(a.createdAt) < String(b.createdAt) ? -1 : 1,
  );
  let syncedCount = 0;

  for (const record of records) {
    if (record.stuck) continue; // already given up on; see MAX_ATTEMPTS

    const res = await postRecord(record);
    if (!res) continue; // still offline, leave queued for the next sweep

    if (res.ok) {
      await deleteRecord(record.id);
      await releaseLocalDoc(record);
      syncedCount++;
      continue;
    }

    if (res.status === 409) {
      if (record.kind !== "draft") {
        // Offer upserts by offerNumber, so a 409 here is a rare but real
        // conflict — don't silently drop it, and don't retry it forever.
        await deleteRecord(record.id);
        notifyConflict(record);
        continue;
      }

      // Replaying a save that already landed answers 200 (matched on
      // clientSaveId), so a 409 is always a collision with a *different*
      // draft — rename and retry rather than dropping the user's payload.
      const oldName = record.body?.name;
      const renamed = {
        ...record,
        body: { ...record.body, name: `${oldName}-offline-${record.id.slice(0, 6)}` },
      };
      await putRecord(renamed);
      const retryRes = await postRecord(renamed);
      if (retryRes?.ok) {
        await deleteRecord(renamed.id);
        await releaseLocalDoc(renamed);
        syncedCount++;
        notifyRenamed(oldName, renamed.body.name);
      }
      // Not ok? The record stays queued under its new name for the next sweep.
      continue;
    }

    // A server answer that is neither ok nor a 409 is a real rejection —
    // a malformed payload, say. Retrying it forever means every future sweep
    // pays for it and the "N ausstehend" badge never clears, so the user
    // reads a permanent failure as a slow sync. Count the attempts and stop.
    const failures = Number(record.failures || 0) + 1;
    if (failures >= MAX_ATTEMPTS) {
      await putRecord({ ...record, failures, stuck: true });
      notifyStuck(record, res.status);
    } else {
      await putRecord({ ...record, failures });
    }
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
  const all = await getAllRecords();
  if (!all.length) {
    el.hidden = true;
    el.textContent = "";
    return;
  }

  // A parked record is not "being synchronised" — saying so would leave the
  // user waiting for something that is never going to happen.
  const stuck = all.filter((r) => r.stuck).length;
  const waiting = all.length - stuck;
  const parts = [];
  if (waiting > 0) {
    parts.push(
      waiting === 1 ? "1 ausstehend – wird synchronisiert" : `${waiting} ausstehend – wird synchronisiert`,
    );
  }
  if (stuck > 0) {
    parts.push(stuck === 1 ? "1 fehlgeschlagen" : `${stuck} fehlgeschlagen`);
  }

  el.hidden = false;
  el.textContent = parts.join(" · ");
}

export function initBadge() {
  renderBadge();
}

// Module boot: registers the reconnect listener and flushes anything left
// over from a previous session the moment the app is (re)opened.
window.addEventListener("online", () => retryAll());
initBadge();
retryAll();
