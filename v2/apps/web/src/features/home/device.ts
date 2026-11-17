// Reads and deletes the device copies of drafts (IndexedDB "oc-local", written by today's UI, ADR 025).
// Read-only otherwise: writing them stays with today's UI until the saving is ported.
import type { DeviceDraft } from "./rules.js";

const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open("oc-local");
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function deviceDrafts(): Promise<DeviceDraft[]> {
  try {
    const db = await open();
    if (!db.objectStoreNames.contains("drafts")) { db.close(); return []; }
    const list = await new Promise<DeviceDraft[]>((res, rej) => {
      const q = db.transaction("drafts").objectStore("drafts").getAll();
      q.onsuccess = () => res(q.result as DeviceDraft[]);
      q.onerror = () => rej(q.error);
    });
    db.close();
    return list.sort((a, b) => (b.localAt ?? 0) - (a.localAt ?? 0));
  } catch { return []; } // no IndexedDB (private mode): nothing on the device to show
}

export async function removeDeviceDraft(key: string): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(["drafts", "history"], "readwrite");
    t.objectStore("drafts").delete(key);
    const h = t.objectStore("history"); // history rows are keyed by id, key is a field
    const c = h.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { if ((cur.value as { key?: string }).key === key) cur.delete(); cur.continue(); } };
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });
  db.close();
}
