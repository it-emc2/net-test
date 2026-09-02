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

// Called after every change to the queue, with the full contents.
//
// IndexedDB is evictable and WebKit refuses persistent storage
// (navigator.storage.persisted() is false on the iPad — measured, not
// assumed), so on iOS the native shell keeps a copy outside the web view's
// data store. In a browser nothing subscribes and this costs one function
// call. See native-bridge.js.
let onChanged = null;

export function onQueueChanged(fn) {
  onChanged = fn;
  return () => { onChanged = null; };
}

async function notifyChanged() {
  if (!onChanged) return;
  try {
    onChanged(await getAllRecords());
  } catch (err) {
    console.warn("[offline-queue] mirror notify failed:", err);
  }
}

/// The whole queue, for the durability mirror to copy out.
export async function getQueueSnapshot() {
  return getAllRecords();
}

/// Used by the durability mirror to put evicted records back. Existing ids win:
/// anything already here is at least as fresh as a copy taken earlier.
export async function restoreRecords(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  const existing = new Set((await getAllRecords()).map((r) => r.id));
  let restored = 0;
  for (const record of records) {
    if (!record?.id || existing.has(record.id)) continue;
    await putRecord(record);
    restored++;
  }
  if (restored) {
    await notifyChanged();
    renderBadge();
  }
  return restored;
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
  await notifyChanged();
  renderBadge();
  return { queued: true, id };
}

let sweeping = false;

// Sweeps every queued record. Called on reconnect, on page load, and whenever
// the app comes back to the foreground.
export async function retryAll() {
  // Three triggers can overlap, and a second sweep would re-post records the
  // first is still working through. clientSaveId makes that harmless
  // server-side, but it is wasted requests on exactly the flaky connection
  // that queued the work in the first place.
  if (sweeping) return;
  sweeping = true;
  try {
    await sweepQueue();
  } finally {
    sweeping = false;
  }
}

async function sweepQueue() {
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
  await notifyChanged();
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
  const all = await getAllRecords();
  updateConnStatus(all);

  const el = ensureBadgeEl();
  if (!el) return;
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

// Permanent header dot: offline / syncing / synced. Unlike the pending-count
// badge above (which only exists inside a summary widget and only appears
// once something is queued), this is always in the DOM so the user has one
// place to glance at regardless of which tab or offer they are on.
//
// `navigator.onLine` is a real interface check here, not a stand-in for
// reachability (the native iPad shell's own captive-portal-aware signal
// drives the offline *fallback screen* separately) — good enough for a status
// dot, where "briefly wrong on a captive portal" is a non-issue.
function updateConnStatus(records) {
  const el = document.getElementById("connStatus");
  if (!el) return;

  if (!navigator.onLine) {
    el.dataset.state = "offline";
    el.title = "Offline – Änderungen werden lokal gespeichert";
    return;
  }

  const pending = records.filter((r) => !r.stuck).length;
  if (pending > 0) {
    el.dataset.state = "syncing";
    el.title = pending === 1 ? "1 wird synchronisiert" : `${pending} werden synchronisiert`;
    return;
  }

  el.dataset.state = "synced";
  el.title = "Synchronisiert";
}

export function initBadge() {
  renderBadge();
}

// Module boot: registers the reconnect listener and flushes anything left
// over from a previous session the moment the app is (re)opened.
window.addEventListener("online", () => retryAll());
// retryAll() re-renders the dot once its sweep finishes; going offline has no
// sweep to trigger one, so it needs its own listener.
window.addEventListener("offline", () => renderBadge());

// Coming back to the app is a reconnect the browser never announces.
// `online` only fires when the *interface* changes, so a server that was
// unreachable for any other reason — a captive portal, a VPN, oc.emc2.de
// itself being down — never triggers it. And iOS resumes a backgrounded web
// app rather than reloading it, so the boot sweep above does not re-run
// either. Observed on the iPad: a draft saved while the server was down sat
// in the queue after the server came back, through several app switches,
// until the page was actually reloaded.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") retryAll();
});

initBadge();
retryAll();
