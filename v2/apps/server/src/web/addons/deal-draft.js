/* v2 add-on (ADR 007 + 021): one draft per deal, saved automatically, with version history.
 * Uses today's UI functions (window.buildPayload / window.restoreConfiguratorFromOffer) and the
 * v2 API /api/deals/:dealId/draft — legacy files stay untouched.
 *  - Autosave: ~2.5 s after the last change (and on every step change) while an offer is open.
 *    Without a deal number (option A, owner 2026-11-06) it saves under a temporary key kept in
 *    the address (?entwurf=t-…); when the deal number is entered, that state becomes a new
 *    version of the deal's draft ("adopt") and the address switches to ?deal=….
 *  - Badge bottom left: "Automatisch gespeichert · 10:42" / "Speichert …" / offline / conflict.
 *  - Reload: the form comes back from the deal draft (today a reload empties it).
 *  - "Versionen": list of saved versions (when, who, what changed) with "Wiederherstellen".
 *  - Deal dialog ("Bitrix Deal laden"): offers "Automatisch gespeicherten Stand öffnen".
 * Plain German, large touch targets (≥ 44 px), no browser pop-ups. */
(function () {
  "use strict";
  var TYPES = { bu: 1, bwt: 1, hl: 1, bl: 1, ah: 1 };
  var DEAL_RE = /^\d{1,12}$/;
  var TEMP_RE = /^t-[0-9a-f]{24}$/;
  var DEBOUNCE_MS = 2500;
  var SECTION_DE = {
    Kundendaten: "Kundendaten", Arbeitszeit: "Arbeitszeit", duschwanne: "Duschwanne", wandverkleidung: "Wandverkleidung",
    duschabtrennung: "Duschabtrennung", optional: "Optionales", rabatt: "Rabatt", bwt: "Badewannentür", hl: "Handlauf",
    bl: "Badelift", ah: "Alltagshilfe", Zusammenfassung: "Zusammenfassung", Arbeiten: "Arbeiten",
  };
  var st = { dealId: null, revision: null, lastJson: null, timer: null, saving: false, again: false, conflict: false, offline: false };

  // ---------- small UI ----------
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "style") e.style.cssText = props[k]; else if (k === "text") e.textContent = props[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  var BTN = "min-height:44px;padding:8px 14px;font-size:16px;border-radius:8px;cursor:pointer;";
  var badgeText = h("span", { id: "ocAutosaveText", "aria-live": "polite", text: "" });
  var badge = h("div", {
    id: "ocAutosave",
    style: "position:fixed;left:12px;bottom:12px;z-index:9000;display:flex;gap:10px;align-items:center;padding:8px 12px;" +
      "background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#ccc);border-radius:10px;" +
      "box-shadow:0 2px 10px rgba(0,0,0,.12);font-size:16px;max-width:calc(100vw - 24px)",
  }, [badgeText, h("button", { type: "button", id: "ocVersionsBtn", class: "secondary", style: BTN, text: "Versionen", onclick: openVersions })]);

  badge.style.display = "none";
  // lives in the header (header.js creates #ocSaveSlot); bottom-left fallback if there is none
  function mount() {
    var slot = document.getElementById("ocSaveSlot");
    var parent = slot || document.body;
    if (badge.parentNode !== parent) parent.appendChild(badge);
  }
  function hideBadge() { badge.style.display = "none"; }
  var lastWarn = "";
  function show(text, warn) {
    mount();
    // the header pill stays short; the full sentence is in the tooltip and, for problems, a notice
    var short = warn ? "⚠ Nicht gespeichert" : text.replace(/\s*\(noch ohne Deal-Nummer\)/, "");
    badgeText.textContent = (warn || /^Speichert/.test(short) ? "" : "✓ ") + short;
    badgeText.title = text;
    badge.style.borderColor = warn ? "#d97706" : "";
    badge.style.display = "flex";
    if (warn && text !== lastWarn && window.ocNotify) window.ocNotify(text);
    lastWarn = warn ? text : "";
  }
  function hhmm(d) { return new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); }
  function when(d) { return new Date(d).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  function initials(email) { // org rule: initials, not names (t.raithel → TR)
    var local = String(email || "").split("@")[0];
    var parts = local.split(/[._-]+/).filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : local.slice(0, 2).toUpperCase();
  }

  // ---------- state of the wizard ----------
  function atHome() { var s = (location.hash || "").replace("#", ""); return !s || s === "home"; }
  function offerType() { try { return String((window.getCurrentOfferType && window.getCurrentOfferType()) || "").toLowerCase(); } catch (e) { return ""; } }
  function dealNumber() {
    var el = document.getElementById("auftragId");
    var v = el ? String(el.value || "").trim() : "";
    if (DEAL_RE.test(v)) return v;
    var q = new URLSearchParams(location.search).get("deal");
    return q && DEAL_RE.test(q) ? q : "";
  }
  function tempKey() { var t = new URLSearchParams(location.search).get("entwurf"); return t && TEMP_RE.test(t) ? t : ""; }
  function setTempKey(t) {
    var q = new URLSearchParams(location.search);
    if (t) q.set("entwurf", t); else q.delete("entwurf");
    var qs = q.toString();
    history.replaceState(history.state, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  function newTempKey() {
    var b = new Uint8Array(12); crypto.getRandomValues(b);
    return "t-" + Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }
  /** where this offer is saved: the deal, else the temporary draft of this tab */
  function dealId() { return dealNumber() || tempKey(); }
  function busy() { return !!(window.__restoring || window.__RESTORING__ || window.__loadingOffer); }
  function active() { return !atHome() && !!TYPES[offerType()] && !busy() && typeof window.buildPayload === "function"; }

  function api(method, url, body) {
    return fetch(url, {
      method: method, credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }
  function draftUrl(id, rest) { return "/api/deals/" + encodeURIComponent(id) + "/draft" + (rest || ""); }

  function loadRevision(id) {
    if (st.dealId === id && st.revision !== null) return Promise.resolve();
    return api("GET", draftUrl(id)).then(function (r) {
      st.dealId = id; st.lastJson = null;
      st.revision = r.status === 200 ? r.body.revision : 0;
    });
  }

  // ---------- autosave ----------
  function schedule() {
    clearTimeout(st.timer);
    st.timer = setTimeout(save, DEBOUNCE_MS);
  }
  // a draft started without a deal number joins the deal as soon as the number is entered
  function adoptIfNeeded() {
    var deal = dealNumber(), temp = tempKey();
    if (!deal || !temp) return Promise.resolve();
    return api("POST", draftUrl(deal, "/adopt"), { from: temp }).then(function (r) {
      if (r.status === 200 || r.status === 404) { // 404: nothing was saved under the temporary key yet
        setTempKey("");
        st.dealId = deal; st.revision = r.status === 200 ? r.body.revision : null; st.lastJson = null;
        if (r.status === 200) show("Entwurf mit Deal " + deal + " verbunden");
      } else if (r.status === 409) {
        st.conflict = true;
        show("Der Entwurf konnte nicht mit Deal " + deal + " verbunden werden. Bitte unter „Versionen“ prüfen.", true);
      }
    });
  }
  function save() {
    if (!active() || st.conflict) return Promise.resolve();
    if (st.saving) { st.again = true; return Promise.resolve(); }
    if (!dealNumber() && !tempKey()) setTempKey(newTempKey()); // option A: save even without a deal number
    var id, type = offerType(), payload;
    try { payload = window.buildPayload(); } catch (e) { return Promise.resolve(); }
    var json = JSON.stringify(payload);
    st.saving = true;
    return adoptIfNeeded().then(function () {
      id = dealId();
      if (st.conflict || (st.dealId === id && json === st.lastJson)) return;
      show("Speichert …");
      return loadRevision(id)
      .then(function () { return api("PUT", draftUrl(id), { offerType: type, payload: payload, baseRevision: st.revision }); })
      .then(function (r) {
        st.offline = false;
        if (r.status === 200) {
          st.revision = r.body.revision; st.lastJson = json;
          show((TEMP_RE.test(id) ? "Vorläufig gespeichert (noch ohne Deal-Nummer) · " : "Automatisch gespeichert · ") + hhmm(Date.now()));
        } else if (r.status === 409) {
          st.conflict = true; st.revision = null;
          show("Dieser Auftrag wurde inzwischen an anderer Stelle geändert. Bitte unter „Versionen“ den neuesten Stand laden.", true);
        } else {
          show("Speichern hat nicht geklappt – es wird gleich noch einmal versucht.", true);
          schedule();
        }
      });
    })
      .catch(function () {
        st.offline = true;
        show("Keine Verbindung – wird gespeichert, sobald das Internet wieder da ist.", true);
      })
      .then(function () {
        st.saving = false;
        if (st.again) { st.again = false; schedule(); }
      });
  }

  function restoreInto(d) {
    if (typeof window.restoreConfiguratorFromOffer !== "function") return Promise.resolve();
    return Promise.resolve(window.restoreConfiguratorFromOffer({ offerType: d.offerType, payload: d.payload })).then(function () {
      st.dealId = d.dealId; st.revision = d.revision; st.conflict = false;
      try { st.lastJson = JSON.stringify(window.buildPayload()); } catch (e) { st.lastJson = null; }
      show("Stand vom " + when(d.updatedAt || Date.now()) + " geladen");
    });
  }

  // ---------- versions ----------
  var overlay = null;
  function closeVersions() { if (overlay) { overlay.remove(); overlay = null; } }
  function openVersions() {
    var id = dealId();
    if (!id) return;
    closeVersions();
    var list = h("div", { style: "display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto" }, [h("div", { text: "Lädt …" })]);
    var dialog = h("div", {
      role: "dialog", "aria-modal": "true", "aria-label": "Gespeicherte Versionen",
      style: "background:var(--surface,#fff);color:var(--text,#111);border-radius:12px;padding:20px;width:min(640px,calc(100vw - 32px));font-size:16px",
    }, [
      h("h3", { style: "margin:0 0 6px;font-size:20px", text: "Gespeicherte Versionen – " + (TEMP_RE.test(id) ? "vorläufiger Entwurf (noch ohne Deal-Nummer)" : "Auftrag " + id) }),
      h("p", { style: "margin:0 0 12px", text: "Jede Änderung wird automatisch gespeichert. Mit „Wiederherstellen“ holen Sie einen früheren Stand zurück – nichts geht dabei verloren." }),
      list,
      h("div", { style: "display:flex;justify-content:flex-end;margin-top:14px" }, [h("button", { type: "button", class: "secondary", style: BTN, text: "Schließen", onclick: closeVersions })]),
    ]);
    overlay = h("div", { id: "ocVersions", style: "position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center" }, [dialog]);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeVersions(); });
    document.body.appendChild(overlay);

    Promise.all([api("GET", draftUrl(id, "/revisions")), api("GET", draftUrl(id))]).then(function (rs) {
      var revs = (rs[0].body && rs[0].body.revisions) || [];
      var current = rs[1].status === 200 ? rs[1].body : null;
      list.textContent = "";
      if (st.conflict && current) {
        list.appendChild(h("button", { type: "button", style: BTN + "background:#fef3c7;border:1px solid #d97706;text-align:left",
          text: "Neuesten Stand laden (Version " + current.revision + ", " + when(current.updatedAt) + ")",
          onclick: function () { closeVersions(); restoreInto(current); } }));
      }
      if (!revs.length) { list.appendChild(h("div", { text: "Noch keine gespeicherte Version." })); return; }
      revs.forEach(function (r) {
        var changed = (r.sections || []).map(function (s) { return SECTION_DE[s] || s; }).join(", ");
        var label = "Version " + r.revision + " · " + when(r.at) + " · " + initials(r.by) + (r.note ? " · " + r.note : changed ? " · Geändert: " + changed : "");
        var row = h("div", { style: "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px 10px" }, [
          h("span", { text: label + (current && r.revision === current.revision ? " (aktuell)" : "") }),
          current && r.revision === current.revision ? null : h("button", { type: "button", style: BTN, text: "Wiederherstellen", onclick: function () { restoreVersion(id, r.revision); } }),
        ]);
        list.appendChild(row);
      });
    });
  }
  function restoreVersion(id, revision) {
    loadRevision(id)
      .then(function () { return api("POST", draftUrl(id, "/restore"), { revision: revision, baseRevision: st.revision }); })
      .then(function (r) {
        if (r.status !== 200) { st.revision = null; show("Wiederherstellen hat nicht geklappt – bitte erneut versuchen.", true); return; }
        return api("GET", draftUrl(id)).then(function (g) { closeVersions(); if (g.status === 200) return restoreInto(g.body); });
      });
  }

  // ---------- deal dialog: offer the autosaved state ----------
  function enhanceDealDialog() {
    var modal = document.getElementById("dealActionModal");
    var wrap = document.getElementById("dealActionExistingWrap");
    var listEl = document.getElementById("dealActionExistingList");
    var deal = window.armedHomeDeal && String(window.armedHomeDeal.dealId || "");
    if (!modal || modal.hidden || !wrap || !listEl || !DEAL_RE.test(deal || "")) return;
    if (listEl.querySelector("[data-oc-autosaved]")) return;
    api("GET", draftUrl(deal)).then(function (r) {
      if (r.status !== 200 || modal.hidden || listEl.querySelector("[data-oc-autosaved]")) return;
      var d = r.body;
      var btn = h("button", {
        type: "button", "data-oc-autosaved": "", class: "primary", style: BTN + "text-align:left;font-weight:600",
        text: "Automatisch gespeicherten Stand öffnen (" + when(d.updatedAt) + ", Version " + d.revision + ")",
        onclick: function () {
          if (typeof window.closeDealActionDialog === "function") window.closeDealActionDialog();
          else { modal.hidden = true; modal.setAttribute("aria-hidden", "true"); }
          window.armedHomeDeal = null;
          restoreInto(d);
        },
      });
      wrap.hidden = false;
      listEl.insertBefore(btn, listEl.firstChild);
    });
  }

  // ---------- wiring ----------
  function onReady(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  onReady(function () {
    mount();
    ["input", "change"].forEach(function (t) { document.addEventListener(t, function () { if (active()) schedule(); }, true); });
    document.addEventListener("click", function (e) { if (e.target && e.target.closest && e.target.closest("button, [role=button], input[type=checkbox], input[type=radio]") && active()) schedule(); }, true);
    window.addEventListener("hashchange", function () {
      if (atHome()) { hideBadge(); closeVersions(); if (tempKey()) setTempKey(""); st.dealId = null; st.revision = null; st.lastJson = null; st.conflict = false; }
      else if (active() && (dealNumber() || tempKey())) save(); // step change saves; opening a tile alone creates nothing
    });
    window.addEventListener("online", function () { if (st.offline) save(); });
    var modal = document.getElementById("dealActionModal");
    if (modal) new MutationObserver(enhanceDealDialog).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

    // reload mid-wizard: today the form comes back empty → fill it from the deal draft
    setTimeout(function () {
      var q = dealNumber() || tempKey();
      var field = document.getElementById("auftragId");
      if (atHome() || !q || (field && String(field.value || "").trim())) return;
      api("GET", draftUrl(q)).then(function (r) { if (r.status === 200) restoreInto(r.body); });
    }, 400);
  });

  window.__ocDealDraft = { save: save, state: st, openVersions: openVersions }; // tests / support
})();
