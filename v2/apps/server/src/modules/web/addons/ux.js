/* v2 add-on — Phase 7 UX changes approved by the owner (ADR 022), on top of today's UI (ADR 021).
 *  P7-1 One „Öffnen“ field: the quick search becomes the single entry; a deal number opens the
 *       deal, „ANG…“ opens the offer, anything else is searched (old fields stay, hidden, so the
 *       app's own flows keep running).
 *  P7-2 Larger and clearer: ≥ 16 px text, ≥ 48 px buttons and fields.
 *  P7-3 Dokumentenstudio: Adobe card gone (ADR 020); developer tools only for admins.
 *  P7-4 Plain notices instead of browser alert pop-ups (confirm questions: see web/rewrites.ts).
 *  P7-5 (option A) „Schnellspeichern“/„Speichern unter“ gone (autosave since 6c); a button
 *       „An Planung übergeben“ moves the deal to „Zuteilen“ under exactly the rule quick save
 *       used: only for a deal on today's planning list that is not done yet. */
(function () {
  "use strict";
  var DEAL_RE = /^\d{1,12}$/;
  var OFFER_RE = /^ANG\d{4}-\d{4}-\d{6}$/i;

  // ---------- P7-2 / P7-3 / P7-5: styles ----------
  var css = [
    // P7-2 — readable text and finger-sized controls (only raises sizes, never shrinks)
    "body{font-size:16px}",
    "button,.btn,.btn-export,.secondary,.primary,.tile-btn{min-height:48px;font-size:max(16px,1em)}",
    "input:not([type=checkbox]):not([type=radio]),select,textarea{min-height:44px;font-size:max(16px,1em)}",
    "label,.muted,.small,small,.status,.hint,.section-subtitle,.home-load-label,.fld-label{font-size:max(15px,1em)}",
    "input[type=checkbox],input[type=radio]{width:22px;height:22px}",
    // P7-3 — Adobe gone, developer tools only for admins
    ".adobe-section{display:none!important}",
    "html:not(.oc-admin) .developer-section,html:not(.oc-admin) #homeDebugWrap{display:none!important}",
    // P7-5 — the two save buttons are replaced by autosave + „An Planung übergeben“
    "#btnSaveDraft,#btnSaveDraftAs{display:none!important}",
    // P7-1 — the two separate load rows give way to the one „Öffnen“ field
    ".home-load-row{display:none!important}",
    "#ocOpenHint{font-size:16px;margin:6px 2px 0;color:var(--muted,#6b7280);min-height:24px}",
    // P7-4 — notices
    "#ocNotices{position:fixed;right:12px;bottom:12px;z-index:9600;display:flex;flex-direction:column;gap:8px;max-width:min(460px,calc(100vw - 24px))}",
    ".oc-notice{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--surface,#fff);color:var(--text,#111);" +
      "border:1px solid var(--border,#ddd);border-left:6px solid #d97706;box-shadow:0 6px 20px rgba(0,0,0,.15);font-size:16px;line-height:1.4}",
    ".oc-notice p{margin:0;flex:1;white-space:pre-line}",
    ".oc-notice button{min-height:44px;min-width:44px;font-size:16px}",
    "#ocHandOver[disabled]{opacity:.7}",
    "#ocHandOver[hidden]{display:none!important}", // .sw-save-btn sets display and would override [hidden]
  ].join("\n");
  var style = document.createElement("style");
  style.id = "ocUxStyles";
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  function onReady(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  // ---------- P7-3: admin flag ----------
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.user && j.user.role === "admin") document.documentElement.classList.add("oc-admin"); })
    .catch(function () {});

  // ---------- P7-4: notices instead of alert() ----------
  // Technical texts (developer wording) go to the console; staff get a plain sentence.
  var TECHNICAL = /Konsole|Payload|nicht verfügbar|implementiert|\(\)|undefined|\bnull\b|HTTP \d{3}|Error:|TypeError|stack/i;
  var PLAIN_FALLBACK = "Das hat leider nicht geklappt. Bitte versuchen Sie es noch einmal. Wenn es wieder passiert, melden Sie sich bitte beim Support.";
  var box = null;
  function notices() {
    if (!box) { box = document.createElement("div"); box.id = "ocNotices"; box.setAttribute("aria-live", "assertive"); document.body.appendChild(box); }
    return box;
  }
  function notify(message) {
    var text = String(message == null ? "" : message);
    if (TECHNICAL.test(text)) { console.warn("[hinweis, technisch]", text); text = PLAIN_FALLBACK; }
    var n = document.createElement("div");
    n.className = "oc-notice"; n.setAttribute("role", "alert");
    var p = document.createElement("p"); p.textContent = text;
    var close = document.createElement("button");
    close.type = "button"; close.className = "secondary"; close.textContent = "OK"; close.setAttribute("aria-label", "Hinweis schließen");
    close.addEventListener("click", function () { n.remove(); });
    n.appendChild(p); n.appendChild(close);
    notices().appendChild(n);
    setTimeout(function () { n.remove(); }, Math.min(20000, 6000 + text.length * 60));
  }
  window.alert = function (message) {
    if (document.body) notify(message); else onReady(function () { notify(message); });
  };
  window.ocNotify = notify;

  onReady(function () {
    // ---------- P7-1: one „Öffnen“ field ----------
    var search = document.getElementById("globalOfferSearchInput");
    var heading = document.getElementById("homeSearchHeading");
    if (search) {
      if (heading) heading.textContent = "Öffnen";
      search.placeholder = "Name, Ort, Telefon, Angebots- oder Deal-Nummer";
      var hint = document.createElement("p");
      hint.id = "ocOpenHint"; hint.setAttribute("aria-live", "polite");
      (search.closest(".home-global-search-wrap") || search.parentNode).insertAdjacentElement("afterend", hint);
      var describe = function () {
        var v = search.value.trim();
        hint.textContent = DEAL_RE.test(v) ? "Eingabetaste öffnet Deal " + v
          : OFFER_RE.test(v) ? "Eingabetaste öffnet Angebot " + v.toUpperCase() : "";
      };
      search.addEventListener("input", describe);
      search.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var v = search.value.trim();
        var target = DEAL_RE.test(v) ? ["homeDealIdInput", "btnLoadDeal"] : OFFER_RE.test(v) ? ["loadOfferNumber", "btnLoadOffer"] : null;
        if (!target) return; // normal search keeps working as today
        var input = document.getElementById(target[0]), btn = document.getElementById(target[1]);
        if (!input || !btn) return;
        e.preventDefault(); e.stopImmediatePropagation();
        input.value = target[0] === "loadOfferNumber" ? v.toUpperCase() : v;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        btn.click();
        // the deal flow reports errors in #homeDealStatus, which sat in the hidden row → show it here
        var status = document.getElementById("homeDealStatus");
        if (status && status.parentNode !== hint.parentNode) hint.insertAdjacentElement("afterend", status);
      }, true);
    }

    // ---------- P7-5 (A): „An Planung übergeben“ ----------
    var actions = document.querySelector("#summaryWidget .sw-actions");
    if (actions && !document.getElementById("ocHandOver")) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.id = "ocHandOver"; btn.className = "sw-save-btn"; btn.hidden = true;
      btn.textContent = "An Planung übergeben";
      btn.title = "Termin hat stattgefunden – Deal in Bitrix nach „Zuteilen“ verschieben";
      actions.appendChild(btn);
      var currentDeal = function () { var el = document.getElementById("auftragId"); var v = el ? String(el.value || "").trim() : ""; return DEAL_RE.test(v) ? v : ""; };
      // same rule as today's quick save (DraftsManager moveDealToZuteilenAfterQuickSave)
      var eligible = function () {
        var id = currentDeal();
        if (!id) return false;
        try { if (window.isDealDone && window.isDealDone(id)) return false; } catch (e) { return false; }
        var list = []; try { list = (window.__debug_getPlanningAppointments && window.__debug_getPlanningAppointments()) || []; } catch (e) { list = []; }
        return list.some(function (x) { return String((x && x.importDealId) || "") === id; });
      };
      var refresh = function () { if (!btn.disabled) btn.hidden = !eligible(); };
      btn.addEventListener("click", function () {
        var id = currentDeal();
        if (!id || !eligible()) { refresh(); return; }
        btn.disabled = true; btn.textContent = "Wird übergeben …";
        fetch("/api/bitrix/deal/" + encodeURIComponent(id) + "/move-zuteilen", {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}",
        }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          try { window.markDealStage && window.markDealStage(id, "C72:PREPARATION"); } catch (e) { /* list refresh is best-effort */ }
          try { window.renderTodayPlanningAppointments && window.renderTodayPlanningAppointments(); } catch (e) { /* idem */ }
          btn.textContent = "An Planung übergeben ✓";
          if (window.showToast) window.showToast("Deal " + id + " ist an die Planung übergeben („Zuteilen“).", "success");
          setTimeout(function () { btn.disabled = false; btn.textContent = "An Planung übergeben"; refresh(); }, 4000);
        }).catch(function () {
          btn.disabled = false; btn.textContent = "An Planung übergeben";
          notify("Die Übergabe an die Planung hat nicht geklappt. Bitte versuchen Sie es gleich noch einmal.");
        });
      });
      ["input", "change"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.target && e.target.id === "auftragId") refresh(); }, true); });
      window.addEventListener("hashchange", refresh);
      setInterval(refresh, 5000); // the planning list loads in the background
      refresh();
    }
  });

  window.__ocUx = { notify: notify }; // tests / support
})();
