/* v2 add-on — change the description and the net unit price of single positions on the Kosten
 * page (U-014, owner decision 2026-11-12), on top of today's UI (ADR 021).
 *
 * Why: the only way to change one position used to be a hand-edited Word file, and such an
 * offer gets no online-signing link. Now the change is part of the offer data
 * (payload.offerOverrides.lineEdits, carried by OfferOverrides.js), so price, PDF, signing
 * page, mail and Kalkulation all follow, and it is saved, restored and versioned like the rest.
 *
 * Rules:
 *  - price: the position's net unit price in this offer; a reason is required; a warning
 *    appears when it is more than 20 % below the catalogue price (no hard limit);
 *  - description: material positions only (the customer document does not list the single
 *    work-cost lines); the quantity in front stays as configured;
 *  - offer types BU, BWT, HL, BL; sent offers cannot be changed (new version first);
 *  - the catalogue is never touched. */
(function () {
  "use strict";
  window.__ocKostenEdit = true; // OfferOverrides.js: hide the block price adjustment for new offers
  var TYPES = ["", "bu", "bwt", "hl", "bl"];
  var WARN_BELOW = 0.2;
  // same list as the offer document (docx-template.js BRAND_NAMES_STRIP): the description
  // offered for editing is the text the customer document prints
  var DOC_BRANDS = /\b(Vigour|TRINNITY|winwall)\b/gi;
  var QTY_RE = /^[\d.,]+\s*(?:Stk\.?|Stück|m²|m2|qm|lfm|km|m|h|Std\.?|Set|Paar)?\s+/i;

  var container = null, open = null, painting = false;

  function offerType() { try { return String((window.getCurrentOfferType && window.getCurrentOfferType()) || "").toLowerCase(); } catch (e) { return ""; } }
  function allowed() { return TYPES.indexOf(offerType()) !== -1; }
  function locked() { return document.body.classList.contains("is-sent-offer"); }
  function pricing() { try { return (window.getCanonicalPricingData && window.getCanonicalPricingData()) || null; } catch (e) { return null; } }
  function edits() { try { return (window.getOfferLineEdits && window.getOfferLineEdits()) || []; } catch (e) { return []; } }
  function euro(n) { return Number(n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }
  function signed(n) { return Number(n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", signDisplay: "exceptZero" }); }
  function num(v) {
    var s = String(v == null ? "" : v).trim().replace(/\s|€/g, "");
    if (!s) return null;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    var n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  function docText(label) { return String(label || "").replace(DOC_BRANDS, "").replace(/\s{2,}/g, " ").replace(/^\s*-\s*/, "").trim(); }
  function description(label) { return docText(label).replace(QTY_RE, "").trim(); }
  function qtyPrefix(label) { var t = docText(label), d = description(label); return t.slice(0, t.length - d.length); }
  function keyOf(block, id, source) { return block + "|" + id + "|" + (source || ""); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  // the priced line behind a Kosten row
  function findLine(data, id, source) {
    var mats = (data && data.materials && data.materials.lines) || [];
    var svcs = (data && data.services && data.services.lines) || [];
    var i, l;
    for (i = 0; i < mats.length; i++) {
      l = mats[i];
      if (String(l.productId || l.id || "").trim() === id && String(l.source == null ? "" : l.source) === source) return { block: "material", line: l };
    }
    if (!source) for (i = 0; i < svcs.length; i++) if (String(svcs[i].key || "") === id) return { block: "services", line: svcs[i] };
    return null;
  }
  function base(line) {
    var hasUnit = line.unitPrice != null && Number.isFinite(Number(line.unitPrice));
    return {
      hasUnit: hasUnit,
      qty: hasUnit ? Number(line.qty == null ? 1 : line.qty) || 0 : 1,
      unit: hasUnit ? Number(line.unitPrice) : Number(line.amount != null ? line.amount : line.lineTotal) || 0,
    };
  }

  function save(list) {
    if (typeof window.setOfferLineEdits !== "function") return;
    window.setOfferLineEdits(list);
  }
  function without(key) { return edits().filter(function (e) { return keyOf(e.block, e.id, e.source) !== key; }); }

  function css() {
    if (document.getElementById("ocKostenEditCss")) return;
    var s = el("style"); s.id = "ocKostenEditCss";
    s.textContent =
      ".oc-ke-btn{display:inline-block;margin-left:8px;padding:6px 12px;min-height:36px;font-size:.8rem;border:1px solid var(--border);border-radius:8px;background:var(--card,#fff);color:var(--text,#1e293b);cursor:pointer;vertical-align:middle}" +
      ".oc-ke-btn:hover{border-color:var(--accent,#0ea5e9)}" +
      ".oc-ke-badge{display:inline-block;margin-left:0;margin-top:4px;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:700;background:#fff4d6;border:1px solid #f0d58a;color:#7a5200;vertical-align:middle;text-decoration:none}" +
      ".oc-ke-was{display:block;font-size:.8em;color:var(--muted,#64748b);text-decoration:line-through}" +
      ".oc-ke-new{display:block;font-weight:700}" +
      ".oc-ke-reason{display:block;font-size:.78rem;color:var(--muted,#64748b);margin-top:2px}" +
      ".oc-ke-editor{grid-column:1/-1;border:1px solid var(--accent,#0ea5e9);border-radius:10px;padding:12px;margin:4px 0 10px;background:var(--bg-alt,#f8fafc);display:grid;gap:10px}" +
      ".oc-ke-editor label{display:grid;gap:4px;font-size:.8rem;font-weight:600}" +
      ".oc-ke-editor input,.oc-ke-editor textarea{font:inherit;font-weight:400;padding:10px;min-height:44px;border:1px solid var(--border);border-radius:8px;background:var(--card,#fff);color:var(--text,#1e293b);width:100%;box-sizing:border-box}" +
      ".oc-ke-row{display:flex;gap:10px;flex-wrap:wrap}.oc-ke-row>label{flex:1 1 180px}" +
      ".oc-ke-actions{display:flex;gap:8px;flex-wrap:wrap}.oc-ke-actions button{min-height:44px;padding:8px 16px}" +
      ".oc-ke-err{color:#a5261c;font-size:.82rem;font-weight:600}.oc-ke-warn{color:#7a5200;font-size:.82rem}" +
      ".oc-ke-hint{font-size:.78rem;color:var(--muted,#64748b);font-weight:400}" +
      ".oc-ke-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-radius:10px;background:#fff4d6;border:1px solid #f0d58a;color:#7a5200;font-size:.88rem;font-weight:600}" +
      ".oc-ke-bar button{margin-left:auto;min-height:36px}" +
      "body.is-sent-offer .oc-ke-btn,html.oc-customer .oc-ke-btn{display:none}";
    document.head.appendChild(s);
  }

  function editor(row, found, existing) {
    var b = base(found.line), isMat = found.block === "material";
    var origDesc = description(found.line.label);
    var draft = open && open.draft ? open.draft : {
      desc: existing && existing.label ? existing.label : origDesc,
      price: (existing && existing.unitPriceNet != null ? existing.unitPriceNet : b.unit).toFixed(2).replace(".", ","),
      reason: (existing && existing.reason) || "",
    };
    open.draft = draft;

    var box = el("div", "oc-ke-editor");
    box.setAttribute("data-oc-ke-editor", open.key);
    var desc = null;
    if (isMat) {
      var l1 = el("label", null, "Beschreibung im Angebot");
      desc = el("textarea"); desc.rows = 2; desc.value = draft.desc; desc.setAttribute("data-oc-ke", "desc");
      desc.addEventListener("input", function () { draft.desc = desc.value; });
      l1.appendChild(desc);
      l1.appendChild(el("span", "oc-ke-hint", "Die Menge davor (" + (qtyPrefix(found.line.label).trim() || "–") + ") bleibt wie konfiguriert."));
      box.appendChild(l1);
    }
    var rowEl = el("div", "oc-ke-row");
    var l2 = el("label", null, b.hasUnit ? "Einzelpreis netto (€)" : "Betrag netto (€)");
    var price = el("input"); price.type = "text"; price.inputMode = "decimal"; price.value = draft.price; price.setAttribute("data-oc-ke", "price");
    l2.appendChild(price);
    l2.appendChild(el("span", "oc-ke-hint", "Katalog: " + euro(b.unit) + (b.hasUnit ? " · Menge " + String(b.qty).replace(".", ",") : "")));
    var l3 = el("label", null, "Grund für die Preisänderung");
    var reason = el("input"); reason.type = "text"; reason.maxLength = 200; reason.value = draft.reason; reason.placeholder = "z. B. Sonderpreis laut Absprache"; reason.setAttribute("data-oc-ke", "reason");
    reason.addEventListener("input", function () { draft.reason = reason.value; });
    l3.appendChild(reason);
    rowEl.appendChild(l2); rowEl.appendChild(l3);
    box.appendChild(rowEl);

    var warn = el("div", "oc-ke-warn"); warn.hidden = true;
    var err = el("div", "oc-ke-err"); err.hidden = true; err.setAttribute("role", "alert");
    box.appendChild(warn); box.appendChild(err);
    function check() {
      var p = num(price.value);
      var low = p != null && !isNaN(p) && b.unit > 0 && p < b.unit * (1 - WARN_BELOW);
      warn.hidden = !low;
      if (low) warn.textContent = "Achtung: Der Preis liegt mehr als 20 % unter dem Katalogpreis (" + euro(b.unit) + ").";
    }
    price.addEventListener("input", function () { draft.price = price.value; err.hidden = true; check(); });
    check();

    var actions = el("div", "oc-ke-actions");
    var ok = el("button", null, "Übernehmen"); ok.type = "button"; ok.setAttribute("data-oc-ke", "apply");
    var cancel = el("button", "secondary", "Abbrechen"); cancel.type = "button";
    actions.appendChild(ok); actions.appendChild(cancel);
    if (existing) {
      var reset = el("button", "secondary", "Zurücksetzen"); reset.type = "button"; reset.setAttribute("data-oc-ke", "reset");
      reset.addEventListener("click", function () { var k = open.key; open = null; save(without(k)); });
      actions.appendChild(reset);
    }
    box.appendChild(actions);
    function fail(text, field) { err.textContent = text; err.hidden = false; if (field) field.focus(); }
    cancel.addEventListener("click", function () { open = null; paint(); });
    ok.addEventListener("click", function () {
      var p = num(price.value);
      if (p == null || isNaN(p) || p < 0 || p > 100000) return fail("Bitte geben Sie einen gültigen Preis ein (0 bis 100.000 €).", price);
      var priceChanged = Math.abs(p - b.unit) >= 0.005;
      var newDesc = desc ? desc.value.replace(/\s+/g, " ").trim() : "";
      if (desc && !newDesc) return fail("Die Beschreibung darf nicht leer sein.", desc);
      var descChanged = !!desc && newDesc !== origDesc;
      if (priceChanged && !reason.value.trim()) return fail("Bitte geben Sie einen Grund für die Preisänderung an.", reason);
      var key = open.key, rest = without(key);
      open = null;
      if (!priceChanged && !descChanged) { save(rest); return; }
      rest.push({
        block: found.block, id: key.split("|")[1], source: key.split("|")[2] || "",
        origLabel: String(found.line.label || ""), label: descChanged ? newDesc : "",
        unitPriceNet: priceChanged ? p : null, origUnitPriceNet: b.unit,
        reason: priceChanged ? reason.value.trim() : "",
      });
      save(rest);
    });
    // after the 4 cells of this row
    var last = row; for (var i = 0; i < 3 && last.nextElementSibling; i++) last = last.nextElementSibling;
    last.insertAdjacentElement("afterend", box);
    return box;
  }

  function paint() {
    if (!container || painting) return;
    painting = true;
    try {
      css();
      var wraps = container.querySelectorAll("[data-oc-ke-wrap]");
      for (var i = 0; i < wraps.length; i++) { while (wraps[i].firstChild) wraps[i].parentNode.insertBefore(wraps[i].firstChild, wraps[i]); wraps[i].remove(); }
      var old = container.querySelectorAll(".oc-ke-btn,.oc-ke-badge,.oc-ke-editor,.oc-ke-bar,.oc-ke-was,.oc-ke-new,.oc-ke-reason");
      for (i = 0; i < old.length; i++) old[i].remove();
      var hiddenOld = container.querySelectorAll("[data-oc-ke-hidden]");
      for (i = 0; i < hiddenOld.length; i++) { hiddenOld[i].hidden = false; hiddenOld[i].removeAttribute("data-oc-ke-hidden"); }
      if (!allowed()) return;
      var data = pricing(), list = edits(), byKey = {}, done = {};
      list.forEach(function (e) { byKey[keyOf(e.block, e.id, e.source)] = e; });
      var rows = container.querySelectorAll("div[data-line-id]");
      var deltaNet = 0, shown = 0;
      for (i = 0; i < rows.length; i++) {
        var row = rows[i], id = row.getAttribute("data-line-id") || "", source = row.getAttribute("data-line-source") || "";
        if (!id) continue;
        var found = findLine(data, id, source);
        if (!found) continue;
        var key = keyOf(found.block, id, source);
        if (done[key]) continue; // the same product listed twice: the first row carries the change
        done[key] = true;
        var e = byKey[key], b = base(found.line);
        if (e) {
          shown++;
          if (e.label) {
            // the catalogue text stays visible, crossed out, under the new one
            var wrap = el("span", "oc-ke-was"); wrap.setAttribute("data-oc-ke-wrap", "1");
            while (row.firstChild) wrap.appendChild(row.firstChild);
            row.appendChild(el("span", "oc-ke-new", qtyPrefix(found.line.label) + e.label));
            row.appendChild(wrap);
          }
          if (e.unitPriceNet != null) {
            var d = Math.round((e.unitPriceNet - b.unit) * b.qty * 100) / 100;
            deltaNet += d;
            var unitCell = row.nextElementSibling && row.nextElementSibling.nextElementSibling;
            var totalCell = unitCell && unitCell.nextElementSibling;
            var lineTotal = Number(found.line.lineTotal != null ? found.line.lineTotal : found.line.amount) || 0;
            if (unitCell && totalCell) {
              mark(unitCell, b.hasUnit ? euro(e.unitPriceNet) : "");
              mark(totalCell, euro(lineTotal + d));
            }
          }
          row.appendChild(el("span", "oc-ke-badge", "geändert"));
          if (e.unitPriceNet != null && e.reason) row.appendChild(el("span", "oc-ke-reason", "Grund: " + e.reason));
        }
        if (!locked()) {
          var btn = el("button", "oc-ke-btn", e ? "Ändern" : "Bearbeiten");
          btn.type = "button"; btn.setAttribute("data-oc-ke-open", key);
          btn.setAttribute("aria-label", (e ? "Änderung bearbeiten: " : "Position bearbeiten: ") + description(found.line.label));
          (function (k) { btn.addEventListener("click", function () { open = open && open.key === k ? null : { key: k }; paint(); }); })(key);
          row.appendChild(btn);
          if (open && open.key === key) editor(row, found, e);
        }
      }
      if (list.length) {
        var tax = Number(data && data.taxRate); if (!Number.isFinite(tax) || tax <= 0) tax = 0.19;
        var bar = el("div", "oc-ke-bar");
        var missing = list.length - shown;
        var text = shown + (shown === 1 ? " Position geändert" : " Positionen geändert");
        if (Math.abs(deltaNet) >= 0.005) text += " · Angebot " + signed(deltaNet) + " netto (" + signed(deltaNet * (1 + tax)) + " brutto)";
        if (missing > 0) text += " · " + missing + (missing === 1 ? " Änderung gehört" : " Änderungen gehören") + " zu Positionen, die nicht mehr im Angebot sind";
        bar.appendChild(el("span", null, text));
        if (!locked()) {
          var all = el("button", "secondary", "Alle zurücksetzen"); all.type = "button"; all.setAttribute("data-oc-ke", "reset-all");
          all.addEventListener("click", function () {
            var go = function (yes) { if (yes) { open = null; save([]); } };
            if (typeof window.appConfirm === "function") window.appConfirm({ title: "Alle Änderungen zurücksetzen?", message: "Beschreibungen und Preise aller Positionen gelten wieder wie im Katalog.", confirmLabel: "Zurücksetzen" }).then(go);
            else go(window.confirm("Alle Änderungen an Positionen zurücksetzen?"));
          });
          bar.appendChild(all);
        }
        container.insertBefore(bar, container.firstChild);
      }
    } finally {
      // let the observer drain our own changes before it listens again
      setTimeout(function () { painting = false; }, 0);
    }
  }
  // show the new value, keep the catalogue value crossed out
  function mark(cell, text) {
    var was = el("span", "oc-ke-was", cell.textContent.trim());
    var keep = el("span"); keep.setAttribute("data-oc-ke-hidden", "1"); keep.hidden = true;
    while (cell.firstChild) keep.appendChild(cell.firstChild);
    cell.appendChild(keep);
    if (text) cell.appendChild(el("span", "oc-ke-new", text));
    cell.appendChild(was);
  }

  function start() {
    container = document.getElementById("costsSummary");
    if (!container) return;
    new MutationObserver(function () { if (!painting) paint(); }).observe(container, { childList: true });
    window.addEventListener("offer-line-edits:changed", function () { paint(); });
    // the page may be drawn before the new price is stored → draw the markers again afterwards
    window.addEventListener("pricing:updated", function () { setTimeout(paint, 0); });
    window.addEventListener("offerflow:changed", function () { open = null; setTimeout(paint, 0); });
    new MutationObserver(function () { paint(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.__ocKostenEditApi = { paint: function () { paint(); } };
})();
