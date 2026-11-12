/* v2 add-on — the offer's record in the app (ADR 023, increment 3), on top of today's UI (ADR 021).
 *
 *  1. Offer number registered with the server: the app still mints the number itself (it must
 *     work offline); as soon as it is online the number is registered. If another unsaved offer
 *     already holds it, the server hands out a new one and the form shows it.
 *  2. On-site signing / signing link: the request carries a sendId, so the hand-over is recorded
 *     and the server itself makes sure the locked offer exists. A changed sent offer is refused
 *     with the „Neue Version“ notice.
 *  3. „Versandverlauf“ on the Angebotsversand page: what really went out, when, how, to whom —
 *     from the server's send records, with the stored document and the Bitrix filing state. */
(function () {
  "use strict";
  var orig = window.fetch;
  if (typeof orig !== "function") return;

  function $(id) { return document.getElementById(id); }
  function onReady(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  function step() { try { return typeof window.getCurrentStep === "function" ? window.getCurrentStep() : ""; } catch (e) { return ""; } }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* older Safari */ }
    var s = ""; for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16); return s;
  }
  function notify(text) { try { if (window.ocNotify) window.ocNotify(text); else if (window.showToast) window.showToast(text, "info"); } catch (e) { /* notice only */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function when(d) { try { return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }

  // ---------- 1. offer number ----------
  var CLAIM_KEY = "oc.numberClaimId";
  var claimId = "";
  try { claimId = localStorage.getItem(CLAIM_KEY) || ""; if (!claimId) { claimId = newId(); localStorage.setItem(CLAIM_KEY, claimId); } } catch (e) { claimId = newId(); }
  var lastClaimed = "", claiming = false;
  function claimNumber() {
    var el = $("offerNumber");
    var v = el ? String(el.value || "").trim() : "";
    if (!v || v === lastClaimed || claiming || step() === "home" || step() === "" || !navigator.onLine) return;
    if (!/^ANG[A-Za-z0-9-]{4,40}$/.test(v)) return;
    claiming = true;
    orig("/api/offer-numbers/claim", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: v, claimId: claimId }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.offerNumber) return;
        // the user may have moved on while the request was under way
        if (String(el.value || "").trim() !== v) return;
        lastClaimed = j.offerNumber;
        if (j.changed) {
          el.value = j.offerNumber;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          notify("Die Angebotsnummer " + v + " war bereits vergeben. Dieses Angebot hat jetzt die Nummer " + j.offerNumber + ".");
        }
      })
      .catch(function () { /* offline — next try */ })
      .then(function () { claiming = false; });
  }

  // ---------- 2. signing hand-over ----------
  var lastChangedNotice = 0;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var isSigningCreate = init && String(init.method || "GET").toUpperCase() === "POST" && typeof init.body === "string" &&
      /^\/api\/signing(\?|$)/.test(url.replace(location.origin, ""));
    if (!isSigningCreate) return orig.apply(this, arguments);
    var opts = {}; for (var k in init) opts[k] = init[k];
    try { var b = JSON.parse(init.body); if (!b.sendId) { b.sendId = newId(); opts.body = JSON.stringify(b); } } catch (e) { /* send as is */ }
    return orig.call(this, input, opts).then(function (res) {
      if (res.status === 409) res.clone().json().then(function (j) {
        var code = j && (j.errorCode || (j.error && j.error.code));
        if (code !== "OFFER_CHANGED" || Date.now() - lastChangedNotice < 4000) return;
        lastChangedNotice = Date.now();
        notify("Dieses Angebot wurde bereits versendet oder unterschrieben und kann nicht mehr geändert werden. Bitte erstellen Sie eine neue Version („Neue Version erstellen“).");
      }).catch(function () {});
      else if (res.ok) setTimeout(renderHistory, 800);
      return res;
    });
  };

  // ---------- 3. Versandverlauf ----------
  var css = [
    "#ocSendHistory{margin:12px 0 18px;padding:14px 16px;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:var(--card,#fff)}",
    "#ocSendHistory[hidden]{display:none!important}",
    "#ocSendHistory h3{margin:0 0 8px;font-size:17px}",
    "#ocSendHistory ul{list-style:none;margin:0;padding:0}",
    "#ocSendHistory li{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 0;border-top:1px solid var(--border,#eef0f3);font-size:15px}",
    "#ocSendHistory li:first-child{border-top:0}",
    "#ocSendHistory .oc-sh-when{font-weight:700;white-space:nowrap}",
    "#ocSendHistory .oc-sh-bad{color:#b45309;font-weight:600}",
    "#ocSendHistory .oc-sh-ok{color:#15803d}",
    "#ocSendHistory a,#ocSendHistory button.oc-sh-link{font:inherit;font-size:15px!important;color:var(--accent,#2563eb);background:none;border:0;padding:0;min-height:32px!important;cursor:pointer;text-decoration:underline}",
    "#ocSendHistory .oc-sh-empty{color:var(--muted,#6b7280);font-size:15px}",
  ].join("\n");
  var st = document.createElement("style"); st.id = "ocOfferRecordStyles"; st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var CHANNEL = { email: "per E-Mail", bitrix: "nur in Bitrix abgelegt", post: "per Post", onsite: "Unterschrift vor Ort", signlink: "Link zur Online-Unterschrift" };
  var ROLE_LABEL = { offer: "Angebot ansehen", letter: "Brief ansehen", signed: "Unterschriebenes Dokument" };
  var shownFor = "", loading = false;

  function historyBox() {
    var box = $("ocSendHistory");
    if (box) return box;
    var page = $("page-Zusammenfassung");
    if (!page) return null;
    box = document.createElement("section");
    box.id = "ocSendHistory"; box.hidden = true; box.setAttribute("aria-live", "polite");
    var anchor = $("ocFinish");
    if (anchor) anchor.insertAdjacentElement("afterend", box);
    else { var t = $("zfPageTitle"); (t && t.parentNode && t.parentNode.parentNode ? t.parentNode : page).insertAdjacentElement(t ? "afterend" : "afterbegin", box); }
    box.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-retry]");
      if (!btn) return;
      btn.disabled = true;
      orig("/api/sends/" + encodeURIComponent(btn.getAttribute("data-retry")) + "/retry-bitrix", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" })
        .then(function (r) { notify(r.ok ? "Die Unterlagen sind jetzt in Bitrix abgelegt." : "Die Ablage in Bitrix hat wieder nicht geklappt. Bitte versuchen Sie es später noch einmal."); })
        .catch(function () { notify("Keine Verbindung. Bitte versuchen Sie es später noch einmal."); })
        .then(function () { shownFor = ""; renderHistory(); });
    });
    return box;
  }

  function row(s) {
    var parts = ['<span class="oc-sh-when">' + esc(when(s.finishedAt || s.startedAt)) + "</span>",
      "<span>" + esc(CHANNEL[s.channel] || s.channel) + (s.to ? " an " + esc(s.to) : "") + "</span>"];
    if (s.status === "running") parts.push('<span class="oc-sh-bad">läuft noch …</span>');
    if (s.status === "failed") parts.push('<span class="oc-sh-bad">nicht versendet' + (s.error ? ": " + esc(s.error) : "") + "</span>");
    if (s.status === "done") {
      if (s.signedAt) parts.push('<span class="oc-sh-ok">✓ unterschrieben am ' + esc(when(s.signedAt)) + "</span>");
      else if (s.signing && (s.channel === "onsite" || s.channel === "signlink")) parts.push("<span>noch nicht unterschrieben</span>");
      var bx = s.steps && s.steps.bitrix;
      if (bx && bx.status === "ok") parts.push('<span class="oc-sh-ok">✓ in Bitrix abgelegt</span>');
      if (bx && bx.status === "failed") parts.push('<span class="oc-sh-bad">Bitrix-Ablage fehlgeschlagen</span><button type="button" class="oc-sh-link" data-retry="' + esc(s.sendId) + '">Ablage wiederholen</button>');
      (s.files || []).forEach(function (f) {
        if (!ROLE_LABEL[f.role]) return;
        parts.push('<a target="_blank" rel="noopener" href="/api/sends/' + encodeURIComponent(s.sendId) + "/files/" + encodeURIComponent(f.fileId) + '">' + esc(ROLE_LABEL[f.role]) + "</a>");
      });
    }
    return "<li>" + parts.join("") + "</li>";
  }

  function renderHistory() {
    if (step() !== "Zusammenfassung") return;
    var box = historyBox();
    var el = $("offerNumber");
    var nr = el ? String(el.value || "").trim() : "";
    if (!box || !nr || loading) return;
    loading = true;
    orig("/api/offers/" + encodeURIComponent(nr) + "/sends", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        var sends = (j.sends || []).filter(function (s) { return s.status !== "failed" || s === j.sends[0]; });
        shownFor = nr;
        box.hidden = false;
        box.innerHTML = "<h3>Versandverlauf</h3>" + (sends.length
          ? "<ul>" + sends.map(row).join("") + "</ul>"
          : '<p class="oc-sh-empty">Dieses Angebot wurde noch nicht versendet.</p>');
        box.setAttribute("data-count", String(sends.filter(function (s) { return s.status === "done"; }).length));
      })
      .catch(function () { /* offline: keep what is shown */ })
      .then(function () { loading = false; });
  }

  onReady(function () {
    window.addEventListener("hashchange", function () { setTimeout(claimNumber, 300); setTimeout(renderHistory, 300); });
    window.addEventListener("online", function () { claimNumber(); renderHistory(); });
    setInterval(function () {
      claimNumber();
      var el = $("offerNumber");
      if (step() === "Zusammenfassung" && el && String(el.value || "").trim() !== shownFor) renderHistory();
    }, 6000);
    setTimeout(function () { claimNumber(); renderHistory(); }, 1500);
  });

  window.__ocOfferRecord = { claimNumber: claimNumber, renderHistory: renderHistory };
})();
