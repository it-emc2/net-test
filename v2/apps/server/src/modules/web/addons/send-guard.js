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
 * Everything else in today's send flow (dialogs, messages, what happens afterwards) is unchanged.
 *
 * Also here (owner decisions 2026-11-11):
 *  - post: same sendId rules; if the offer was sent before, the user confirms, the server checks
 *    that the open offer is unchanged and posts the exact document sent then (or, on request,
 *    the original although the open offer differs);
 *  - a refused save/send of a changed sent offer (409 OFFER_CHANGED) says: create a new version;
 *  - a failed Bitrix filing after a successful send can be repeated from the stored files;
 *  - hand-edited offers: notice that the mail carries no online-signing link. */
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

  function path(input) { var u = typeof input === "string" ? input : (input && input.url) || ""; return u.replace(location.origin, ""); }
  function method(init) { return String((init && init.method) || "GET").toUpperCase(); }
  function isPost(input, init) { return method(init) === "POST" && /^\/api\/post\/send(\?|$)/.test(path(input)) && init && typeof init.body === "string"; }
  function isOfferSave(input, init) { return method(init) === "POST" && /^\/api\/offers(\?|$)/.test(path(input)); }
  function confirmBox(o) {
    if (typeof window.appConfirm === "function") return window.appConfirm(o);
    return Promise.resolve(window.confirm(o.title + "\n\n" + o.message));
  }
  function when(d) { try { return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  var CHANNEL = { email: "per E-Mail", bitrix: "nur in Bitrix abgelegt", post: "per Post", onsite: "vor Ort" };
  function warn(text) { try { if (window.ocNotify) window.ocNotify(text); else if (window.showToast) window.showToast(text, "error"); } catch (e) { /* notice only */ } }

  // Decision C: a sent offer cannot be changed — every refused save/send says what to do.
  var lastChangedNotice = 0;
  function noticeIfOfferChanged(res) {
    if (!res || res.status !== 409) return res;
    res.clone().json().then(function (j) {
      var code = j && (j.errorCode || (j.error && j.error.code));
      if (code !== "OFFER_CHANGED" || Date.now() - lastChangedNotice < 4000) return;
      lastChangedNotice = Date.now();
      warn("Dieses Angebot wurde bereits versendet und kann nicht mehr geändert werden. Bitte erstellen Sie eine neue Version („Neue Version erstellen“) und senden Sie diese.");
    }).catch(function () {});
    return res;
  }

  // A2: the mail is out but the Bitrix filing failed → offer to repeat it from the stored files.
  function offerBitrixRetry(res, sendId) {
    if (!res || !res.ok) return res;
    try { if (window.__ocOfferRecord) setTimeout(window.__ocOfferRecord.renderHistory, 800); } catch (e) { /* history is optional */ }
    res.clone().json().then(function (j) {
      if (j && j.signingLink === "off-hand-edited") notify("Handbearbeitetes Angebot: Die E-Mail enthält keinen Link zur Online-Unterschrift.");
      var filing = j && (j.bitrixComment || j.bitrix);
      if (!filing || filing.ok !== false) return;
      return confirmBox({
        title: "Ablage in Bitrix hat nicht geklappt",
        message: "Der Versand war erfolgreich, aber die Unterlagen wurden nicht in Bitrix abgelegt. Soll die Ablage jetzt wiederholt werden? Es wird nichts erneut versendet.",
        confirmLabel: "Ablage wiederholen", cancelLabel: "Später",
      }).then(function (yes) {
        if (!yes) return;
        return orig("/api/sends/" + encodeURIComponent(sendId) + "/retry-bitrix", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" })
          .then(function (r) { if (r.ok) notify("Die Unterlagen sind jetzt in Bitrix abgelegt."); else warn("Die Ablage in Bitrix hat wieder nicht geklappt. Bitte versuchen Sie es später noch einmal."); });
      });
    }).catch(function () {});
    return res;
  }

  var confirmedPrior = {};
  // Post: the offer may have been sent before (e-mail first, post a few days later).
  async function postLetter(self, input, init) {
    var body; try { body = JSON.parse(init.body); } catch (e) { return orig.call(self, input, init); }
    var sendId = body.sendId || newId();
    body.sendId = sendId;
    var offerLetter = body.letterKind !== "signed";
    var offerNumber = String((body.meta && body.meta.offerNumber) || body.offerNumber || "").trim();
    if (offerLetter && !body.payload && typeof window.buildPayload === "function") { try { body.payload = window.buildPayload(); } catch (e) { /* server then skips the comparison */ } }
    // today's flow may call again right away (its own "already sent" question) — ask only once
    var asked = confirmedPrior[offerNumber] && Date.now() - confirmedPrior[offerNumber] < 2 * 60 * 1000;
    if (offerLetter && offerNumber && !body.useSentOriginal && !asked) {
      var prior = null;
      try {
        var lr = await orig("/api/offers/" + encodeURIComponent(offerNumber) + "/sends", { credentials: "same-origin", cache: "no-store" });
        var lj = lr.ok ? await lr.json() : null;
        prior = lj && (lj.sends || []).filter(function (x) { return x.status === "done" && x.channel !== "bitrix"; })[0];
      } catch (e) { prior = null; }
      if (prior) {
        var yes = await confirmBox({
          title: "Angebot wurde bereits versendet",
          message: "Angebot " + offerNumber + " wurde am " + when(prior.finishedAt || prior.startedAt) + " " + (CHANNEL[prior.channel] || "") +
            (prior.to ? " an " + prior.to : "") + " versendet" + (prior.ansprechpartner ? " (Ansprechpartner: " + prior.ansprechpartner + ")" : "") +
            ".\n\nJetzt per Post senden? Verschickt wird genau das damals versendete Dokument – vorher wird geprüft, dass das geöffnete Angebot unverändert ist.",
          confirmLabel: "Per Post senden",
        });
        if (!yes) return json(409, { ok: false, error: "Versand abgebrochen.", code: "CANCELLED" });
        confirmedPrior[offerNumber] = Date.now();
      }
    }
    var opts = {}; for (var k in init) if (k !== "signal") opts[k] = init[k];
    var run = function (b) {
      opts.body = JSON.stringify(b);
      return orig.call(self, input, opts).catch(function (err) { return follow(sendId).then(function (res) { if (res) return res; throw err; }); });
    };
    var res = await run(body);
    if (res.status === 409) {
      var j = await res.clone().json().catch(function () { return null; });
      if (j && (j.errorCode || (j.error && j.error.code)) === "OFFER_CHANGED") {
        var original = await confirmBox({
          title: "Das geöffnete Angebot weicht vom versendeten ab",
          message: "Unterschied: " + ((j.differences || []).join(", ") || "Inhalt") + ".\n\nSie können das Original vom " + when(j.sent && j.sent.at) +
            " unverändert per Post senden. Für das geänderte Angebot erstellen Sie bitte eine neue Version.",
          confirmLabel: "Original per Post senden", cancelLabel: "Abbrechen",
        });
        if (original) { body.useSentOriginal = true; delete body.payload; res = await run(body); }
        else noticeIfOfferChanged(res);
      }
    }
    return offerBitrixRetry(res, sendId);
  }

  window.fetch = function (input, init) {
    if (isPost(input, init)) return postLetter(this, input, init);
    if (isOfferSave(input, init)) return orig.apply(this, arguments).then(noticeIfOfferChanged);
    if (!isSend(input, init)) return orig.apply(this, arguments);
    var sendId = init.body.get("sendId");
    if (!sendId) { sendId = newId(); init.body.append("sendId", sendId); }
    var opts = {};
    for (var k in init) if (k !== "signal") opts[k] = init[k]; // no 60 s cut-off
    window.__ocLastSendId = sendId;
    return orig.call(this, input, opts).catch(function (err) {
      return follow(sendId).then(function (res) { if (res) return res; throw err; });
    }).then(noticeIfOfferChanged).then(function (res) { return offerBitrixRetry(res, sendId); });
  };
})();
