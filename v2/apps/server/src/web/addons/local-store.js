/* v2 add-on — the device copy of every draft (local-first saving, ADR 025).
 *
 * Why: a rep in a cellar has no connection. Until now a change lived only in the open page until
 * the server answered; a reload, a closed tab or iOS discarding the page lost it (10 Nov 2026).
 * Now the device is written FIRST, the server copy follows (deal-draft.js).
 *
 * IndexedDB "oc-local", two stores:
 *   drafts  — one record per draft key (deal number or temporary key t-…): the current state
 *   history — the last states of each draft on this device (a safety net, also offline)
 * A record: { key, offerType, payload, localAt, dirty, baseRevision, syncedRevision, syncedAt,
 *             adoptFrom, conflict, title, step }
 *   dirty        = not yet on the server
 *   baseRevision = the server version this state was built on (null = unknown)
 * Nothing here talks to the server. Without IndexedDB (private mode) it keeps the data in
 * memory only and says so through `durable === false`. */
(function () {
  "use strict";
  var DB = "oc-local", VERSION = 1, HISTORY_MAX = 8, KEEP_SYNCED_DAYS = 14;
  var mem = { drafts: {}, history: [] }, dbp = null, durable = true;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB, VERSION); } catch (e) { durable = false; return resolve(null); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "key" });
        if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id", autoIncrement: true }).createIndex("key", "key");
      };
      req.onsuccess = function () {
        var db = req.result;
        db.onversionchange = function () { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = req.onblocked = function () { durable = false; resolve(null); };
    });
    // ask the browser not to clear this storage under pressure (granted for installed apps)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* optional */ }
    return dbp;
  }
  // one transaction; resolves with the value `fn` hands to `done`, after the data is on disk
  function tx(stores, mode, fn) {
    return open().then(function (db) {
      if (!db) return undefined;
      return new Promise(function (resolve, reject) {
        var out, t;
        try { t = db.transaction(stores, mode); } catch (e) { return reject(e); }
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error || new Error("local store")); };
        fn(t, function (v) { out = v; });
      });
    });
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function get(key) {
    return tx(["drafts"], "readonly", function (t, done) {
      var r = t.objectStore("drafts").get(key);
      r.onsuccess = function () { done(r.result || null); };
    }).then(function (v) { return v === undefined ? (mem.drafts[key] ? clone(mem.drafts[key]) : null) : v; });
  }
  function all() {
    return tx(["drafts"], "readonly", function (t, done) {
      var r = t.objectStore("drafts").getAll();
      r.onsuccess = function () { done(r.result || []); };
    }).then(function (v) {
      var list = v === undefined ? Object.keys(mem.drafts).map(function (k) { return clone(mem.drafts[k]); }) : v;
      return list.sort(function (a, b) { return (b.localAt || 0) - (a.localAt || 0); });
    });
  }
  /** store the current state; with `snapshot` also keep it in the device history */
  function put(rec, snapshot) {
    return tx(["drafts", "history"], "readwrite", function (t) {
      t.objectStore("drafts").put(rec);
      if (!snapshot) return;
      var h = t.objectStore("history");
      h.add({ key: rec.key, at: rec.localAt, offerType: rec.offerType, payload: rec.payload, step: rec.step || "" });
      var ids = h.index("key").getAllKeys(rec.key);
      ids.onsuccess = function () {
        var list = ids.result || [];
        for (var i = 0; i < list.length - HISTORY_MAX; i++) h.delete(list[i]); // oldest first
      };
    }).then(function (v) {
      if (v !== undefined || durable) return;
      mem.drafts[rec.key] = clone(rec);
      if (snapshot) mem.history.push({ key: rec.key, at: rec.localAt, offerType: rec.offerType, payload: clone(rec.payload), step: rec.step || "" });
    });
  }
  /** change fields of a record without touching its payload (sync results) */
  function patch(key, fields) {
    return tx(["drafts"], "readwrite", function (t, done) {
      var s = t.objectStore("drafts"), r = s.get(key);
      r.onsuccess = function () {
        if (!r.result) return done(null);
        var next = Object.assign(r.result, fields);
        s.put(next); done(next);
      };
    }).then(function (v) {
      if (v !== undefined || durable) return v;
      if (mem.drafts[key]) Object.assign(mem.drafts[key], fields);
      return mem.drafts[key] || null;
    });
  }
  function remove(key) {
    return tx(["drafts", "history"], "readwrite", function (t) {
      t.objectStore("drafts").delete(key);
      var h = t.objectStore("history"), ids = h.index("key").getAllKeys(key);
      ids.onsuccess = function () { (ids.result || []).forEach(function (id) { h.delete(id); }); };
    }).then(function () { delete mem.drafts[key]; mem.history = mem.history.filter(function (x) { return x.key !== key; }); });
  }
  function history(key) {
    return tx(["history"], "readonly", function (t, done) {
      var r = t.objectStore("history").index("key").getAll(key);
      r.onsuccess = function () { done(r.result || []); };
    }).then(function (v) {
      var list = v === undefined ? mem.history.filter(function (x) { return x.key === key; }) : v;
      return list.sort(function (a, b) { return b.at - a.at; });
    });
  }
  /** forget drafts that are safely on the server and were not touched for two weeks */
  function purge(now) {
    var limit = (now || Date.now()) - KEEP_SYNCED_DAYS * 24 * 3600 * 1000;
    return all().then(function (list) {
      return Promise.all(list.filter(function (r) { return !r.dirty && !r.conflict && (r.localAt || 0) < limit; }).map(function (r) { return remove(r.key); }));
    });
  }

  window.__ocLocal = {
    get: get, all: all, put: put, patch: patch, remove: remove, history: history, purge: purge,
    isDurable: function () { return open().then(function (db) { return !!db && durable; }); },
  };
})();
