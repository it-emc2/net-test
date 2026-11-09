/* v2 add-on — UX quick wins (spec „OC UX Quick Wins“ v1.0, 2026-11-09, owner SW; UX-CHANGES U-010).
 * On top of today's UI (ADR 021). Rules kept from the rewrite:
 *  - no new state keys, no database change: every tile only operates an existing input
 *    (radio, switch), so drafts, restore, pricing and documents behave exactly as today;
 *  - no business rule changes (defaults, blocking, minimum markup) — those are owner decisions;
 *  - mode „Klassisch“ stays as it is; tiles only in mode „Neu“.
 *
 *  A1  „Was wird umgebaut?“ — Umbauart as picture tiles (same radio duschwanne[umbauart])
 *  A2  Wandverkleidung „Ausführung“ as picture tiles (same radio wvKind)
 *  A4  Text radio groups (Material, Regelmäßigkeit …) as chips, label next to the circle
 *  A5  Icons on the offer-type tiles on the home page
 *  B1  „Was kommt neu ins Bad?“ — one multi-select for the 5 material switches; only the chosen
 *      steps appear in the menu and „Weiter“ skips the others
 *  B2  Duschabtrennung and Duschvorhang exclude each other in B1; both on → yellow hint
 *  C1  Developer/CRM menu groups only for admins; labels without „(neu)“
 *  C2  Angebotsversand: one primary action (sign on the iPad), e-mail/post second, the rest
 *      under „Weitere Optionen“; no red buttons
 *  C5  Home: today's appointments first, then offer types, then „Öffnen“
 *  C6  Markup chips below the minimum marked (still selectable — today's rule, AUFSCHLAG_REASON_ENFORCED=false)
 *  C7  „Kundenmodus“: hides markup, costs, calculation and purchasing CSV while the customer watches
 *  C8  Page title = menu label; category accordions without numbering; typo fixed (label only)
 *  D3  Total shown as „vorläufig“ (grey) until a customer and at least one item exist
 *  D5  Identical price requests are sent once (in flight shared, 1.5 s reuse)
 *  D6  Larger tap targets for pills, rows and chips */
