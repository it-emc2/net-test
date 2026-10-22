// vorhang.js — "Duschvorhang" configurator tab.
// Loaded as an external module (CSP blocks inline scripts).
// The user picks the situation (Nische / Ecke / U-Form) and enters the side
// lengths; vorhang-plan.js proposes curtain, rods, Bögen, Kupplungen,
// Deckenstützen and Befestigung — every quantity stays editable. Selected net
// lines flow into the offer via window.__vorhangConfigurator.getLines(),
// consumed by buildPayload() (collectDuschvorhangConfigurator in script.js).

import { SHAPES, ART, legValues, configLabel, planParts, applyPlan, fromSaved, buildLines, curtainLabel } from "./vorhang-plan.js";

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

  // ---- 3D drawing ---------------------------------------------------------
  // Same axonometric view as the WV Keramico Bedarfsrechner: x runs along the
  // back wall, y is height, z comes towards the viewer. Everything is drawn at
  // its real length (preview lengths while a side is empty) and the camera
  // fits the scene into the stage, so the picture grows and shrinks with input.
  const TONES = ["#b06a32", "#54748f", "#5f8a5f"]; // side 1, 2, 3 — as in WV
  const PREVIEW_CM = { nische: [120], ecke: [90, 90], u: [90, 120, 90] };
  const WALL_H = 150, ROD_Y = 140, HEM_Y = 12, DEFAULT_DEPTH = 90; // drawn heights, stylised (not to scale)
  const AX = [0.9, 0.12], DEPTH = [-0.55, 0.32];
  const VIEW = { w: 460, h: 320 };

  // Scene per shape from the side lengths: walls, tray, rod polyline (3D).
  const scene = (shape, L) => {
    if (shape === "ecke") {
      const [W, D] = L;
      return { walls: [[[0, 0], [W, 0]], [[0, 0], [0, D]]], floor: [[0, 0], [W, 0], [W, D], [0, D]], rod: [[0, D], [W, D], [W, 0]] };
    }
    if (shape === "u") {
      const [dl, W, dr] = L;
      return { walls: [[[0, 0], [W, 0]]], floor: [[0, 0], [W, 0], [W, dr], [0, dl]], rod: [[0, 0], [0, dl], [W, dr], [W, 0]] };
    }
    const [W] = L;
    const D = DEFAULT_DEPTH;
    return { walls: [[[0, 0], [W, 0]], [[0, 0], [0, D]], [[W, 0], [W, D]]], floor: [[0, 0], [W, 0], [W, D], [0, D]], rod: [[0, D], [W, D]] };
  };

  const drawSvg = () => {
    const shape = viewShape();
    const keys = SHAPES[shape].legs;
    const vals = legValues(shape, state.legs);
    const L = vals.map((v, i) => Math.max(30, v > 0 ? v : PREVIEW_CM[shape][i]));
    const rodsPerLeg = planParts(shape, state.legs, catalog).rodsPerLeg;
    const sc = scene(shape, L);

    // fit: project every corner at scale 1, then scale + centre (capped so a
    // short Nische doesn't fill the whole stage)
    const raw = (x, y, z) => [x * AX[0] + z * DEPTH[0], -y + x * AX[1] + z * DEPTH[1]];
    const all = [...sc.floor, ...sc.walls.flat()].flatMap(([x, z]) => [raw(x, 0, z), raw(x, WALL_H, z)]);
    const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
    const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
    const s = Math.min((VIEW.w - 70) / (maxX - minX), (VIEW.h - 30) / (maxY - minY), 1.6);
    const ox = (VIEW.w - (maxX - minX) * s) / 2 - minX * s, oy = (VIEW.h - (maxY - minY) * s) / 2 - minY * s;
    const P = (x, y, z) => { const [a, b] = raw(x, y, z); return [ox + a * s, oy + b * s]; };
    const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

    let out = `<polygon class="vhc-floor" points="${pts(sc.floor.map(([x, z]) => P(x, 0, z)))}"/>`;
    for (const [[x1, z1], [x2, z2]] of sc.walls) {
      out += `<polygon class="vhc-wallp" points="${pts([P(x1, 0, z1), P(x2, 0, z2), P(x2, WALL_H, z2), P(x1, WALL_H, z1)])}"/>`;
    }

    const badges = [];
    for (let i = 0; i < sc.rod.length - 1; i++) {
      const a = sc.rod[i], b = sc.rod[i + 1], k = keys[i], tone = TONES[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // curtain: one fabric panel per side, folds every ~12 cm
      let g = `<polygon class="vhc-curtain" style="--tone:${tone}" points="${pts([P(a[0], ROD_Y, a[1]), P(b[0], ROD_Y, b[1]), P(b[0], HEM_Y, b[1]), P(a[0], HEM_Y, a[1])])}"/>`;
      const folds = Math.max(2, Math.round(len / 12));
      for (let f = 1; f < folds; f++) {
        const [x, z] = lerp(a, b, f / folds);
        const t = P(x, ROD_Y - 2, z), u = P(x, HEM_Y + 2, z);
        g += `<line class="vhc-fold" style="--tone:${tone}" x1="${t[0].toFixed(1)}" y1="${t[1].toFixed(1)}" x2="${u[0].toFixed(1)}" y2="${u[1].toFixed(1)}"/>`;
      }
      // rods: n pieces joined by Kupplungen
      const n = Math.max(1, rodsPerLeg[i] || 0);
      const gap = 5 / Math.max(len, 1);
      for (let j = 0; j < n; j++) {
        const p1 = lerp(a, b, j / n + (j > 0 ? gap : 0)), p2 = lerp(a, b, (j + 1) / n - (j < n - 1 ? gap : 0));
        const q1 = P(p1[0], ROD_Y, p1[1]), q2 = P(p2[0], ROD_Y, p2[1]);
        g += `<line class="vhc-rod" x1="${q1[0].toFixed(1)}" y1="${q1[1].toFixed(1)}" x2="${q2[0].toFixed(1)}" y2="${q2[1].toFixed(1)}"/>`;
      }
      for (let j = 1; j < n; j++) {
        const [x, z] = lerp(a, b, j / n), c = P(x, ROD_Y, z);
        g += `<circle class="vhc-joint" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="5.5"/>`;
      }
      out += `<g class="vhc-seg" data-leg="${k}">${g}</g>`;

      const [mx, mz] = lerp(a, b, 0.5), m = P(mx, ROD_Y * 0.55, mz);
      const txt = vals[i] > 0 ? `${vals[i]} cm${n > 1 ? ` · ${n}×` : ""}` : "– cm";
      const bw = n > 1 ? 112 : 84;
      badges.push(`<g class="vhc-badge" data-leg="${k}"><rect x="${(m[0] - bw / 2).toFixed(1)}" y="${(m[1] - 15).toFixed(1)}" width="${bw}" height="30" rx="15"/><circle cx="${(m[0] - bw / 2 + 15).toFixed(1)}" cy="${m[1].toFixed(1)}" r="10" style="fill:${tone}"/><text class="vhc-badge-n" x="${(m[0] - bw / 2 + 15).toFixed(1)}" y="${(m[1] + 4).toFixed(1)}">${i + 1}</text><text class="vhc-badge-t" x="${(m[0] + 9).toFixed(1)}" y="${(m[1] + 4.5).toFixed(1)}">${txt}</text></g>`);
    }
    // corners: Verbindungsbogen + Deckenstütze up to the ceiling; ends: wall rosettes
    for (const [x, z] of sc.rod.slice(1, -1)) {
      const c = P(x, ROD_Y, z), top = P(x, WALL_H + 22, z);
      out += `<line class="vhc-support" x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${top[0].toFixed(1)}" y2="${top[1].toFixed(1)}"/><circle class="vhc-corner" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="6.5"/>`;
    }
    for (const [x, z] of [sc.rod[0], sc.rod[sc.rod.length - 1]]) {
      const c = P(x, ROD_Y, z);
      out += `<rect class="vhc-rosette" x="${(c[0] - 5).toFixed(1)}" y="${(c[1] - 5).toFixed(1)}" width="10" height="10" rx="2"/>`;
    }
    const empty = !vals.some((v) => v > 0);
    return `<svg class="vhc-svg${empty ? " vhc-svg--empty" : ""}" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="Ansicht ${esc(SHAPES[shape].label)}">${out}${badges.join("")}</svg>`;
  };

  // ---- tiles --------------------------------------------------------------
  // An item tile: a checkbox .image-check card (identical to the Optional tab),
  // with a Menge .field below. kind selects the qty map.
  const QTY_MAP = { curtain: "curtainQty", rod: "rodQty", rosette: "mandatoryQty", opt: "optionalQty" };
  const tile = (item, kind) => {
    const qty = state[QTY_MAP[kind]]?.[item.articleNumber] || 0;
    const on = qty > 0;
    const caption = kind === "curtain" && item.sizeCm != null ? curtainLabel(item) : item.packNote ? `${item.name} (${item.packNote})` : item.name;
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

  // Stats are always written with their final value; countUp() only animates
  // the visible digits from the previous value (as in the WV calculator).
  const STAT_FMT = { rods: String, bogen: String, len: (v) => (v ? String(v) : "–"), sum: eur };
  const statsHtml = () => {
    const lines = getLines();
    const sum = lines.reduce((a, l) => a + l.net * l.qty, 0);
    const count = (m) => Object.values(m || {}).reduce((a, q) => a + (q > 0 ? q : 0), 0);
    const total = legValues(viewShape(), state.legs).reduce((a, b) => a + b, 0);
    const b = (key, v) => `<b data-count="${key}" data-v="${v}">${STAT_FMT[key](v)}</b>`;
    return `
      <div class="vhc-stat"><span class="vhc-stat-label">Vorhangstangen</span><span>${b("rods", count(state.rodQty))} Stück</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Verbindungsbögen</span><span>${b("bogen", state.optionalQty[ART.bogen] || 0)} Stück</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Vorhanglänge</span><span>${b("len", total)} cm</span></div>
      <div class="vhc-stat"><span class="vhc-stat-label">Material netto</span><span>${b("sum", Math.round(sum * 100) / 100)}</span></div>`;
  };

  const shownStats = {}; // last value per stat, the start of the next count
  const countUp = () => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    mountEl.querySelectorAll(".vhc-stats b[data-count]").forEach((el) => {
      const key = el.dataset.count, to = Number(el.dataset.v), fmt = STAT_FMT[key];
      const from = shownStats[key];
      shownStats[key] = to;
      if (from == null || from === to || still) return;
      const t0 = performance.now();
      const step = (t) => {
        if (!el.isConnected || el.dataset.v !== String(to)) return;
        const k = Math.min(1, (t - t0) / 320);
        const v = from + (to - from) * (1 - (1 - k) ** 3);
        el.textContent = fmt(key === "sum" ? Math.round(v * 100) / 100 : Math.round(v));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // guarantees the exact final value even if frames don't run (background tab)
      setTimeout(() => { if (el.isConnected) el.textContent = fmt(to); }, 380);
    });
  };

  const updateStats = () => {
    const el = mountEl.querySelector(".vhc-stats");
    if (el) el.innerHTML = statsHtml();
    countUp();
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
      .map((k, i) => `<label class="vhc-row" data-leg="${k}"><span class="vhc-dot" style="background:${TONES[i]}">${i + 1}</span><span class="vhc-name">${names[k]}</span><input type="number" inputmode="decimal" min="1" max="2000" step="1" data-leg="${k}" value="${esc(state.legs?.[k] ?? "")}" placeholder="${k === "b" && shape === "u" ? 120 : 90}"><span class="vhc-unit">cm</span></label>`)
      .join("");
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
                <li><i class="vhc-lg vhc-lg--joint"></i>Kupplung (zwei Stangen verbunden)</li>
                <li><i class="vhc-lg vhc-lg--ros"></i>Wandbefestigung (Rosette)</li>
              </ul>
            </div>
          </div>
          <div class="vhc-stats">${statsHtml()}</div>
        </div>
        <div class="vh-tiles">${tilesHtml()}</div>
      </div>`;
    wire();
    countUp();
  };

  const tilesHtml = () => {
    const section = (title, items, kind) =>
      items.length
        ? `<div class="vh-section"><div class="vh-step-title">${title}</div><div class="vh-grid vh-acc-grid">${items.map((it) => tile(it, kind)).join("")}</div></div>`
        : "";
    return `
        ${section("Duschvorhang", catalog.curtains, "curtain")}
        ${section("Vorhangstangen", catalog.rods, "rod")}
        ${section("Erforderliche Befestigung", catalog.mandatory || [], "rosette")}
        ${section("Zubehör", catalog.optional || [], "opt")}`;
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

    // Side lengths update live while typing (iPad: no blur needed). Only the
    // drawing, stats and tiles are redrawn, so the input keeps focus + keyboard.
    let typingTimer = null;
    mountEl.querySelectorAll(".vhc-row input").forEach((inp) => {
      const commit = () => {
        clearTimeout(typingTimer);
        const v = Number(inp.value);
        const next = Number.isFinite(v) && v > 0 ? Math.round(v) : null;
        if ((state.legs?.[inp.dataset.leg] ?? null) === next && state.shape) return;
        state.legs = { ...state.legs, [inp.dataset.leg]: next };
        state.shape = viewShape();
        applyPlan(state, catalog);
        refreshParts();
        refreshOffer();
      };
      inp.addEventListener("focus", () => focusLeg(inp.dataset.leg));
      inp.addEventListener("blur", () => focusLeg(null));
      inp.addEventListener("input", () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(commit, 300);
      });
      inp.addEventListener("change", commit);
    });

    wireTiles();
  };

  // highlight one side in the drawing (the one being typed)
  const focusLeg = (k) => {
    const svg = mountEl.querySelector(".vhc-svg");
    svg?.classList.toggle("vhc-has-focus", !!k);
    svg?.querySelectorAll("[data-leg]").forEach((el) => el.classList.toggle("vhc-on", el.dataset.leg === k));
  };

  const refreshParts = () => {
    const stage = mountEl.querySelector(".vhc-stage");
    if (stage) stage.innerHTML = drawSvg();
    const tiles = mountEl.querySelector(".vh-tiles");
    if (tiles) tiles.innerHTML = tilesHtml();
    updateStats();
    wireTiles();
    const active = document.activeElement;
    if (active && mountEl.contains(active) && active.dataset?.leg) focusLeg(active.dataset.leg);
  };

  // item tiles — every group shares the same toggle + Menge logic
  const wireTiles = () => {
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
