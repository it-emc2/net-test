/* v2 add-on — a send can neither be lost nor go out twice (ADR 023), on top of today's UI (ADR 021).
 *
 * Today's send gives up after 60 s while the server carries on: the mail goes out, the app shows
 * an error, nothing is recorded, and a second try sends a second mail (audit 2026-11, send S-01).
 *
 * This add-on wraps the one request POST /api/email/send-offer:
 *  - it adds a `sendId` (the server keeps one record per id and never sends the same id twice);
 *  - it removes the 60 s cut-off (the server finishes or fails on its own);
 *  - if the connection drops while the server is working (weak signal, tab in the background),
 *    it asks GET /api/sends/<id> until the send is finished and hands the app the real answer —
 *    success, or the server's error. Only if the server never saw the request does the app get
 *    its own network error, and then nothing was sent.
 * Everything else in today's send flow (dialogs, messages, what happens afterwards) is unchanged. */
(function () {
  "use strict";
  var orig = window.fetch;
  if (typeof orig !== "function" || typeof FormData === "undefined") return;

  var POLL_MS = 3000;
  var POLL_MAX_MS = 6 * 60 * 1000; // a send with large attachments can take minutes
  var NOT_FOUND_TRIES = 4; // the request may still be on its way to the server

  function isSend(input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || "GET").toUpperCase();
    return method === "POST" && /\/api\/email\/send-offer(\?|$)/.test(url.replace(location.origin, "")) && init && init.body instanceof FormData;
  }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* older Safari */ }
    var s = "";
    for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function json(status, body) {
    return new Response(JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } });
  }
  function notify(text) {
    try { if (window.showToast) window.showToast(text, "info"); else if (window.ocNotify) window.ocNotify(text); } catch (e) { /* notice only */ }
  }

  // Asks the server until the send is finished. Resolves with a Response for the app, or null
  // when the server never received the request (then the app's own error is the truth).
  async function follow(sendId) {
    var started = Date.now(), notFound = 0, told = false;
    while (Date.now() - started < POLL_MAX_MS) {
      await wait(POLL_MS);
      var r;
      try { r = await orig("/api/sends/" + encodeURIComponent(sendId), { credentials: "same-origin", cache: "no-store" }); }
      catch (e) { continue; } // still no connection — keep trying
      if (r.status === 404) { if (++notFound >= NOT_FOUND_TRIES) return null; continue; }
      if (r.status === 401) return null; // session ended: today's login flow takes over
      if (!r.ok) continue;
      var j = await r.json().catch(function () { return null; });
      var send = j && j.send;
      if (!send) continue;
      if (send.status === "done") return json(200, j.result || { ok: true, sendId: sendId });
      if (send.status === "failed") return json(500, { error: "Send failed", detail: send.error || "", sendId: sendId });
      if (!told) { told = true; notify("Die Verbindung war kurz weg – der Versand läuft auf dem Server weiter. Bitte warten Sie."); }
    }
    return json(504, { error: "Der Versand dauert ungewöhnlich lange. Bitte prüfen Sie in Bitrix, ob die E-Mail verschickt wurde, bevor Sie erneut senden.", sendId: sendId });
  }

  window.fetch = function (input, init) {
    if (!isSend(input, init)) return orig.apply(this, arguments);
    var sendId = init.body.get("sendId");
    if (!sendId) { sendId = newId(); init.body.append("sendId", sendId); }
    var opts = {};
    for (var k in init) if (k !== "signal") opts[k] = init[k]; // no 60 s cut-off
    window.__ocLastSendId = sendId;
    return orig.call(this, input, opts).catch(function (err) {
      return follow(sendId).then(function (res) { if (res) return res; throw err; });
    });
  };
})();
