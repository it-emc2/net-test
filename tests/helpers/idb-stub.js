// Minimal IndexedDB stub — just enough for OfflineSaveQueue's add/put/delete/
// getAll. getAll() sorts by key exactly like the real thing, which is what
// made the offline replay order random in the first place.
export function makeIdbStub() {
  const data = new Map();

  const store = {
    add: (r) => data.set(r.id, r),
    put: (r) => data.set(r.id, r),
    delete: (id) => data.delete(id),
    createIndex: () => {},
    getAll: () => {
      const req = {};
      queueMicrotask(() => {
        req.result = [...data.keys()].sort().map((k) => data.get(k));
        req.onsuccess?.();
      });
      return req;
    },
  };

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => {
      const tx = { objectStore: () => store };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };

  return {
    data,
    indexedDB: {
      open: () => {
        const req = { result: db };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    },
  };
}
