/* Session recorder (rrweb) — runs only for users in RECORD_USERS (server decides).
   Every batch is written to IndexedDB first, then uploaded and deleted on success,
   so offline time, app switches and closed tabs don't lose anything.
   Never recorded: password fields, <canvas> (signatures), inline data: images (photos). */
(function () {
  "use strict";
  if (!window.fetch || !window.indexedDB || !window.CompressionStream || !window.crypto?.randomUUID) return;

  var FLAG = "nt_rec_on"; // last server answer, used when offline at page load
  var FLUSH_MS = 60000;   // idle produces no events, so idle produces no uploads
  var MAX_BUF = 3000;

  function cachedFlag() { try { return localStorage.getItem(FLAG) === "1"; } catch (e) { return false; } }
  function setFlag(on) { try { on ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG); } catch (e) {} }

  fetch("/api/recording/config", { credentials: "same-origin", cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) {
      if (!c) return cachedFlag() && start(); // 401 etc.: keep last decision
      setFlag(!!c.record);
      if (c.record) start();
      else drop(); // switched off: discard anything still queued
    })
    .catch(function () { if (cachedFlag()) start(); }); // offline

  // ---- IndexedDB queue ----
  var dbp;
  function db() {
    return dbp || (dbp = new Promise(function (ok, no) {
      var r = indexedDB.open("oc-rec-queue", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("chunks", { keyPath: "id" }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    }));
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction("chunks", mode), req = fn(t.objectStore("chunks"));
        t.oncomplete = function () { ok(req && req.result); };
        t.onerror = function () { no(t.error); };
      });
    });
  }
  function drop() { indexedDB.deleteDatabase("oc-rec-queue"); }

  var draining = false;
  function drain() {
    if (draining || !navigator.onLine) return;
    draining = true;
    tx("readonly", function (s) { return s.getAll(); })
      .then(function (items) {
        items.sort(function (a, b) { return a.from - b.from; });
        return items.reduce(function (p, it) {
          return p.then(function () {
            var q = "sid=" + it.sid + "&seq=" + it.seq + "&from=" + it.from + "&to=" + it.to + "&errors=" + it.errors + "&vp=" + encodeURIComponent(it.vp);
            return origFetch("/api/recording/chunk?" + q, {
              method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/gzip" }, body: it.blob,
            }).then(function (r) {
              if (r.ok || r.status === 400 || r.status === 403) return tx("readwrite", function (s) { return s.delete(it.id); });
              throw new Error("upload " + r.status); // keep it, stop, retry later in order
            });
          });
        }, Promise.resolve());
      })
      .catch(function () {})
      .then(function () { draining = false; });
  }

  // ---- recording ----
  var origFetch = window.fetch.bind(window);
  var buf = [], seq = 0, errs = 0, sid, rec;
  // iPadOS Safari reports itself as a Mac; a touch screen gives it away.
  var ua = navigator.userAgent;
  var device = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iPad"
    : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Desktop";

  function load(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = no;
      document.head.appendChild(s);
    });
  }
  function start() {
    load("/vendor/rrweb/rrweb.umd.min.cjs")
      .then(function () { return load("/vendor/rrweb-console/rrweb-plugin-console-record.umd.min.cjs"); })
      .then(init, function () {});
  }

  function init() {
    sid = crypto.randomUUID();
    rec = window.rrweb.record;
    rec({
      emit: function (e) { buf.push(e); if (buf.length >= MAX_BUF) flush(); },
      maskInputOptions: { password: true },
      blockSelector: "canvas, img[src^='data:']",
      recordCanvas: false,
      inlineImages: false,
      collectFonts: false,
      sampling: { mousemove: false, scroll: 150, input: "last", media: 800 },
      plugins: [window.rrwebPluginConsoleRecord.getRecordConsolePlugin({ level: ["error", "warn"], lengthThreshold: 200 })],
    });
    mark("device", { device: device, ua: ua, vp: innerWidth + "x" + innerHeight, online: navigator.onLine });

    addEventListener("error", function (e) {
      errs++;
      mark("js-error", { msg: String(e.message || e.error || "").slice(0, 500), src: e.filename, line: e.lineno, col: e.colno });
    });
    addEventListener("unhandledrejection", function (e) {
      errs++;
      mark("promise-error", { msg: String((e.reason && (e.reason.stack || e.reason.message)) || e.reason).slice(0, 500) });
    });
    // Page changes (#Kundendaten, #Wandverkleidung …) → dwell times, abandoned flows.
    mark("page", { hash: location.hash });
    addEventListener("hashchange", function () { mark("page", { hash: location.hash }); });

    // Every message the app shows him. All toasts end up as .nt-toast in #nt-toaster;
    // native alert/confirm/prompt are logged with his answer.
    var toaster = document.getElementById("nt-toaster");
    if (toaster) new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1 || !n.classList.contains("nt-toast")) return;
          var kind = ["error", "warn", "success", "info"].find(function (k) { return n.classList.contains(k); }) || "info";
          if (kind === "error") errs++;
          mark("message", { kind: kind, text: n.textContent.replace(/\s*×\s*/, " · ").replace(/\s+/g, " ").trim().slice(0, 400) });
        });
      });
    }).observe(toaster, { childList: true });
    ["alert", "confirm", "prompt"].forEach(function (k) {
      var orig = window[k];
      window[k] = function (msg) {
        var answer = orig.apply(window, arguments);
        mark("dialog", { type: k, text: String(msg == null ? "" : msg).slice(0, 400), answer: k === "alert" ? undefined : k === "prompt" ? answer != null : answer });
        return answer;
      };
    });

    addEventListener("online", function () { mark("online", {}); drain(); });
    addEventListener("offline", function () { mark("offline", {}); });

    // Every app request with status and duration; failures count as errors.
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || String(input);
      var method = (init && init.method) || (input && input.method) || "GET";
      var t0 = performance.now();
      return origFetch(input, init).then(function (r) {
        if (r.status >= 400) errs++;
        mark("fetch", { method: method, url: url.slice(0, 300), status: r.status, ms: Math.round(performance.now() - t0) });
        return r;
      }, function (err) {
        // The app cancels superseded requests on purpose (AbortController): logged, not an error.
        var aborted = err && err.name === "AbortError";
        if (!aborted) errs++;
        mark("fetch", { method: method, url: url.slice(0, 300), status: 0, aborted: aborted, ms: Math.round(performance.now() - t0), error: String(err).slice(0, 200) });
        throw err;
      });
    };

    setInterval(flush, FLUSH_MS);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
    addEventListener("pagehide", flush);
    drain();
  }

  function mark(tag, payload) { try { rec.addCustomEvent(tag, payload); } catch (e) {} }

  function flush() {
    if (!buf.length) return;
    var events = buf, n = errs;
    buf = []; errs = 0;
    var item = {
      id: sid + ":" + seq, sid: sid, seq: seq++, errors: n, vp: device + " " + innerWidth + "x" + innerHeight,
      from: events[0].timestamp, to: events[events.length - 1].timestamp,
    };
    new Response(new Blob([JSON.stringify(events)]).stream().pipeThrough(new CompressionStream("gzip")))
      .blob()
      .then(function (blob) { item.blob = blob; return tx("readwrite", function (s) { return s.put(item); }); })
      .then(drain)
      .catch(function () {});
  }
})();
