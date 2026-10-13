// vorhang.js — "Duschvorhang" configurator tab.
// Loaded as an external module (CSP blocks inline scripts).
// The user picks the situation (Nische / Ecke / U-Form) and enters the side
// lengths; vorhang-plan.js proposes curtain, rods, Bögen, Kupplungen,
// Deckenstützen and Befestigung — every quantity stays editable. Selected net
// lines flow into the offer via window.__vorhangConfigurator.getLines(),
// consumed by buildPayload() (collectDuschvorhangConfigurator in script.js).

import { SHAPES, ART, legValues, configLabel, applyPlan, fromSaved, buildLines } from "./vorhang-plan.js";

const mountEl = document.getElementById("vorhang-mount");

if (mountEl) {
  let catalog = null; // { curtains, rods, mandatory, optional }
  // master opt-in — new offers start with nothing added
  let state = fromSaved(null);

  // Preselect every mandatory item (qty 1) unless already set.
  const initMandatory = () => {
    state.mandatoryQty = state.mandatoryQty || {};
    (catalog?.mandatory || []).forEach((m) => {
      if (state.mandatoryQty[m.articleNumber] == null) state.mandatoryQty[m.articleNumber] = 1;
    });
  };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const eur = (n) => (Number(n) || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

  const refreshOffer = () => {
    try { window.updatePricing?.(); } catch {}
    try { window.updateSummary?.(); } catch {}
  };

  // Offers saved before the shape picker have shape null; they are shown as a
  // Nische but keep their lines untouched until the user edits the situation.
  const viewShape = () => state.shape || "nische";

  const LEG_NAMES = {
    nische: { a: "Breite (Wand zu Wand)" },
    ecke: { a: "Vorderseite", b: "Seitenteil" },
    u: { a: "Linke Seite", b: "Vorderseite", c: "Rechte Seite" },
  };
  const CHIP_SUB = { nische: "1 Stange", ecke: "2 Stangen", u: "3 Stangen" };

  // ---- top-view drawing ---------------------------------------------------
  // Each shape: wall segments, the rod polyline, and which polyline segment is
  // which side (a/b/c). Shower interior is towards `center`.
  const GEOM = {
    nische: {
      walls: [[40, 30, 40, 210], [320, 30, 320, 210], [40, 30, 320, 30]],
      rod: [[46, 176], [314, 176]],
      center: [180, 100],
    },
    ecke: {
      walls: [[40, 30, 320, 30], [40, 30, 40, 210]],
      rod: [[46, 176], [270, 176], [270, 36]],
      center: [150, 100],
    },
    u: {
      walls: [[30, 30, 330, 30]],
      rod: [[70, 36], [70, 176], [290, 176], [290, 36]],
      center: [180, 100],
    },
  };

  // Curtain fabric: a wave running parallel to a rod segment, on the inside.
  const wave = (x1, y1, x2, y2, center) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    let nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    if ((center[0] - mx) * nx + (center[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
    const n = Math.max(2, Math.round(len / 11));
    const off = 9, amp = 4;
    const at = (t, d) => [x1 + (x2 - x1) * t + nx * d, y1 + (y2 - y1) * t + ny * d];
    let d = `M${at(0, off).map((v) => v.toFixed(1)).join(",")}`;
    for (let i = 0; i < n; i++) {
      const c = at((i + 0.5) / n, off + (i % 2 ? -amp : amp));
      const e = at((i + 1) / n, off);
      d += ` Q${c[0].toFixed(1)},${c[1].toFixed(1)} ${e[0].toFixed(1)},${e[1].toFixed(1)}`;
    }
    return { d, nx, ny };
  };

  const drawSvg = () => {
    const shape = viewShape();
    const g = GEOM[shape];
    const keys = SHAPES[shape].legs;
    const vals = legValues(shape, state.legs);
    const parts = [];
    parts.push(`<rect class="vhc-floor" x="${shape === "u" ? 70 : 40}" y="30" width="${shape === "u" ? 220 : shape === "ecke" ? 230 : 280}" height="146" rx="4"/>`);
    for (const [x1, y1, x2, y2] of g.walls) parts.push(`<line class="vhc-wall" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    parts.push(`<text class="vhc-walltext" x="180" y="20">Wand</text>`);
    const badges = [];
    for (let i = 0; i < g.rod.length - 1; i++) {
      const [x1, y1] = g.rod[i], [x2, y2] = g.rod[i + 1];
      const w = wave(x1, y1, x2, y2, g.center);
      const k = keys[i];
      parts.push(`<g class="vhc-seg" data-leg="${k}"><path class="vhc-curtain" d="${w.d}"/><line class="vhc-rod" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></g>`);
      const bx = (x1 + x2) / 2 - w.nx * 26, by = (y1 + y2) / 2 - w.ny * 26;
      const txt = vals[i] > 0 ? `${vals[i]} cm` : "– cm";
      badges.push(`<g class="vhc-badge" data-leg="${k}"><rect x="${bx - 42}" y="${by - 15}" width="84" height="30" rx="15"/><circle cx="${bx - 27}" cy="${by}" r="10"/><text class="vhc-badge-n" x="${bx - 27}" y="${by + 4}">${i + 1}</text><text class="vhc-badge-t" x="${bx + 9}" y="${by + 4.5}">${txt}</text></g>`);
    }
    // wall rosettes at both rod ends, Bogen + Deckenstütze at every corner
    const ends = [g.rod[0], g.rod[g.rod.length - 1]];
    for (const [x, y] of ends) parts.push(`<rect class="vhc-rosette" x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2"/>`);
    for (const [x, y] of g.rod.slice(1, -1)) parts.push(`<circle class="vhc-corner" cx="${x}" cy="${y}" r="7"/>`);
    return `<svg class="vhc-svg" viewBox="0 0 360 225" role="img" aria-label="Draufsicht ${esc(SHAPES[shape].label)}">${parts.join("")}${badges.join("")}</svg>`;
  };

  // ---- tiles --------------------------------------------------------------
  // An item tile: a checkbox .image-check card (identical to the Optional tab),
  // with a Menge .field below. kind selects the qty map.
  const QTY_MAP = { curtain: "curtainQty", rod: "rodQty", rosette: "mandatoryQty", opt: "optionalQty" };
  const tile = (item, kind) => {
    const qty = state[QTY_MAP[kind]]?.[item.articleNumber] || 0;
    const on = qty > 0;
    const caption = kind === "curtain" && item.sizeCm != null ? `${item.name} ${item.sizeCm} cm` : item.packNote ? `${item.name} (${item.packNote})` : item.name;
    return `
    <div class="opt-item vh-acc" data-kind="${kind}" data-art="${esc(item.articleNumber)}">
      <label class="image-check">
        <input type="checkbox" data-role="acc-toggle" ${on ? "checked" : ""}>
        <span class="img-wrap">${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : ""}</span>
        <span class="caption">${esc(caption)}</span>
        <span class="vh-price-row"><span class="vh-price">${eur(item.net)}</span></span>
      </label>
      <div class="field vh-qty-field" ${on ? "" : "hidden"}>
        <label>Menge</label>
        <input type="number" data-role="acc-qty" min="1" step="1" value="${on ? qty : 1}" placeholder="1">
      </div>
    </div>`;
  };

  const statsHtml = () => {
    const lines = getLines();
    const sum = lines.reduce((a, l) => a + l.net * l.qty, 0);
    const count = (m) => Object.values(m || {}).reduce((a, q) => a + (q > 0 ? q : 0), 0);
    const total = legValues(viewShape(), state.legs).reduce((a, b) => a + b, 0);
    return `
      <div class="vhc-stat"><span class="vhc-stat-label">Vorhangstangen</span><span><b>${count(state.rodQty)}</b> Stück</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Verbindungsbögen</span><span><b>${state.optionalQty[ART.bogen] || 0}</b> Stück</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Vorhanglänge</span><span><b>${total || "–"}</b> cm</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Material netto</span><span><b>${eur(sum)}</b></span></div>`;
  };
  const updateStats = () => {
    const el = mountEl.querySelector(".vhc-stats");
    if (el) el.innerHTML = statsHtml();
  };

  const render = () => {
    if (!catalog) {
      mountEl.innerHTML = `<div class="dac-loading">Produkte werden geladen …</div>`;
      return;
    }
    const shape = viewShape();
    const names = LEG_NAMES[shape];
    const chips = Object.entries(SHAPES)
      .map(([k, s]) => `<button type="button" class="vhc-chip" data-shape="${k}" aria-pressed="${k === shape}"><span>${s.label}</span><small>${CHIP_SUB[k]}</small></button>`)
      .join("");
    const rows = SHAPES[shape].legs
      .map((k, i) => `<label class="vhc-row" data-leg="${k}"><span class="vhc-dot">${i + 1}</span><span class="vhc-name">${names[k]}</span><input type="number" inputmode="decimal" min="1" max="2000" step="1" data-leg="${k}" value="${esc(state.legs?.[k] ?? "")}" placeholder="${k === "b" && shape === "u" ? 120 : 90}"><span class="vhc-unit">cm</span></label>`)
      .join("");
    const section = (title, items, kind) =>
      items.length
        ? `<div class="vh-section"><div class="vh-step-title">${title}</div><div class="vh-grid vh-acc-grid">${items.map((it) => tile(it, kind)).join("")}</div></div>`
        : "";

    mountEl.innerHTML = `
      <div class="field">
        <label class="check-pill"><input type="checkbox" id="vh-enable" ${state.enabled ? "checked" : ""} /><span class="box"></span><span>Duschvorhang zum Angebot hinzufügen</span></label>
      </div>
      <div class="vh-body${state.enabled ? "" : " is-disabled"}" aria-disabled="${state.enabled ? "false" : "true"}">
        <div class="vhc">
          <div class="vhc-head">
            <h3>Vorhang-Situation</h3>
            <p class="vhc-note">Situation wählen und die Seitenlängen eintragen — Vorhang, Stangen, Bögen und Befestigung werden vorgeschlagen. Alle Mengen bleiben änderbar.</p>
          </div>
          <div class="vhc-chips" role="group" aria-label="Vorhang-Situation">${chips}</div>
          <div class="vhc-main">
            <div class="vhc-stage">${drawSvg()}</div>
            <div class="vhc-side">
              <div class="vhc-rows">${rows}</div>
              <ul class="vhc-legend">
                <li><i class="vhc-lg vhc-lg--rod"></i>Vorhangstange (vor Ort gekürzt)</li>
                <li><i class="vhc-lg vhc-lg--corner"></i>Verbindungsbogen + Deckenstütze</li>
                <li><i class="vhc-lg vhc-lg--ros"></i>Wandbefestigung (Rosette)</li>
              </ul>
            </div>
          </div>
          <div class="vhc-stats">${statsHtml()}</div>
        </div>
        ${section("Duschvorhang", catalog.curtains, "curtain")}
        ${section("Vorhangstangen", catalog.rods, "rod")}
        ${section("Erforderliche Befestigung", catalog.mandatory || [], "rosette")}
        ${section("Zubehör", catalog.optional || [], "opt")}
      </div>`;
    wire();
  };

  const replan = () => {
    state.shape = viewShape();
    applyPlan(state, catalog);
    render();
    refreshOffer();
  };

  const wire = () => {
    mountEl.querySelector("#vh-enable")?.addEventListener("change", (e) => {
      state.enabled = e.target.checked;
      render();
      refreshOffer();
    });

    mountEl.querySelectorAll(".vhc-chip").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (state.shape === btn.dataset.shape) return;
        state.shape = btn.dataset.shape;
        replan();
      }),
    );

    const svg = mountEl.querySelector(".vhc-svg");
    const focusLeg = (k) => {
      svg?.classList.toggle("vhc-has-focus", !!k);
      svg?.querySelectorAll("[data-leg]").forEach((el) => el.classList.toggle("vhc-on", el.dataset.leg === k));
    };
    mountEl.querySelectorAll(".vhc-row input").forEach((inp) => {
      inp.addEventListener("focus", () => focusLeg(inp.dataset.leg));
      inp.addEventListener("blur", () => focusLeg(null));
      inp.addEventListener("change", () => {
        const v = Number(inp.value);
        state.legs = { ...state.legs, [inp.dataset.leg]: Number.isFinite(v) && v > 0 ? Math.round(v) : null };
        replan();
      });
    });

    // item tiles — every group shares the same toggle + Menge logic
    mountEl.querySelectorAll(".vh-acc").forEach((row) => {
      const art = row.dataset.art;
      const key = QTY_MAP[row.dataset.kind];
      const cb = row.querySelector('input[data-role="acc-toggle"]');
      const qtyField = row.querySelector(".vh-qty-field");
      const qtyInput = row.querySelector('input[data-role="acc-qty"]');
      cb?.addEventListener("change", () => {
        state[key] = state[key] || {};
        state[key][art] = cb.checked ? Math.max(1, Number(qtyInput?.value) || 1) : 0;
        if (qtyField) qtyField.hidden = !cb.checked;
        updateStats();
        refreshOffer();
      });
      qtyInput?.addEventListener("change", () => {
        if (cb?.checked) {
          state[key][art] = Math.max(1, Number(qtyInput.value) || 1);
          updateStats();
          refreshOffer();
        }
      });
    });
  };

  // ---- lines (consumed by the offer) --------------------------------------
  const getLines = () => buildLines(state, catalog);

  window.__vorhangConfigurator = {
    getLines,
    getConfigLabel: () => configLabel(state.shape, state.legs),
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    // Clears back to the fresh boot state (nothing added, mandatory preselected).
    // Called by resetAllForms() when starting a NEW offer so the previous offer's
    // selection does not leak in. Drafts use restore() instead.
    reset() {
      state = fromSaved(null);
      initMandatory();
      render();
      refreshOffer();
    },
    restore(saved) {
      if (!saved || typeof saved !== "object") return;
      state = fromSaved(saved);
      // back-compat: legacy saved offers used a boolean rosetteOn
      if (!state.mandatoryQty) {
        state.mandatoryQty = {};
        if (saved.rosetteOn !== false) initMandatory();
      }
      render();
      refreshOffer();
    },
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
