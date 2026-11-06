/* v2 add-on (ADR 006 + 021) — loaded by v2 into today's UI, legacy files stay untouched.
 *  1. Deal links: /deal/<id> (Bitrix, bookmarks) arrives here as /?deal=<id> (the server redirects,
 *     because index.html uses relative asset paths). Without a wizard step in the address, the
 *     existing "Bitrix Deal laden" flow runs, exactly as if the deal ID had been typed on the
 *     Hauptmenü (same dialog: new offer or resume a saved one).
 *  2. While working, the address keeps ?deal=<current Auftrag-ID> + #<step>, so reload and
 *     bookmarks return to the same deal and step (the app itself restores the wizard state).
 *  3. Offer types not offered in v2 (HMS, WD — ADR 011 / UX U-001) are hidden on the Hauptmenü. */
(function () {
  "use strict";
  var DEAL_RE = /^[A-Za-z0-9_-]{1,32}$/;
  var HIDDEN_TILES = ["HMS-Hausmeister-Service", "WD-Winterdienst"];

  var style = document.createElement("style");
  style.textContent = HIDDEN_TILES.map(function (t) { return '.tile-btn[data-step="' + t + '"]'; }).join(",") + "{display:none !important}";
  (document.head || document.documentElement).appendChild(style);

  function onReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function step() { return (location.hash || "").replace("#", ""); }
  function atHome() { var s = step(); return !s || s === "home"; }

  var params = new URLSearchParams(location.search);
  var linked = params.get("deal");
  if (linked && !DEAL_RE.test(linked)) linked = null;
  var pendingOpen = !!linked && atHome(); // a fresh deal link (not a reload mid-wizard)

  if (pendingOpen) {
    onReady(function () {
      // after every other DOMContentLoaded handler (incl. the app's "start fresh" home boot)
      setTimeout(function () {
        var input = document.getElementById("homeDealIdInput");
        var btn = document.getElementById("btnLoadDeal");
        if (!input || !btn) return;
        input.value = linked;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        btn.click();
      }, 0);
    });
  }

  function currentDeal() {
    var el = document.getElementById("auftragId");
    var v = el ? String(el.value || "").trim() : "";
    return DEAL_RE.test(v) ? v : "";
  }
  function sync() {
    var q = new URLSearchParams(location.search);
    var want;
    // an empty field (e.g. right after a reload, before the draft is restored) keeps the link
    if (!atHome()) want = currentDeal() || q.get("deal") || null;
    else want = pendingOpen ? linked : null; // keep the link while its dialog is open
    if ((q.get("deal") || null) === want) return;
    if (want) q.set("deal", want); else q.delete("deal");
    var qs = q.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  window.addEventListener("hashchange", function () {
    if (!atHome()) pendingOpen = false;
    sync();
  });
  ["input", "change"].forEach(function (type) {
    document.addEventListener(type, function (e) { if (e.target && e.target.id === "auftragId") sync(); }, true);
  });
  onReady(sync);
  window.__ocDealLink = { sync: sync, currentDeal: currentDeal }; // for tests / debugging
})();
