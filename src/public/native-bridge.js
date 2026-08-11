// native-bridge.js
// Durability backstop for the offline save queue, inside the iPad shell.
//
// Everything IndexedDB holds is evictable, and WebKit does not implement
// persistent storage — `navigator.storage.persisted()` returns false on the
// iPad, measured on the device, not assumed (see
// docs/plan-ipad-local-first.md, Phase 0 / R2). So a save that is queued but
// not yet synced can in principle be reclaimed under storage pressure, which
// is precisely the one thing the queue exists to prevent.
//
// The native shell therefore keeps a copy of the queue in the app container,
// outside the web view's data store. That file only survives *eviction*; it is
// not a backup of anything else, and it is deleted along with the app.
//
// **This file is a no-op in a browser.** Without `window.webkit`, nothing
// below runs, so the office web app is unaffected.
const handler = window.webkit?.messageHandlers?.durability;

// The shell injects the last mirrored queue as a user script before the page
// loads, so it is already here by the time this runs.
const injected = Array.isArray(window.__nativeQueueMirror)
  ? window.__nativeQueueMirror
  : null;

if (handler) {
  (async () => {
    try {
      const queue = await import("./OfflineSaveQueue.js");

      // Mirror on every change. The native side just writes the JSON.
      queue.onQueueChanged((records) => {
        try {
          handler.postMessage({ type: "queue", records });
        } catch (err) {
          console.warn("[native-bridge] mirror post failed:", err);
        }
      });

      if (injected?.length) {
        const restored = await queue.restoreRecords(injected);
        if (restored > 0) {
          // Only reachable when the browser threw the data away underneath us,
          // so say so rather than letting saves silently reappear.
          console.warn(`[native-bridge] restored ${restored} queued save(s) after eviction`);
          window.toast?.warn?.(
            "Wiederhergestellt",
            restored === 1
              ? "1 nicht übertragener Eintrag wurde wiederhergestellt."
              : `${restored} nicht übertragene Einträge wurden wiederhergestellt.`,
          );
          await rebuildLocalDrafts(injected);
          queue.retryAll();
        }
      } else {
        // Nothing to restore, but the native copy should still match reality —
        // otherwise an empty queue would never clear a stale mirror file.
        handler.postMessage({ type: "queue", records: await queue.getQueueSnapshot() });
      }
    } catch (err) {
      console.warn("[native-bridge] init failed:", err);
    }
  })();
}

// A restored queue record carries the whole draft payload, so the "nur lokal"
// list can be rebuilt from it — otherwise the drafts would be safely queued
// but invisible until they synced.
async function rebuildLocalDrafts(records) {
  try {
    const store = await import("./LocalDocsStore.js");
    for (const record of records) {
      if (record?.kind !== "draft" || !record.offerKey) continue;
      await store.save({
        key: record.offerKey,
        kind: "draft",
        offerType: record.body?.offerType,
        name: record.body?.name,
        payload: record.body?.payload,
        savedAt: record.body?.savedAt || record.createdAt,
      });
    }
  } catch (err) {
    console.warn("[native-bridge] local draft rebuild failed:", err);
  }
}