(function () {
  "use strict";

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function onReady(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  function offerType() { try { return String((window.getCurrentOfferType && window.getCurrentOfferType()) || ""); } catch (e) { return ""; } }
  function currentStep() { try { return typeof window.getCurrentStep === "function" ? window.getCurrentStep() : ""; } catch (e) { return ""; } }
  function svg(inner, vb) {
    return '<svg class="oc-tile-img" viewBox="' + (vb || "0 0 64 48") + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  var KM_KEY = "oc.customerMode";
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  // ---------- pictures (simple line drawings, theme colour via currentColor) ----------
  var TUB = '<path d="M6 22h22v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z"/><path d="M10 34l-1 4M24 34l1 4"/>';
  var SHOWER = '<path d="M40 38h18"/><path d="M42 38V14a6 6 0 0 1 12 0"/><path d="M50 18h8"/><path d="M52 22v2M55 22v3M58 22v2"/>';
  var TUB_R = '<path d="M36 22h22v6a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6z"/><path d="M40 34l-1 4M54 34l1 4"/>';
  var SHOWER_L = '<path d="M6 38h18"/><path d="M8 38V14a6 6 0 0 1 12 0"/><path d="M16 18h8"/><path d="M18 22v2M21 22v3M24 22v2"/>';
  var ARROW = '<path d="M28 26h6M31 23l3 3-3 3" stroke-width="2"/>';
  var UMBAU_IMG = {
    wanne_dusche: svg(TUB + ARROW + SHOWER),
    dusche_dusche: svg(SHOWER_L + ARROW + SHOWER),
    wanne_wanne: svg(TUB + ARROW + TUB_R),
    dusche_wanne: svg(SHOWER_L + ARROW + TUB_R),
    ohne_rueckbau: svg('<rect x="14" y="10" width="36" height="28" rx="3"/><path d="M32 17v14M25 24h14"/>'),
  };
  var UMBAU_SUB = { ohne_rueckbau: "nur ergänzen" };

  // Wall sketch: back wall + right wall; the highlighted area = panelling.
  function wall(fill) {
    return svg('<path d="M8 8h32v34H8z"/><path d="M40 8l16-6v34l-16 6"/>' + fill +
      '<path d="M12 38h14v-4H12z" stroke-width="1.4"/>', "0 0 64 48");
  }
  var HL = 'fill="currentColor" fill-opacity=".35" stroke="none"';
  var WV_IMG = {
    "Fehlstellen": wall('<rect x="14" y="14" width="6" height="5" ' + HL + '/><rect x="28" y="24" width="7" height="6" ' + HL + '/><path d="M47 14l4-1.5v5l-4 1.5z" ' + HL + "/>"),
    "Deckenhoch": wall('<path d="M28 8h12v34H28z" ' + HL + '/><path d="M40 8l8-3v34l-8 3z" ' + HL + "/>"),
    "Fliesenspiegel": wall('<path d="M8 20h32v8H8z" ' + HL + '/><path d="M40 20l16-6v8l-16 6z" ' + HL + "/>"),
    "Innenraum-der-Kabine": wall('<path d="M30 8h10v34H30z" ' + HL + '/><path d="M40 8l7-2.6v34L40 42z" ' + HL + '/><path d="M30 42V8" stroke-dasharray="3 3"/>'),
    "alle-Bad-Wände": wall('<path d="M8 8h32v34H8z" ' + HL + '/><path d="M40 8l16-6v34l-16 6z" ' + HL + "/>"),
  };
  var WV_LABEL = {
    "Fehlstellen": "Nur Fehlstellen", "Deckenhoch": "Duschbereich deckenhoch", "Fliesenspiegel": "Fliesenspiegel",
    "Innenraum-der-Kabine": "Kabine innen", "alle-Bad-Wände": "Alle Wände",
  };

  // The five material switches (B1). Page id → switch id. All exist in today's UI.
  var MAT = [
    { step: "Duschwanne", toggle: "dwTrayToggle", label: "Duschwanne",
      img: svg('<path d="M8 30h48v6H8z"/><circle cx="32" cy="33" r="1.6" fill="currentColor"/><path d="M14 30V24M50 30V24" stroke-dasharray="2 3"/>') },
    { step: "Fussboden", toggle: "fbMaster", label: "Boden",
      img: svg('<path d="M4 38l14-20h28l14 20z"/><path d="M18 18l-4 20M32 18v20M46 18l4 20M9 31h46M13 25h38" stroke-width="1.6"/>') },
    { step: "Wandverkleidung", toggle: "wvEnabled", label: "Wandverkleidung",
      img: svg('<path d="M10 6h44v36H10z"/><path d="M21 6v36M32 6v36M43 6v36" stroke-width="1.6"/>') },
    { step: "DuschabtrennungNeu", toggle: "daNeuToggle", label: "Glasabtrennung", group: "screen",
      img: svg('<path d="M14 6h36v36H14z"/><path d="M32 6v36"/><path d="M20 12l6 6M38 12l6 6" stroke-width="1.6"/><path d="M29 24v4" stroke-width="3"/>') },
    { step: "Duschvorhang", toggle: "vorhangToggle", label: "Vorhang", group: "screen",
      img: svg('<path d="M8 8h48"/><path d="M14 8c-4 8 4 14 0 22s4 10 0 12M26 8c-4 8 4 14 0 22s4 10 0 12M38 8c-4 8 4 14 0 22s4 10 0 12"/><circle cx="14" cy="8" r="1.5"/><circle cx="26" cy="8" r="1.5"/><circle cx="38" cy="8" r="1.5"/>') },
  ];
  var MAT_BY_STEP = {}; MAT.forEach(function (m) { MAT_BY_STEP[m.step] = m; });
  // B1 suggestion from the Umbauart (only a marker — nothing is switched on by itself)
  var SUGGEST = { wanne_dusche: ["Duschwanne", "DuschabtrennungNeu"], dusche_dusche: ["Duschwanne", "DuschabtrennungNeu"] };

  function toggleEl(m) { return document.getElementById(m.toggle); }
  function isOn(m) { var t = toggleEl(m); return !!(t && t.checked); }
  function isBu() { return offerType() === "bu"; }
  function customerMode() { return document.documentElement.classList.contains("oc-customer"); }

  // ---------- styles ----------
  var N = "body:not(.ui-classic) ";
  var css = [
    // tiles (ChoiceTile pattern from the glass enclosure wizard)
    ".oc-tiles{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(138px,1fr));gap:12px;margin:6px 0 4px}",
    ".oc-tile{position:relative;display:flex!important;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:118px;padding:12px 8px!important;" +
      "border:2px solid var(--border,#e5e7eb)!important;border-radius:14px!important;background:var(--card,#fff)!important;color:var(--text,#111)!important;cursor:pointer;" +
      "text-align:center;font-weight:600;font-size:16px!important;line-height:1.25;box-shadow:none!important;width:auto!important;margin:0!important;-webkit-tap-highlight-color:transparent}",
    ".oc-tile:hover{background:var(--card-hover,#f8fafc)!important}",
    ".oc-tile.is-on{border-color:var(--accent,#7C3AED)!important;background:color-mix(in srgb,var(--accent,#7C3AED) 9%,var(--card,#fff))!important}",
    ".oc-tile.is-on::after{content:'✓';position:absolute;top:6px;right:8px;width:24px;height:24px;border-radius:50%;background:var(--accent,#7C3AED);color:#fff;" +
      "font-size:14px;line-height:24px;font-weight:700}",
    ".oc-tile:focus-within,.oc-tile:focus-visible{outline:3px solid var(--ring,rgba(124,58,237,.35));outline-offset:2px}",
    ".oc-tile input{position:absolute!important;inset:0;opacity:0;margin:0!important;width:100%!important;height:100%!important;cursor:pointer}",
    ".oc-tile .circle{display:none!important}",
    ".oc-tile .oc-tile-img{width:64px;height:48px;color:var(--accent,#7C3AED);flex:none}",
    ".oc-tile .oc-sub{display:block;font-weight:400;font-size:14px;color:var(--muted,#6b7280)}",
    ".oc-tile .oc-badge{position:absolute;top:6px;left:8px;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e}",
    ".oc-q{font-size:18px!important;font-weight:700!important;margin:0 0 2px!important;display:block;color:var(--text,#111)!important}",
    ".oc-q-hint{font-size:14px;color:var(--muted,#6b7280);margin:0 0 6px}",
    ".oc-warn{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fef3c7;color:#78350f;border:1px solid #f59e0b;font-size:15px}",
    ".oc-warn[hidden]{display:none!important}",
    "#ocMaterialPick{margin:6px 0 18px}",
    // Umbauart / Wandverkleidung — the old pill look gives way to the tiles (mode Neu only)
    N + "#wvKindGroup .oc-tiles{margin-bottom:10px}",
    "body.ui-classic #ocMaterialPick{display:block}",
    // A4 — text radio groups become chips, label next to the circle
    N + ".radio-group.vertical{display:flex!important;flex-wrap:wrap;gap:10px}",
    N + ".radio-group.vertical>.radio-pill{flex:0 1 auto;width:auto!important;justify-content:flex-start!important;text-align:left;gap:10px;padding:10px 16px!important}",
    N + ".radio-group.vertical>.radio-pill>span:last-child{margin-left:0!important;text-align:left!important}",
    // A5 — icons on the offer-type tiles
    "#page-home .tile-btn:has(.oc-tile-ico){display:flex!important;align-items:center;justify-content:flex-start;gap:14px}",
    "#page-home .tile-btn .oc-tile-ico{font-size:24px;width:30px;text-align:center;flex:none;margin:0;color:var(--accent,#7C3AED)}",
    // C1 — developer/CRM groups only for admins
    "html:not(.oc-admin) #sideMenu .accordion-group{display:none!important}",
    "#sideMenu .oc-pick-link span{font-style:italic;color:var(--muted,#6b7280)}",
    // C2 — dispatch
    "#ocFinish{margin:12px 0 18px;padding:16px;border:1px solid var(--border,#e5e7eb);border-radius:14px;background:var(--card,#fff)}",
    "#ocFinish h3{margin:0 0 4px;font-size:18px}",
    "#ocFinish .oc-finish-check{margin:6px 0 12px;font-size:15px}",
    "#ocFinish .oc-finish-check a{font-weight:600}",
    "#ocFinish .oc-finish-actions{display:flex;flex-wrap:wrap;gap:10px}",
    "#ocFinish .oc-primary{background:#15803d!important;border-color:#15803d!important;color:#fff!important;font-weight:700;padding:10px 20px;border-radius:12px;font-size:17px!important}",
    "#ocFinish .oc-secondary{background:var(--card,#fff)!important;color:var(--text,#111)!important;border:1px solid var(--border,#cbd5e1)!important;padding:10px 18px;border-radius:12px;font-weight:600}",
    "details.oc-more{margin:16px 0;border:1px solid var(--border,#e5e7eb);border-radius:14px;padding:0 14px;background:var(--card,#fff)}",
    "details.oc-more>summary{cursor:pointer;min-height:52px;display:flex;align-items:center;font-weight:700;font-size:16px;list-style:none}",
    "details.oc-more>summary::-webkit-details-marker{display:none}",
    "details.oc-more>summary::before{content:'▸';display:inline-block;margin-right:10px;transition:transform .15s}",
    "details.oc-more[open]>summary::before{transform:rotate(90deg)}",
    "details.oc-more>summary small{font-weight:400;color:var(--muted,#6b7280);margin-left:8px}",
    // no red except destructive: send and download buttons in one calm style
    "#page-Zusammenfassung #sendOfferMail,#page-Zusammenfassung #sendOfferPost{background:var(--accent,#2563eb)!important;border-color:var(--accent,#2563eb)!important;color:#fff!important}",
    "#page-Zusammenfassung .oc-more .btn-export:not(.document-card__preview),#page-Zusammenfassung #signOnSiteBtn,#page-Zusammenfassung #signOnSiteBtnPost,#page-Zusammenfassung #sendOfferBitrix{" +
      "background:var(--card,#fff)!important;color:var(--text,#111)!important;border:1px solid var(--border,#cbd5e1)!important;box-shadow:none!important}",
    // C6 — markup chips below the minimum
    ".aufschlag-chip.is-low{opacity:.55;border-style:dashed!important}",
    // C7 — customer mode
    "#ocCustomerBtn{display:inline-flex;align-items:center;gap:8px;min-height:40px!important;padding:4px 14px;border-radius:999px;border:1px solid var(--border,#e5e7eb);" +
      "background:var(--card,#fff);color:var(--text,#111);font:inherit;font-size:15px!important;font-weight:600;cursor:pointer;white-space:nowrap}",
    "#ocCustomerBtn[hidden]{display:none!important}",
    "#ocCustomerBtn[aria-pressed=true]{background:#0f766e;border-color:#0f766e;color:#fff}",
    "html.oc-customer #aufschlagSection,html.oc-customer #sideMenu a.side-link[data-step=Kosten],html.oc-customer #page-Kosten>*:not(.oc-km-note)," +
      "html.oc-customer .oc-internal,html.oc-customer .developer-section,html.oc-customer #aufschlagMinLabel," +
      // Rabatt overview: the pre-markup breakdown + markup line would reveal the markup → only Netto/MwSt/Gesamt
      "html.oc-customer #rb-arbeit-label,html.oc-customer #rb-arbeit,html.oc-customer #rb-material-label,html.oc-customer #rb-material," +
      "html.oc-customer #rb-opt-row,html.oc-customer #rb-auf-row{display:none!important}",
    ".oc-km-note{display:none}",
    "html.oc-customer #page-Kosten>.oc-km-note{display:block;padding:12px 0;font-size:16px}",
    "@media (max-width:960px){#ocCustomerBtn .oc-cm-text{display:none}#ocCustomerBtn{padding:4px 12px}}",
    // D3 — provisional total
    "#summaryWidget.oc-provisional #swTotalValue,#summaryWidget.oc-provisional #swSelfPayValue{opacity:.45}",
    "#ocProvisional{display:none;font-size:13px;font-weight:700;color:var(--muted,#6b7280);margin-left:6px;text-transform:uppercase;letter-spacing:.04em}",
    "#summaryWidget.oc-provisional #ocProvisional{display:inline}",
    // D6 — tap targets
    ".radio-pill,.ios-check-row,.aufschlag-chip,.kc-view-chip{min-height:48px}",
    ".aufschlag-chip{min-width:56px}",
  ].join("\n");
  var style = document.createElement("style");
  style.id = "ocQuickWinsStyles";
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  if (ssGet(KM_KEY) === "1") document.documentElement.classList.add("oc-customer");

  // ---------- D5: identical price requests only once ----------
  (function dedupePriceRequests() {
    var orig = window.fetch;
    if (typeof orig !== "function") return;
    var inflight = {}; // body → Promise<Response>
    var recent = null; // { body, at, res }
    var REUSE_MS = 1500;
    function isPrice(input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      return method === "POST" && /\/api\/price(\?|$)/.test(url.replace(location.origin, "")) && init && typeof init.body === "string";
    }
    window.fetch = function (input, init) {
      if (!isPrice(input, init)) return orig.apply(this, arguments);
      var body = init.body;
      if (recent && recent.body === body && Date.now() - recent.at < REUSE_MS) return Promise.resolve(recent.res.clone());
      if (inflight[body]) return inflight[body].then(function (r) { return r.clone(); });
      var p = orig.apply(this, arguments).then(function (r) {
        if (r.ok) recent = { body: body, at: Date.now(), res: r.clone() };
        return r;
      });
      inflight[body] = p;
      var clear = function () { delete inflight[body]; };
      p.then(clear, clear);
      return p.then(function (r) { return r.clone(); });
    };
    window.__ocPriceDedupe = { stats: function () { return { inflight: Object.keys(inflight).length, recentAt: recent && recent.at }; } };
  })();

  onReady(function () {
    // ---------- A1: Umbauart as tiles ----------
    var umbauGroup = $('#page-Arbeiten .radio-group[aria-label="Umbauart"]');
    var umbauField = umbauGroup && umbauGroup.closest(".field");
    if (umbauGroup) {
      umbauGroup.classList.add("oc-tiles");
      var lbl = umbauField && umbauField.querySelector(":scope > label");
      if (lbl) { lbl.textContent = "Was wird umgebaut?"; lbl.classList.add("oc-q"); }
      if (lbl) { var h = document.createElement("p"); h.className = "oc-q-hint"; h.textContent = "Eine Auswahl · steuert, welche Arbeiten automatisch angehakt werden"; lbl.insertAdjacentElement("afterend", h); }
      $$("label.radio-pill", umbauGroup).forEach(function (l) {
        var input = l.querySelector("input"); if (!input) return;
        l.classList.add("oc-tile");
        if (UMBAU_IMG[input.value]) l.insertAdjacentHTML("afterbegin", UMBAU_IMG[input.value]);
        var text = l.querySelector("span:last-child");
        if (text && UMBAU_SUB[input.value]) { var s = document.createElement("span"); s.className = "oc-sub"; s.textContent = UMBAU_SUB[input.value]; l.appendChild(s); }
        text && (text.className = "oc-tile-label");
      });
    }

    // ---------- B1 / B2: „Was kommt neu ins Bad?“ ----------
    var pick = null, warn = null;
    if (umbauField && MAT.every(function (m) { return toggleEl(m); })) {
      pick = document.createElement("div");
      pick.id = "ocMaterialPick"; pick.className = "field";
      pick.innerHTML = '<span class="oc-q">Was kommt neu ins Bad?</span>' +
        '<p class="oc-q-hint">Mehrfachauswahl · nur Gewähltes erscheint links im Menü und bei „Weiter“</p>';
      var grid = document.createElement("div");
      grid.className = "oc-tiles"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", "Was kommt neu ins Bad?");
      MAT.forEach(function (m) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "oc-tile"; b.dataset.step = m.step;
        b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", "false");
        b.innerHTML = m.img + '<span class="oc-tile-label"></span>';
        b.querySelector(".oc-tile-label").textContent = m.label;
        b.addEventListener("click", function () { setMaterial(m, !isOn(m)); });
        grid.appendChild(b);
      });
      pick.appendChild(grid);
      warn = document.createElement("div");
      warn.className = "oc-warn"; warn.hidden = true; warn.setAttribute("role", "status");
      warn.textContent = "Duschabtrennung und Duschvorhang sind beide aktiv – beides gewollt?";
      pick.appendChild(warn);
      umbauField.insertAdjacentElement("afterend", pick);
    }

    // Operates the page's own switch → its own change handler prices and saves, as today.
    function flip(m, on) {
      var t = toggleEl(m);
      if (!t || t.checked === on) return;
      t.click();
      if (t.checked !== on) { t.checked = on; t.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    function setMaterial(m, on) {
      if (on && m.group) MAT.forEach(function (o) { if (o !== m && o.group === m.group) flip(o, false); }); // B2
      flip(m, on);
      syncAll();
    }

    function syncPick() {
      if (!pick) return;
      var umbau = ($('input[name="duschwanne[umbauart]"]:checked') || {}).value || "";
      var sug = SUGGEST[umbau] || [];
      $$(".oc-tile", pick).forEach(function (b) {
        var m = MAT_BY_STEP[b.dataset.step]; var on = isOn(m);
        b.classList.toggle("is-on", on); b.setAttribute("aria-checked", String(on));
        var badge = b.querySelector(".oc-badge");
        var want = !on && sug.indexOf(m.step) !== -1;
        if (want && !badge) { badge = document.createElement("span"); badge.className = "oc-badge"; badge.textContent = "Vorschlag"; b.appendChild(badge); }
        if (!want && badge) badge.remove();
      });
      if (warn) warn.hidden = !(isOn(MAT_BY_STEP.DuschabtrennungNeu) && isOn(MAT_BY_STEP.Duschvorhang));
    }
    function syncTiles() {
      $$("label.oc-tile").forEach(function (l) { var i = l.querySelector("input"); l.classList.toggle("is-on", !!(i && i.checked)); });
    }

    // ---------- A2: Wandverkleidung „Ausführung“ as tiles ----------
    var wvGroup = document.getElementById("wvKindGroup");
    if (wvGroup) {
      var wvGrid = document.createElement("div");
      wvGrid.className = "oc-tiles"; wvGrid.setAttribute("role", "radiogroup"); wvGrid.setAttribute("aria-label", "Welche Wände werden verkleidet?");
      $$("label.ios-check-row", wvGroup).forEach(function (l) {
        var input = l.querySelector('input[name="wvKind"]');
        if (!input || l.hidden || !WV_IMG[input.value]) return;
        l.classList.add("oc-tile");
        l.insertAdjacentHTML("afterbegin", WV_IMG[input.value]);
        var t = l.querySelector("span:last-child"); if (t) { t.title = t.textContent; t.textContent = WV_LABEL[input.value]; t.className = "oc-tile-label"; }
        wvGrid.appendChild(l);
      });
      if (wvGrid.children.length) wvGroup.insertBefore(wvGrid, wvGroup.firstChild);
      var wvLabel = wvGroup.parentNode && wvGroup.parentNode.querySelector(".sec-settings__label");
      if (wvLabel) wvLabel.textContent = "Ausführung – welche Wände werden verkleidet?";
    }

    // ---------- A5: icons on the offer-type tiles ----------
    var ICON = { "BU-Badumbau": "fa-bath", "BWT-Badewannentür": "fa-door-open", "HL-Handlauf": "fa-grip-lines", "BL-Badelift": "fa-elevator",
      "AH-Alltagshilfe": "fa-handshake-angle", "HMS-Hausmeister-Service": "fa-screwdriver-wrench", "WD-Winterdienst": "fa-snowflake" };
    $$("#page-home .tile-btn[data-step]").forEach(function (t) {
      if (!ICON[t.dataset.step] || t.querySelector(".oc-tile-ico")) return;
      t.insertAdjacentHTML("afterbegin", '<i class="fa-solid ' + ICON[t.dataset.step] + ' oc-tile-ico" aria-hidden="true"></i>');
    });

    // ---------- C5: home order — today's appointments, offer types, „Öffnen“, week ----------
    var home = document.getElementById("page-home");
    var stack = home && $(".home-stack", home);
    var today = document.getElementById("todayPlanningPanel");
    var types = stack && $(".home-offer-types", stack);
    var load = home && $(".home-load-panel", home);
    if (stack && today && types) {
      stack.insertBefore(today, stack.firstChild);
      if (load) types.insertAdjacentElement("afterend", load);
    }

    // ---------- C8: titles and labels ----------
    var h2opt = $("#page-Optional > h2"); if (h2opt && h2opt.textContent.trim() === "Optional") h2opt.textContent = "Optionale Produkte";
    var h2rb = $("#page-Rabatt > h2"); if (h2rb && h2rb.textContent.trim() === "Übersicht") h2rb.textContent = "Aufschlag / Rabatt";
    $$(".wt-group-title-row").forEach(function (row) {
      var n = row.firstChild; if (n && n.nodeType === 3) n.textContent = n.textContent.replace(/^\s*\d+\.\s*/, "");
    });
    var haus = document.getElementById("ahArtHaushalt");
    var hausText = haus && haus.parentNode && haus.parentNode.querySelector("span:last-child");
    if (hausText && hausText.textContent.trim() === "Haushaltsnahedienstleistungen") hausText.textContent = "Haushaltsnahe Dienstleistungen"; // label only, stored value unchanged
    $$(".sec-switch__text strong").forEach(function (s) { if (s.textContent.trim() === "Duschabtrennung (neu)") s.textContent = "Duschabtrennung"; });

    // ---------- C1 + B1: menu ----------
    var LABEL_FIX = { "Duschabtrennung (neu)": "Duschabtrennung", "hms": "Hausmeister-Service", "wd": "Winterdienst", "ah": "Alltagshilfe" };
    var menu = document.getElementById("sideMenu");
    function syncMenu() {
      if (!menu) return;
      $$("a.side-link > span:last-child", menu).forEach(function (s) { var f = LABEL_FIX[s.textContent.trim()]; if (f) s.textContent = f; });
      var bu = isBu();
      var anyMat = false, groupBody = null;
      MAT.forEach(function (m) {
        var a = $('a.side-link[data-step="' + m.step + '"]', menu);
        if (!a) return;
        groupBody = groupBody || a.parentNode;
        var show = !bu || isOn(m) || a.classList.contains("active");
        a.style.display = show ? "" : "none";
        if (show) anyMat = true;
      });
      if (groupBody) {
        var hint = $(".oc-pick-link", groupBody);
        if (!anyMat && bu && pick) {
          if (!hint) {
            hint = document.createElement("a");
            hint.className = "side-link oc-pick-link"; hint.href = "#Arbeiten";
            hint.innerHTML = '<div class="dot"></div><span>Noch nichts gewählt – auswählen</span>';
            hint.addEventListener("click", function () { setTimeout(function () { pick && pick.scrollIntoView({ behavior: "smooth", block: "center" }); }, 250); });
            groupBody.appendChild(hint);
          }
        } else if (hint) hint.remove();
      }
    }
    var menuQueued = false;
    if (menu) new MutationObserver(function () {
      if (menuQueued) return; menuQueued = true;
      requestAnimationFrame(function () { menuQueued = false; syncMenu(); });
    }).observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    // „Weiter“/„Zurück“ skip steps that are not chosen (B1) or internal in customer mode (C7)
    function skipped(step) {
      if (customerMode() && step === "Kosten") return true;
      var m = MAT_BY_STEP[step];
      return !!(m && isBu() && !isOn(m));
    }
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-nav]");
      if (!btn) return;
      var dir = btn.getAttribute("data-nav") === "prev" ? -1 : 1;
      setTimeout(function () {
        var step = currentStep();
        if (!skipped(step) || typeof window.getFlowSteps !== "function" || typeof window.setStep !== "function") return;
        var flow = window.getFlowSteps(), i = flow.indexOf(step);
        if (i === -1) return;
        for (var j = i + dir; j >= 0 && j < flow.length; j += dir) if (!skipped(flow[j])) { window.setStep(flow[j]); return; }
      }, 0);
    });

    // ---------- C2: Angebotsversand — one primary action ----------
    var zf = document.getElementById("page-Zusammenfassung");
    if (zf && !document.getElementById("ocFinish")) {
      var sign = document.getElementById("signOnSiteBtn");
      var finish = document.createElement("div");
      finish.id = "ocFinish";
      finish.innerHTML = '<h3>Abschließen</h3><div class="oc-finish-check" aria-live="polite"></div><div class="oc-finish-actions"></div>';
      var acts = $(".oc-finish-actions", finish);
      function mk(text, cls, fn) { var b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; b.addEventListener("click", fn); acts.appendChild(b); return b; }
      function gotoTab(tab, focusId) {
        var t = document.getElementById("sendTabBtn-" + tab); if (t) t.click();
        var sec = document.getElementById(tab === "mail" ? "sendTabBtn-mail" : "sendTabBtn-post");
        sec && sec.scrollIntoView({ behavior: "smooth", block: "start" });
        var f = focusId && document.getElementById(focusId); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 400);
      }
      if (sign) mk("✍  Mit Kunde unterschreiben (iPad)", "oc-primary", function () { sign.click(); });
      mk("Per E-Mail senden", "oc-secondary", function () { gotoTab("mail", "mailTo"); });
      mk("Per Post", "oc-secondary", function () { gotoTab("post"); });
      var titleRow = (document.getElementById("zfPageTitle") || {}).parentNode;
      if (titleRow && titleRow.parentNode) titleRow.insertAdjacentElement("afterend", finish);
      // Everything else under „Weitere Optionen“: Dokumentenstudio, Bitrix integration.
      var studioTitle = $$("#page-Zusammenfassung h2.section-title").filter(function (h) { return h.textContent.trim() === "Dokumentenstudio"; })[0];
      // found by content, not by class: the page uses .bitrix-section for several unrelated blocks
      var studio = studioTitle && (studioTitle.closest(".export-section") || studioTitle.parentNode);
      var auftrag = document.getElementById("auftragId");
      var bitrix = auftrag && auftrag.closest(".bitrix-section");
      if (bitrix && (!zf.contains(bitrix) || bitrix.contains(finish) || bitrix.querySelector("#sendTabPanel-mail"))) bitrix = null;
      if (studio && (!zf.contains(studio) || studio.querySelector("#sendTabPanel-mail"))) studio = null;
      var more = document.createElement("details");
      more.className = "oc-more";
      more.innerHTML = "<summary>Weitere Optionen <small>Dokumente &amp; Vorschau, Kalkulation, Hassmann-CSV, nur in Bitrix ablegen</small></summary>";
      var anchor = null;
      [studio, bitrix].forEach(function (s) { if (s && s.parentNode && s !== zf) { if (!anchor) { anchor = s; s.parentNode.insertBefore(more, s); } more.appendChild(s); } });
      // the document preview (#documentPreviewSection) stays outside, so a preview opened by any flow is visible
      ["downloadKalkulation", "downloadHassmannCart"].forEach(function (id) { var c = document.getElementById(id); c = c && c.closest(".export-card"); if (c) c.classList.add("oc-internal"); });
      // honest status above the actions (no blocking — owner decision D4)
      var checkLine = $(".oc-finish-check", finish);
      function syncCheck() {
        var r = window.__angebotscheck, st = r && r.status;
        if (!isBu() || !st) { checkLine.textContent = ""; return; }
        checkLine.innerHTML = st === "rot" ? '⚠ Der Angebotscheck hat offene Punkte. <a href="#Angebotscheck">Jetzt prüfen</a>'
          : st === "gelb" ? 'Angebotscheck: Hinweise vorhanden. <a href="#Angebotscheck">Ansehen</a>' : "✓ Angebotscheck ohne offene Punkte";
      }
      window.addEventListener("angebotscheck:updated", syncCheck);
      syncCheck();
    }

    // ---------- C7: „Kundenmodus“ ----------
    var kostenPage = document.getElementById("page-Kosten");
    if (kostenPage && !$(".oc-km-note", kostenPage)) {
      var note = document.createElement("p"); note.className = "oc-km-note";
      note.textContent = "Kundenmodus ist an – interne Zahlen sind ausgeblendet.";
      kostenPage.insertBefore(note, kostenPage.firstChild);
    }
    var controls = $("body > header .theme-controls");
    var kmBtn = null;
    if (controls && !document.getElementById("ocCustomerBtn")) {
      kmBtn = document.createElement("button");
      kmBtn.type = "button"; kmBtn.id = "ocCustomerBtn"; kmBtn.hidden = true;
      kmBtn.title = "Kundenmodus: Aufschlag, Kosten, Kalkulation und Einkaufsdaten ausblenden, solange der Kunde mitschaut";
      kmBtn.innerHTML = '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i><span class="oc-cm-text">Kundenmodus</span>';
      kmBtn.addEventListener("click", function () {
        var on = !customerMode();
        document.documentElement.classList.toggle("oc-customer", on);
        ssSet(KM_KEY, on ? "1" : "0");
        syncKm();
        if (on && currentStep() === "Kosten" && typeof window.setStep === "function") window.setStep("Rabatt");
      });
      var slot = document.getElementById("ocSaveSlot");
      controls.insertBefore(kmBtn, slot || document.getElementById("userBox") || null);
    }
    function syncKm() {
      if (!kmBtn) return;
      var inOffer = !!offerType() && currentStep() !== "home" && currentStep() !== "";
      kmBtn.hidden = !inOffer && !customerMode();
      kmBtn.setAttribute("aria-pressed", String(customerMode()));
    }

    // ---------- C6: markup chips below the minimum ----------
    function syncChips() {
      $$(".aufschlag-chip").forEach(function (c) {
        var low = c.classList.contains("is-low");
        if (low && !c.title) c.title = "Unter dem Mindestwert für diese Kundenart";
        if (!low && c.title === "Unter dem Mindestwert für diese Kundenart") c.title = "";
      });
    }

    // ---------- D3: provisional total ----------
    var sw = document.getElementById("summaryWidget");
    var totalRow = sw && $(".sw-total .sw-label", sw);
    if (totalRow && !document.getElementById("ocProvisional")) {
      var pv2 = document.createElement("span"); pv2.id = "ocProvisional"; pv2.textContent = "vorläufig";
      pv2.title = "Noch nicht vollständig: Kunde und mindestens eine Leistung fehlen";
      totalRow.appendChild(pv2);
    }
    function syncProvisional() {
      if (!sw) return;
      var name = (document.getElementById("swNameValue") || {}).textContent || "";
      var hasCustomer = !!name.trim() && name.trim() !== "–";
      var hasItem = true;
      if (isBu()) {
        hasItem = MAT.some(isOn) || $$('#form-Arbeiten input[name="duschwanne[workTasks][]"]:checked').length > 0 ||
          $$("#page-Optional input:checked").length > 0;
      }
      sw.classList.toggle("oc-provisional", !(hasCustomer && hasItem));
    }

    // ---------- keep everything in step ----------
    function syncAll() {
      try { syncPick(); } catch (e) { /* never break the page */ }
      try { syncTiles(); } catch (e) { /* idem */ }
      try { syncMenu(); } catch (e) { /* idem */ }
      try { syncKm(); } catch (e) { /* idem */ }
      try { syncChips(); } catch (e) { /* idem */ }
      try { syncProvisional(); } catch (e) { /* idem */ }
    }
    document.addEventListener("change", function () { setTimeout(syncAll, 0); }, true);
    document.addEventListener("input", function () { setTimeout(syncProvisional, 0); }, true);
    window.addEventListener("hashchange", function () { setTimeout(syncAll, 0); });
    window.addEventListener("pricing:updated", syncAll);
    setInterval(syncAll, 1500); // restores set values without events
    syncAll();

    window.__ocQuickWins = { sync: syncAll, setMaterial: function (step, on) { var m = MAT_BY_STEP[step]; if (m) setMaterial(m, !!on); } };
  });
})();
