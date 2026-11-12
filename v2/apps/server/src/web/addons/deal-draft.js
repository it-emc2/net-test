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
 *  - Local-first (ADR 025): every change is written to THIS DEVICE first (local-store.js), the
 *    server copy follows. Without a connection the work stays safe on the device, survives a
 *    reload or a closed app, and is transferred on its own when the connection is back — also
 *    for drafts that are no longer open. The start page lists the drafts kept on this device.
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
  var st = { dealId: null, revision: null, lastJson: null, timer: null, saving: false, again: false, conflict: false, offline: false,
    // device copy: which draft/state was written last, and whether the form is still being filled from a saved state
    localKey: null, localJson: null, ltimer: null, lastSnapAt: 0, hydrating: false, unknownBase: false, localFailed: false, sweeping: false, toldOffline: false };
  var L = window.__ocLocal || null;
  var LOCAL_MS = 300, RETRY_MS = 20000, SERVER_WAIT_MS = 6000;

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
  function show(text, warn, shortLabel) {
    mount();
    // the header pill stays short; the full sentence is in the tooltip and, for problems, a notice
    var short = shortLabel || (warn ? "⚠ Nicht gespeichert" : text.replace(/\s*\(noch ohne Deal-Nummer\)/, ""));
    badgeText.textContent = (warn || shortLabel || /^Speichert/.test(short) ? "" : "✓ ") + short;
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

  // ---------- autosave on/off (owner request 2026-11-06): per device, default on ----------
  // Off: nothing is saved by itself; a „Speichern“ button at the bottom (where „Schnellspeichern“
  // was) saves into the SAME deal draft as a new version — never a new copy.
  var AUTO_KEY = "oc.autosave";
  function autoOn() { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch (e) { return true; } }
  var manualBtn = null;
  function refreshManual() {
    if (!manualBtn) return;
    manualBtn.style.display = !autoOn() && active() ? "" : "none";
    manualBtn.disabled = st.saving;
  }
  function checkDirty() {
    if (!active()) return;
    var json; try { json = JSON.stringify(window.buildPayload()); } catch (e) { return; }
    st.dirty = json !== st.lastJson;
    if (st.dirty) show("● Nicht gespeichert – bitte „Speichern“ drücken", false, "● Nicht gespeichert");
    refreshManual();
  }
  function setAutosave(on) {
    try { localStorage.setItem(AUTO_KEY, on ? "on" : "off"); } catch (e) { /* private mode: setting only for this page */ }
    if (on) { if (active()) save(); } else checkDirty();
    refreshManual();
  }

  // ---------- device copy (written first, always — also with autosave switched off) ----------
  function customer(p) { var k = (p && p.Kundendaten) || {}; return [k.firstName, k.lastName].filter(Boolean).join(" ").trim(); }
  function writeLocal(snapshot) {
    if (!L || st.hydrating || !active()) return Promise.resolve();
    if (!dealNumber() && !tempKey()) setTempKey(newTempKey());
    var payload; try { payload = window.buildPayload(); } catch (e) { return Promise.resolve(); }
    var json = JSON.stringify(payload), id = dealId(), temp = tempKey(), prev = st.localKey, now = Date.now();
    if (prev === id && json === st.localJson) return Promise.resolve();
    var snap = !!snapshot || prev !== id || now - st.lastSnapAt > 60000;
    var known = st.dealId === id;
    var rec = {
      key: id, offerType: offerType(), payload: payload, localAt: now,
      dirty: !(known && json === st.lastJson), baseRevision: known ? st.revision : null,
      adoptFrom: dealNumber() && temp ? temp : "", conflict: st.conflict, title: customer(payload),
      step: (location.hash || "").replace("#", ""),
    };
    st.localKey = id; st.localJson = json; if (snap) st.lastSnapAt = now;
    return L.get(id).then(function (old) {
      if (old && !known) { rec.baseRevision = old.baseRevision; rec.conflict = !!old.conflict; } // keep what is known about the server copy
      rec.syncedRevision = old ? old.syncedRevision : null; rec.syncedAt = old ? old.syncedAt : null;
      if (old && old.sentMark) rec.sentMark = old.sentMark;
      // this form was not filled from the state already kept for this key (a new offer under an
      // existing number): keep that state in the device history before it is replaced
      if (old && prev !== id && st.loadedKey !== id) return L.put(old, true).then(function () { return L.put(rec, true); });
      return L.put(rec, snap);
    }).then(function () {
      // the form moved to another key (deal number entered or corrected): a state that never
      // reached the server under the old key must not stay behind as a second draft
      if (!prev || prev === id) return;
      var joined = TEMP_RE.test(prev) && DEAL_RE.test(id); // the temporary draft became this deal's draft
      return L.get(prev).then(function (o) { if (o && (joined || o.syncedRevision == null)) return L.remove(prev); });
    }).then(function () { st.localFailed = false; }, function () { st.localFailed = true; });
  }
  function onDevice() { return !!L && !st.localFailed; }
  // Fingerprint of a state sent to the server. If the answer to a save is lost (connection drops
  // at that moment), the draft found on the server later is recognised as our own.
  function mark(json) { var x = 5381; for (var i = 0; i < json.length; i++) x = ((x << 5) + x + json.charCodeAt(i)) | 0; return json.length + ":" + x; }
  function isOurs(serverDraft, rec) {
    try { return !!(serverDraft && rec && rec.sentMark && mark(JSON.stringify(serverDraft.payload)) === rec.sentMark); } catch (e) { return false; }
  }
  function put(id, type, payload, json, base) {
    var noted = L ? L.patch(id, { sentMark: mark(json) }).catch(function () {}) : Promise.resolve();
    return noted.then(function () { return api("PUT", draftUrl(id), { offerType: type, payload: payload, baseRevision: base }); });
  }
  function showOnDevice() {
    show("Auf diesem Gerät gespeichert. Wird übertragen, sobald das Internet wieder da ist.", false, "✓ Auf Gerät gespeichert");
    if (!st.toldOffline && window.ocNotify) window.ocNotify("Keine Verbindung: Ihre Eingaben sind auf diesem Gerät gespeichert und werden übertragen, sobald das Internet wieder da ist.");
    st.toldOffline = true;
  }
  function markSynced(id, json, revision) {
    if (!L) return;
    var fields = { baseRevision: revision, syncedRevision: revision, syncedAt: Date.now(), conflict: false, adoptFrom: "" };
    if (st.localKey === id && st.localJson === json) fields.dirty = false; // nothing was typed since
    L.patch(id, fields).catch(function () {});
  }

  // ---------- autosave ----------
  function schedule() {
    clearTimeout(st.ltimer);
    st.ltimer = setTimeout(writeLocal, LOCAL_MS);
    clearTimeout(st.timer);
    st.timer = autoOn() ? setTimeout(save, DEBOUNCE_MS) : setTimeout(checkDirty, 600);
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
        if (L) L.patch(deal, { adoptFrom: "" }).catch(function () {});
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
    function conflicted() {
      st.conflict = true; st.revision = null;
      if (L) L.patch(id, { conflict: true }).catch(function () {});
      show("Dieser Auftrag wurde inzwischen an anderer Stelle geändert. Ihr Stand ist auf diesem Gerät gespeichert – bitte unter „Versionen“ entscheiden.", true);
    }
    return writeLocal().then(adoptIfNeeded).then(function () {
      id = dealId();
      if (st.conflict || (st.dealId === id && json === st.lastJson)) return;
      show("Speichert …");
      return loadRevision(id)
      .then(function () {
        // a state restored from this device whose server version is unknown must not silently
        // replace a draft that exists on the server
        if (st.unknownBase && st.revision > 0) {
          return Promise.all([api("GET", draftUrl(id)), L ? L.get(id) : null]).then(function (x) {
            if (x[0].status !== 200 || !isOurs(x[0].body, x[1])) return { status: 409, body: {} };
            st.revision = x[0].body.revision; // our own earlier save whose answer never arrived
            return put(id, type, payload, json, st.revision);
          });
        }
        return put(id, type, payload, json, st.revision);
      })
      .then(function (r) {
        st.offline = false; st.toldOffline = false;
        if (r.status === 200) {
          st.revision = r.body.revision; st.lastJson = json; st.dirty = false; st.unknownBase = false;
          markSynced(id, json, r.body.revision);
          show((TEMP_RE.test(id) ? "Vorläufig gespeichert (noch ohne Deal-Nummer) · " : "Automatisch gespeichert · ") + hhmm(Date.now()));
        } else if (r.status === 409) {
          conflicted();
        } else if (onDevice()) {
          st.offline = true; // the server is there but cannot save right now: same promise as offline
          showOnDevice();
        } else {
          show("Speichern hat nicht geklappt – es wird gleich noch einmal versucht.", true);
          schedule();
        }
      });
    })
      .catch(function () {
        st.offline = true;
        if (onDevice()) showOnDevice();
        else show("Keine Verbindung – wird gespeichert, sobald das Internet wieder da ist.", true);
      })
      .then(function () {
        st.saving = false;
        refreshManual();
        if (st.again) { st.again = false; schedule(); }
      });
  }

  function restoreInto(d) {
    if (typeof window.restoreConfiguratorFromOffer !== "function") return Promise.resolve();
    return Promise.resolve(window.restoreConfiguratorFromOffer({ offerType: d.offerType, payload: d.payload })).then(function () {
      st.dealId = d.dealId; st.revision = d.revision; st.conflict = false; st.unknownBase = false;
      try { st.lastJson = JSON.stringify(window.buildPayload()); } catch (e) { st.lastJson = null; }
      st.localKey = d.dealId; st.localJson = st.lastJson; st.loadedKey = d.dealId;
      if (L) L.patch(d.dealId, { dirty: false, conflict: false, baseRevision: d.revision, syncedRevision: d.revision }).catch(function () {});
      show("Stand vom " + when(d.updatedAt || Date.now()) + " geladen");
    });
  }
  // the state kept on this device (newer than the server, or the server cannot be reached)
  function restoreLocal(rec) {
    if (typeof window.restoreConfiguratorFromOffer !== "function") return Promise.resolve();
    return Promise.resolve(window.restoreConfiguratorFromOffer({ offerType: rec.offerType, payload: rec.payload })).then(function () {
      if (TEMP_RE.test(rec.key) && tempKey() !== rec.key) setTempKey(rec.key);
      var now; try { now = JSON.stringify(window.buildPayload()); } catch (e) { now = null; }
      st.localKey = rec.key; st.localJson = now; st.conflict = !!rec.conflict; st.loadedKey = rec.key;
      if (rec.dirty) {
        st.lastJson = null;
        if (rec.baseRevision == null) { st.dealId = null; st.revision = null; st.unknownBase = true; }
        else { st.dealId = rec.key; st.revision = rec.baseRevision; st.unknownBase = false; }
      } else { st.dealId = rec.key; st.revision = rec.baseRevision; st.lastJson = now; st.unknownBase = false; }
      show("Stand von diesem Gerät geladen (" + when(rec.localAt) + ")" + (rec.dirty ? " – wird noch übertragen" : ""), false, "✓ Vom Gerät geladen");
    });
  }
  function serverDraft(id) {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, SERVER_WAIT_MS); });
    return Promise.race([api("GET", draftUrl(id)).catch(function () { return null; }), timeout]);
  }
  // fill the form for this draft: the device state wins while it is not on the server yet
  function hydrate(id) {
    st.hydrating = true;
    return Promise.all([L ? L.get(id).catch(function () { return null; }) : null, serverDraft(id)]).then(function (r) {
      var loc = r[0], srv = r[1] && r[1].status === 200 ? r[1].body : null;
      if (loc && (loc.dirty || !srv)) return restoreLocal(loc).then(function () { return loc.dirty; });
      if (srv) return restoreInto(srv).then(function () { return false; });
      return false;
    }).then(function (pending) {
      st.hydrating = false;
      if (pending && autoOn() && !st.conflict) save();
      setTimeout(function () { if (active()) schedule(); }, 1200); // anything typed while the form was being filled
    }, function () { st.hydrating = false; });
  }

  // ---------- drafts that are not open: transfer what is still only on this device ----------
  function pushOne(rec) {
    var chain = Promise.resolve(rec.baseRevision);
    if (rec.adoptFrom && DEAL_RE.test(rec.key)) {
      chain = api("POST", draftUrl(rec.key, "/adopt"), { from: rec.adoptFrom }).then(function (a) {
        if (a.status === 200) return a.body.revision;
        if (a.status === 409) return "conflict";
        if (a.status === 404) return rec.baseRevision;
        throw new Error("adopt " + a.status);
      });
    }
    return chain.then(function (base) {
      if (base === "conflict" || base != null) return base;
      return api("GET", draftUrl(rec.key)).then(function (g) { // server version unknown
        if (g.status === 404) return 0;
        if (g.status === 200) return isOurs(g.body, rec) ? g.body.revision : "conflict";
        throw new Error("get " + g.status);
      });
    }).then(function (base) {
      if (base === "conflict") return L.patch(rec.key, { conflict: true });
      return put(rec.key, rec.offerType, rec.payload, JSON.stringify(rec.payload), base).then(function (r) {
        if (r.status === 409) return L.patch(rec.key, { conflict: true });
        if (r.status !== 200) throw new Error("put " + r.status);
        return L.get(rec.key).then(function (now) {
          var fields = { baseRevision: r.body.revision, syncedRevision: r.body.revision, syncedAt: Date.now(), adoptFrom: "" };
          if (now && now.localAt === rec.localAt) fields.dirty = false; // unchanged meanwhile
          return L.patch(rec.key, fields);
        });
      });
    });
  }
  function syncPending() {
    if (!L || st.sweeping) return Promise.resolve();
    st.sweeping = true;
    return L.all().then(function (list) {
      // the draft in the open form is saved by save() — never by both at once
      var open = atHome() ? "" : dealId();
      return list.filter(function (r) { return r.dirty && !r.conflict && r.key !== open && r.key !== st.localKey; })
        .reduce(function (p, r) { return p.then(function () { return pushOne(r); }); }, Promise.resolve());
    }).catch(function () { /* no connection or not signed in: next round */ })
      .then(function () { st.sweeping = false; renderDeviceList(); });
  }

  // ---------- start page: drafts kept on this device ----------
  var TYPE_DE = { bu: "Badumbau", bwt: "Badewannentür", hl: "Handlauf", bl: "Badelift", ah: "Alltagshilfe" };
  function openDeviceDraft(rec) {
    if (TEMP_RE.test(rec.key)) setTempKey(rec.key);
    hydrate(rec.key);
  }
  function removeDeviceDraft(rec) {
    var go = function (yes) { if (yes) L.remove(rec.key).then(renderDeviceList, renderDeviceList); };
    if (!rec.dirty) return go(true);
    var q = { title: "Entwurf vom Gerät löschen?", message: "Dieser Entwurf wurde noch nicht übertragen. Wenn Sie ihn löschen, ist er endgültig weg.", confirmLabel: "Löschen" };
    if (typeof window.appConfirm === "function") window.appConfirm(q).then(go); else go(window.confirm(q.title + "\n\n" + q.message));
  }
  function renderDeviceList() {
    var home = document.getElementById("page-home");
    if (!L || !home) return;
    L.all().then(function (list) {
      var box = document.getElementById("ocDeviceDrafts");
      var pending = list.filter(function (r) { return r.dirty || r.conflict; });
      var shown = pending.concat(list.filter(function (r) { return !r.dirty && !r.conflict; }).slice(0, 3)).slice(0, 8);
      if (!shown.length) { if (box) box.remove(); return; }
      if (!box) {
        box = h("section", { id: "ocDeviceDrafts", "aria-label": "Auf diesem Gerät gespeichert",
          style: "margin:14px 0;padding:12px 14px;border:1px solid var(--border,#ddd);border-radius:12px;font-size:16px" });
        var anchor = home.querySelector(".home-load-panel");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling); else home.appendChild(box);
      }
      box.textContent = "";
      box.appendChild(h("h3", { style: "margin:0 0 4px;font-size:17px", text: "Auf diesem Gerät gespeichert" }));
      box.appendChild(h("p", { style: "margin:0 0 10px;font-size:14px;color:var(--muted,#64748b)",
        text: pending.length ? pending.length + (pending.length === 1 ? " Entwurf wartet" : " Entwürfe warten") + " noch auf die Übertragung. Das geschieht von selbst, sobald das Internet da ist."
          : "Zuletzt bearbeitet. Lässt sich auch ohne Internet öffnen." }));
      shown.forEach(function (r) {
        var state = r.conflict ? "⚠ an anderer Stelle geändert" : r.dirty ? "● wartet auf Internet" : "✓ übertragen";
        var label = (TYPE_DE[r.offerType] || r.offerType) + " · " + (r.title || "ohne Namen") + " · " +
          (TEMP_RE.test(r.key) ? "ohne Deal-Nummer" : "Deal " + r.key) + " · " + when(r.localAt);
        box.appendChild(h("div", { "data-oc-device": r.key, style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border,#eee)" }, [
          h("span", { style: "flex:1 1 240px", text: label }),
          h("span", { style: "font-size:14px;font-weight:600;color:" + (r.conflict ? "#a5261c" : r.dirty ? "#7a5200" : "#1e8449"), text: state }),
          h("button", { type: "button", style: BTN, text: "Öffnen", onclick: function () { openDeviceDraft(r); } }),
          h("button", { type: "button", class: "secondary", style: BTN, title: "Vom Gerät löschen", "aria-label": "Vom Gerät löschen: " + label, text: "✕", onclick: function () { removeDeviceDraft(r); } }),
        ]));
      });
    }).catch(function () {});
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

    var none = function () { return null; };
    Promise.all([api("GET", draftUrl(id, "/revisions")).catch(none), api("GET", draftUrl(id)).catch(none), L ? L.history(id).catch(function () { return []; }) : []]).then(function (rs) {
      var reachable = !!rs[0];
      var revs = (rs[0] && rs[0].body && rs[0].body.revisions) || [];
      var current = rs[1] && rs[1].status === 200 ? rs[1].body : null;
      var device = rs[2] || [];
      list.textContent = "";
      if (st.conflict) {
        list.appendChild(h("button", { type: "button", "data-oc-keep-mine": "", style: BTN + "background:#fef3c7;border:1px solid #d97706;text-align:left",
          text: "Meinen Stand von diesem Gerät als neue Version speichern",
          onclick: function () {
            closeVersions();
            st.conflict = false; st.unknownBase = false; st.dealId = null; st.revision = null; st.lastJson = null;
            if (L) L.patch(id, { conflict: false }).catch(function () {});
            save();
          } }));
      }
      var deviceRows = function () {
        if (!device.length) return;
        list.appendChild(h("div", { style: "margin-top:8px;font-weight:600", text: "Auf diesem Gerät (letzte Stände)" }));
        device.forEach(function (d) {
          list.appendChild(h("div", { "data-oc-device-version": "", style: "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px 10px" }, [
            h("span", { text: when(d.at) + (d.step ? " · Schritt " + d.step : "") }),
            h("button", { type: "button", style: BTN, text: "Wiederherstellen", onclick: function () {
              closeVersions();
              Promise.resolve(window.restoreConfiguratorFromOffer({ offerType: d.offerType, payload: d.payload })).then(function () { st.localJson = null; schedule(); });
            } }),
          ]));
        });
      };
      if (!reachable) {
        list.appendChild(h("div", { text: "Keine Verbindung – die Versionen auf dem Server sind gerade nicht erreichbar." }));
        deviceRows();
        return;
      }
      if (st.conflict && current) {
        list.appendChild(h("button", { type: "button", style: BTN + "background:#fef3c7;border:1px solid #d97706;text-align:left",
          text: "Neuesten Stand laden (Version " + current.revision + ", " + when(current.updatedAt) + ")",
          onclick: function () { closeVersions(); restoreInto(current); } }));
      }
      if (!revs.length) { list.appendChild(h("div", { text: "Noch keine gespeicherte Version." })); deviceRows(); return; }
      revs.forEach(function (r) {
        var changed = (r.sections || []).map(function (s) { return SECTION_DE[s] || s; }).join(", ");
        var label = "Version " + r.revision + " · " + when(r.at) + " · " + initials(r.by) + (r.note ? " · " + r.note : changed ? " · Geändert: " + changed : "");
        var row = h("div", { style: "display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--border,#ddd);border-radius:8px;padding:8px 10px" }, [
          h("span", { text: label + (current && r.revision === current.revision ? " (aktuell)" : "") }),
          current && r.revision === current.revision ? null : h("button", { type: "button", style: BTN, text: "Wiederherstellen", onclick: function () { restoreVersion(id, r.revision); } }),
        ]);
        list.appendChild(row);
      });
      deviceRows();
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
      if (atHome()) {
        hideBadge(); closeVersions(); if (tempKey()) setTempKey("");
        st.dealId = null; st.revision = null; st.lastJson = null; st.conflict = false; st.localKey = null; st.localJson = null; st.loadedKey = null; st.unknownBase = false; st.offline = false;
        clearTimeout(st.ltimer); clearTimeout(st.timer);
        syncPending(); // what was left only on this device goes to the server in the background
      }
      else if (active() && (dealNumber() || tempKey())) { writeLocal(true); if (autoOn()) save(); } // step change saves; opening a tile alone creates nothing
      refreshManual();
    });
    function retry() { if (st.offline && autoOn() && active()) save(); syncPending(); }
    window.addEventListener("online", retry);
    setInterval(function () { if (navigator.onLine !== false) retry(); }, RETRY_MS);
    // leaving the page or sending the app to the background: the device copy is written at once
    window.addEventListener("pagehide", function () { writeLocal(true); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") writeLocal(true); else retry(); });
    // manual mode: „Speichern“ where „Schnellspeichern“ used to be
    var actions = document.querySelector("#summaryWidget .sw-actions");
    if (actions && !document.getElementById("ocManualSave")) {
      manualBtn = h("button", { type: "button", id: "ocManualSave", class: "sw-save-btn", style: "display:none", text: "💾 Speichern",
        title: "Diesen Stand als neue Version im Entwurf des Deals speichern", onclick: function () {
          checkDirty();
          if (!st.dirty && st.lastJson) { show("Keine Änderungen seit dem letzten Speichern", false, "✓ Gespeichert"); return; }
          save();
        } });
      actions.insertBefore(manualBtn, actions.firstChild);
    }
    // manual mode: do not lose unsaved work by closing the tab
    window.addEventListener("beforeunload", function (e) { if (!autoOn() && st.dirty) { e.preventDefault(); e.returnValue = ""; } });
    var modal = document.getElementById("dealActionModal");
    if (modal) new MutationObserver(enhanceDealDialog).observe(modal, { attributes: true, attributeFilter: ["hidden"] });

    // reload mid-wizard: today the form comes back empty → fill it from the deal draft
    // Until that is decided nothing is written to the device: an empty form must never replace
    // a saved state.
    st.hydrating = !atHome() && !!(dealNumber() || tempKey());
    setTimeout(function () {
      var q = dealNumber() || tempKey();
      var after = function () { if (L) L.purge().catch(function () {}); syncPending(); };
      // (the Auftrag-ID field may already be filled again from the address — that is not a filled form)
      if (atHome() || !q) { st.hydrating = false; after(); return; }
      hydrate(q).then(after, after);
    }, 400);
  });

  window.__ocDealDraft = { save: save, state: st, openVersions: openVersions, setAutosave: setAutosave, isAutosave: autoOn, writeLocal: writeLocal, syncPending: syncPending }; // header menu / tests
})();
