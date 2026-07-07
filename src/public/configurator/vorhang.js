// vorhang.js — "Duschvorhang" configurator tab.
// Loaded as an external module (CSP blocks inline scripts).
// User enters a shower width; the widget preselects the nearest curtain + rail
// (size ≥ width) plus the mandatory Befestigungsrosettenpaar — all removable —
// and offers optional rail accessories. Selected net lines flow into the offer
// via window.__vorhangConfigurator.getLines(), consumed by buildPayload().

const mountEl = document.getElementById("vorhang-mount");

if (mountEl) {
  let catalog = null; // { curtains, rods, mandatory, optional }
  // state
  let widthCm = null;
  let curtainSel = null; // articleNumber | null
  let rodSel = null; // articleNumber | null
  const mandatoryQty = {}; // articleNumber -> qty (0 = off); defaults to 1 (preselected)
  const optionalQty = {}; // articleNumber -> qty (0 = off)

  // Preselect every mandatory item (qty 1) unless already set.
  const initMandatory = () => {
    (catalog?.mandatory || []).forEach((m) => {
      if (mandatoryQty[m.articleNumber] == null) mandatoryQty[m.articleNumber] = 1;
    });
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eur = (n) => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const refreshOffer = () => {
    try { window.updatePricing?.(); } catch {}
    try { window.updateSummary?.(); } catch {}
  };

  const byArticle = (list, art) => (list || []).find((x) => x.articleNumber === art) || null;

  // Smallest item whose sizeCm >= target; falls back to the largest available.
  const nearestAtLeast = (list, target) => {
    if (!list || !list.length) return null;
    const withSize = list.filter((x) => x.sizeCm != null);
    const covering = withSize.filter((x) => x.sizeCm >= target).sort((a, b) => a.sizeCm - b.sizeCm);
    if (covering.length) return covering[0];
    const sorted = withSize.slice().sort((a, b) => a.sizeCm - b.sizeCm);
    return sorted.length ? sorted[sorted.length - 1] : list[0];
  };

  const applyWidth = (cm) => {
    widthCm = Number.isFinite(cm) && cm > 0 ? cm : null;
    if (widthCm != null && catalog) {
      curtainSel = nearestAtLeast(catalog.curtains, widthCm)?.articleNumber || null;
      rodSel = nearestAtLeast(catalog.rods, widthCm)?.articleNumber || null;
      initMandatory();
    }
    render();
    refreshOffer();
  };

  // ---- lines (consumed by the offer) --------------------------------------
  const getLines = () => {
    if (!catalog) return [];
    const out = [];
    const push = (item, qty) => {
      if (!item || (Number(item.net) || 0) <= 0) return;
      out.push({ label: item.name, articleNumber: item.articleNumber, net: item.net, finish: item.finish || null, qty: qty || 1 });
    };
    if (curtainSel) push(byArticle(catalog.curtains, curtainSel), 1);
    if (rodSel) push(byArticle(catalog.rods, rodSel), 1);
    for (const m of catalog.mandatory || []) {
      const q = mandatoryQty[m.articleNumber] || 0;
      if (q > 0) push(m, q);
    }
    for (const [art, qty] of Object.entries(optionalQty)) {
      if (qty > 0) push(byArticle(catalog.optional, art), qty);
    }
    return out;
  };

  window.__vorhangConfigurator = {
    getLines,
    getState() {
      return { widthCm, curtainSel, rodSel, mandatoryQty: { ...mandatoryQty }, optionalQty: { ...optionalQty } };
    },
    restore(saved) {
      if (!saved || typeof saved !== "object") return;
      widthCm = saved.widthCm ?? null;
      curtainSel = saved.curtainSel ?? null;
      rodSel = saved.rodSel ?? null;
      Object.keys(mandatoryQty).forEach((k) => delete mandatoryQty[k]);
      // back-compat: legacy saved offers used a boolean rosetteOn
      if (saved.mandatoryQty) Object.assign(mandatoryQty, saved.mandatoryQty);
      else if (saved.rosetteOn !== false) initMandatory();
      Object.keys(optionalQty).forEach((k) => delete optionalQty[k]);
      Object.assign(optionalQty, saved.optionalQty || {});
      render();
      refreshOffer();
    },
  };

  // ---- rendering ----------------------------------------------------------
  // A single picker card for a size-variant group (curtains / rods): one image +
  // the selected variant's name & price + a row of size buttons. Same card size
  // as the accessory tiles.
  // Reuse the Optional tab's card look: .image-check card (img-wrap + caption) inside
  // an .opt-item column. Picker cards add a row of size buttons under the caption.
  const pickerCard = (kind, list, selectedArt) => {
    const sel = byArticle(list, selectedArt);
    const img = sel?.image || list[0]?.image || null;
    const name = sel ? sel.name : "Keine Auswahl";
    const priceHtml = sel ? `<span class="vh-price">${eur(sel.net)}</span>` : `<span class="vh-price vh-muted">—</span>`;
    const pills = list
      .map(
        (it) => `<button type="button" class="vh-pill" data-kind="${kind}" data-art="${esc(it.articleNumber)}" data-selected="${it.articleNumber === selectedArt ? "true" : "false"}">${it.sizeCm != null ? it.sizeCm + " cm" : esc(it.name)}</button>`,
      )
      .join("");
    return `
      <div class="opt-item">
        <div class="image-check vh-pickcard${sel ? " is-checked" : ""}">
          <span class="img-wrap">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}</span>
          <span class="caption">${esc(name)}</span>
          <span class="vh-price-row">${priceHtml}</span>
          <span class="vh-pills">${pills}</span>
        </div>
      </div>`;
  };

  // An accessory tile (mandatory / optional): a checkbox .image-check card (identical
  // to the Optional tab), with a Menge .field below. kind selects the qty map.
  const accTile = (item, kind, qty) => {
    const on = qty > 0;
    return `
    <div class="opt-item vh-acc" data-kind="${kind}" data-art="${esc(item.articleNumber)}">
      <label class="image-check">
        <input type="checkbox" data-role="acc-toggle" ${on ? "checked" : ""}>
        <span class="img-wrap">${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : ""}</span>
        <span class="caption">${esc(item.name)}</span>
        <span class="vh-price-row"><span class="vh-price">${eur(item.net)}</span></span>
      </label>
      <div class="field vh-qty-field" ${on ? "" : "hidden"}>
        <label>Menge</label>
        <input type="number" data-role="acc-qty" min="1" step="1" value="${on ? qty : 1}" placeholder="1">
      </div>
    </div>`;
  };

  const render = () => {
    if (!catalog) {
      mountEl.innerHTML = `<div class="dac-loading">Produkte werden geladen …</div>`;
      return;
    }
    const curtainCard = catalog.curtains.length
      ? pickerCard("curtain", catalog.curtains, curtainSel)
      : '<span class="dac-hint">Keine Vorhänge verfügbar.</span>';
    const rodCard = catalog.rods.length
      ? pickerCard("rod", catalog.rods, rodSel)
      : '<span class="dac-hint">Keine Stangen verfügbar.</span>';
    const mandTiles = (catalog.mandatory || [])
      .map((m) => accTile(m, "rosette", mandatoryQty[m.articleNumber] || 0))
      .join("");
    const optTiles = (catalog.optional || [])
      .map((o) => accTile(o, "opt", optionalQty[o.articleNumber] || 0))
      .join("");

    mountEl.innerHTML = `
      <div class="vh-widthbar">
        <label class="vh-width-label" for="vh-width">Breite der Dusche / Nische (cm)</label>
        <input type="number" id="vh-width" class="vh-width-input" min="1" step="1" value="${widthCm ?? ""}" placeholder="z. B. 120">
        <span class="vh-hint">Es wird die nächste passende Größe (≥ Breite) vorausgewählt. Auswahl ist änderbar.</span>
      </div>
      <div class="vh-section">
        <div class="vh-tworow">
          <div class="vh-col">
            <div class="vh-step-title">Duschvorhang</div>
            <div class="vh-grid">${curtainCard}</div>
          </div>
          <div class="vh-col">
            <div class="vh-step-title">Vorhangstange</div>
            <div class="vh-grid">${rodCard}</div>
          </div>
        </div>
      </div>
      <div class="vh-section">
        <div class="vh-step-title">Erforderliche Befestigung</div>
        <div class="vh-grid vh-acc-grid">${mandTiles || '<span class="dac-hint">—</span>'}</div>
      </div>
      <div class="vh-section">
        <div class="vh-step-title">Optionales Zubehör</div>
        <div class="vh-grid vh-acc-grid">${optTiles || '<span class="dac-hint">—</span>'}</div>
      </div>`;
    wire();
  };

  const wire = () => {
    const widthInput = mountEl.querySelector("#vh-width");
    widthInput?.addEventListener("change", (e) => applyWidth(Number(e.target.value)));

    // size pills for curtain / rod (click selected → deselect)
    mountEl.querySelectorAll(".vh-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { kind, art } = btn.dataset;
        if (kind === "curtain") curtainSel = curtainSel === art ? null : art;
        else if (kind === "rod") rodSel = rodSel === art ? null : art;
        render();
        refreshOffer();
      });
    });

    // accessory cards — mandatory + optional share the same toggle + Menge logic
    mountEl.querySelectorAll(".vh-acc").forEach((row) => {
      const art = row.dataset.art;
      const map = row.dataset.kind === "opt" ? optionalQty : mandatoryQty;
      const cb = row.querySelector('input[data-role="acc-toggle"]');
      const qtyField = row.querySelector(".vh-qty-field");
      const qtyInput = row.querySelector('input[data-role="acc-qty"]');
      cb?.addEventListener("change", () => {
        map[art] = cb.checked ? Math.max(1, Number(qtyInput?.value) || 1) : 0;
        if (qtyField) qtyField.hidden = !cb.checked;
        refreshOffer();
      });
      qtyInput?.addEventListener("change", () => {
        if (cb?.checked) {
          map[art] = Math.max(1, Number(qtyInput.value) || 1);
          refreshOffer();
        }
      });
    });
  };

  // ---- boot ---------------------------------------------------------------
  render();
  fetch("/api/vorhang/products")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((data) => {
      catalog = data;
      initMandatory();
      render();
    })
    .catch((err) => {
      console.error("[vorhang] load failed:", err?.message || err);
      mountEl.innerHTML = '<div class="dac-hint">Produkte konnten nicht geladen werden.</div>';
    });
}
