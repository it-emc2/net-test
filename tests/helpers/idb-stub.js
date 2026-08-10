// Minimal IndexedDB stub — enough for OfflineSaveQueue's add/put/delete/getAll
// and PlanningCache's multi-store get/put with out-of-line keys.
//
// getAll() sorts by key exactly like the real thing, which is what made the
// offline replay order random in the first place.
export function makeIdbStub() {
  const stores = new Map();

  const dataFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };

  // IndexedDB has two key modes and PlanningCache uses both: the enrichment
  // store has a keyPath, the snapshot store is keyed explicitly per call.
  const makeStore = (name) => {
    const data = dataFor(name);
    const keyFor = (record, explicitKey) =>
      explicitKey !== undefined ? explicitKey : (record?.key ?? record?.id);

    // Real IndexedDB populates request.result before it fires onsuccess, and
    // fires transaction.oncomplete only after every request has settled. Set
    // the result synchronously so a caller reading it from oncomplete sees the
    // value rather than an unsettled request.
    const asRequest = (compute) => {
      const req = { result: compute() };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    };

    // Real IndexedDB returns an IDBRequest from add/put/delete too, not a bare
    // value. Callers legitimately inspect what comes back (`"result" in out`),
    // and a primitive there throws.
    return {
      add: (r, key) => asRequest(() => data.set(keyFor(r, key), r) && undefined),
      put: (r, key) => asRequest(() => data.set(keyFor(r, key), r) && undefined),
      delete: (key) => asRequest(() => data.delete(key) && undefined),
      get: (key) => asRequest(() => data.get(key)),
      createIndex: () => {},
      getAll: () => asRequest(() => [...data.keys()].sort().map((k) => data.get(k))),
    };
  };

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: (name) => makeStore(name),
    transaction: (name) => {
      const tx = { objectStore: () => makeStore(name) };
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    },
  };

  return {
    stores,
    // Back-compat alias for the OfflineSaveQueue suite, which predates
    // multi-store support and addresses its one store directly.
    data: dataFor("queue"),
    indexedDB: {
      open: () => {
        const req = { result: db };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    },
  };
}
