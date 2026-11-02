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

  // ---- product rows ---------------------------------------------------------
  // iOS grouped lists like Duschwanne / Wandverkleidung: one row per article with
  // a switch, and a − n + stepper while it is on. kind selects the qty map.
  const QTY_MAP = { curtain: "curtainQty", rod: "rodQty", rosette: "mandatoryQty", opt: "optionalQty" };
  const isCeiling = (art) => /^DEPDS\d+$/.test(art);
  let showAll = false; // "Andere Größe oder Länge" opened
  const qtyOf = (kind, art) => Number(state[QTY_MAP[kind]]?.[art]) || 0;
  const titleOf = (item, kind) =>
    kind === "curtain" && item.sizeCm != null ? curtainLabel(item) : item.packNote ? `${item.name} (${item.packNote})` : item.name;

  const row = (item, kind, sub = "", extra = "") => {
    const qty = qtyOf(kind, item.articleNumber);
    const on = qty > 0;
    return `
    <div class="vh-item" role="button" tabindex="0" aria-pressed="${on}" data-kind="${kind}" data-art="${esc(item.articleNumber)}">
      <span class="vh-item__img">${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy">` : ""}</span>
      <span class="vh-item__text"><strong>${esc(titleOf(item, kind))}</strong><small>${esc([item.articleNumber, sub, eur(item.net)].filter(Boolean).join(" · "))}</small></span>
      ${extra}
      ${on ? `<span class="ios-stepper"><button type="button" data-step="-1" aria-label="Weniger">−</button><input type="number" min="1" step="1" value="${qty}" data-role="acc-qty" aria-label="Menge"><button type="button" data-step="1" aria-label="Mehr">+</button></span>` : ""}
      <span class="vh-switch${on ? " is-on" : ""}" aria-hidden="true"></span>
    </div>`;
  };

  // Deckenstütze 30 / 50 / 80 cm as one row: the segment picks which article
  // carries the quantity.
  const ceilingRow = () => {
    const all = (catalog.optional || []).filter((o) => isCeiling(o.articleNumber)).sort((x, y) => x.articleNumber.localeCompare(y.articleNumber, "de", { numeric: true }));
    if (!all.length) return "";
    const cur = all.find((o) => qtyOf("opt", o.articleNumber) > 0) || all.find((o) => o.articleNumber === "DEPDS50") || all[0];
    const seg = `<span class="vh-seg" role="group" aria-label="Länge Deckenstütze">${all
      .map((o) => `<button type="button" data-ceiling="${esc(o.articleNumber)}" aria-pressed="${o === cur}">${String(o.articleNumber).replace(/\D/g, "")}</button>`)
      .join("")}<span class="vh-seg__unit">cm</span></span>`;
    return row({ ...cur, name: "Deckenstütze" }, "opt", "1 je Ecke", seg);
  };

  const SUB = { DEPVSROS: "immer nötig", DEPVSBO: "1 je Ecke", DEPVSK: "verbindet zwei Stangen auf einer Seite" };
  const productsHtml = () => {
    const pick = (list, kind) => (list || []).filter((x) => qtyOf(kind, x.articleNumber) > 0);
    const rest = (list, kind) => (list || []).filter((x) => !(qtyOf(kind, x.articleNumber) > 0));
    const chosen = [...pick(catalog.curtains, "curtain").map((c) => row(c, "curtain", "uni weiß")), ...pick(catalog.rods, "rod").map((r) => row(r, "rod", "verchromt"))];
    const others = [...rest(catalog.curtains, "curtain").map((c) => row(c, "curtain", "uni weiß")), ...rest(catalog.rods, "rod").map((r) => row(r, "rod", "verchromt"))];
    const acc = [
      ...(catalog.mandatory || []).map((m) => row(m, "rosette", SUB[m.articleNumber] || "")),
      ...(catalog.optional || []).filter((o) => !isCeiling(o.articleNumber) && o.articleNumber !== ART.rings).map((o) => row(o, "opt", SUB[o.articleNumber] || "")),
      ceilingRow(),
      ...(catalog.optional || []).filter((o) => o.articleNumber === ART.rings).map((o) => row(o, "opt")),
    ];
    return `
      <h4 class="vh-label">Vorhang und Stangen</h4>
      <div class="vh-group">
        ${chosen.join("") || `<div class="vh-hint">Seitenlängen eintragen – Vorhang und Stangen werden vorgeschlagen.</div>`}
        <button type="button" class="vh-more" aria-expanded="${showAll}">${showAll ? "Weitere Größen ausblenden" : "Andere Größe oder Länge wählen"}</button>
        ${showAll ? others.join("") : ""}
      </div>
      <h4 class="vh-label">Befestigung und Zubehör</h4>
      <div class="vh-group">${acc.join("")}</div>`;
  };

  const stockBadge = (item) => {
    if (!item || (item.stockQuantity == null && item.stockText == null)) return "";
    const n = Number(item.stockQuantity) || 0;
    return `<span class="dac-line-stock ${n > 0 ? "dac-stock-in" : "dac-stock-out"}" title="${esc(item.stockText || "")}"><span class="dac-stock-qty">${n}</span>${n > 0 ? "Auf Lager" : "Auf Bestellung"}</span>`;
  };
  const itemByArt = (art) =>
    [...(catalog.curtains || []), ...(catalog.rods || []), ...(catalog.mandatory || []), ...(catalog.optional || [])].find((x) => x.articleNumber === art);

  // "Ihre Auswahl": the situation, one row per article (stock, price), total.
  const summaryHtml = () => {
    const lines = getLines();
    if (!lines.length) return "";
    const sum = lines.reduce((a, l) => a + l.net * l.qty, 0);
    const total = legValues(viewShape(), state.legs).reduce((a, b) => a + b, 0);
    const cfg = configLabel(state.shape, state.legs);
    const head = cfg
      ? `<div class="vh-sum-head"><strong>${esc(cfg)}</strong><small>Vorhanglänge ${total} cm</small></div>`
      : "";
    return `
      <h4 class="vh-label">Ihre Auswahl</h4>
      <div class="vh-group">
        ${head}
        ${lines
          .map((l) => `<div class="vh-line"><span class="vh-line__name">${l.qty > 1 ? `${l.qty} × ` : ""}${esc(l.label.replace(/ \((Nische|Ecke|U-Form) [^)]*\)$/, ""))}<small>${esc(l.articleNumber)}</small></span>${stockBadge(itemByArt(l.articleNumber))}<span class="vh-line__price">${eur(l.net * l.qty)}</span></div>`)
          .join("")}
        <div class="vh-line vh-total"><span>Gesamt (netto)</span><span>${eur(Math.round(sum * 100) / 100)}</span></div>
      </div>`;
  };

  const render = () => {
    if (!catalog) {
      mountEl.innerHTML = `<div class="dac-loading">Produkte werden geladen …</div>`;
      return;
    }
    const shape = viewShape();
    const names = LEG_NAMES[shape];
    const seg = Object.entries(SHAPES)
      .map(([k, s]) => `<button type="button" data-shape="${k}" aria-pressed="${k === shape}">${s.label}</button>`)
      .join("");
    const rows = SHAPES[shape].legs
      .map((k, i) => `<label class="vh-row vhc-row" data-leg="${k}"><span class="vhc-dot" style="background:${TONES[i]}">${i + 1}</span><span class="vh-row__k">${names[k]}</span><input type="number" inputmode="decimal" min="1" max="2000" step="1" data-leg="${k}" value="${esc(state.legs?.[k] ?? "")}" placeholder="${k === "b" && shape === "u" ? 120 : 90}"><span class="vhc-unit">cm</span></label>`)
      .join("");
    // On/off is the page's section switch (#vorhangToggle, script.js), which
    // calls setEnabled(true) — no second checkbox here.
    mountEl.innerHTML = `
      <div class="vh-body${state.enabled ? "" : " is-disabled"}" aria-disabled="${state.enabled ? "false" : "true"}">
        <h4 class="vh-label">Situation</h4>
        <div class="vh-group">
          <div class="vh-row"><span class="vh-row__k">Form</span><span class="vh-seg vhc-shapes" role="group" aria-label="Vorhang-Situation">${seg}</span></div>
          <div class="vhc-stage">${drawSvg()}</div>
          ${rows}
          <div class="vh-legend">
            <span><i class="vhc-lg vhc-lg--rod"></i>Stange (vor Ort gekürzt)</span>
            <span><i class="vhc-lg vhc-lg--corner"></i>Bogen + Deckenstütze</span>
            <span><i class="vhc-lg vhc-lg--joint"></i>Kupplung</span>
            <span><i class="vhc-lg vhc-lg--ros"></i>Rosette</span>
          </div>
        </div>
        <div class="vh-products">${productsHtml()}</div>
        <div class="vh-summary">${summaryHtml()}</div>
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
    mountEl.querySelectorAll(".vhc-shapes button").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (state.shape === btn.dataset.shape) return;
        state.shape = btn.dataset.shape;
        replan();
      }),
    );

    // Side lengths update live while typing (iPad: no blur needed). Only the
    // drawing, products and summary are redrawn, so the input keeps focus + keyboard.
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

    wireProducts();
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
    const products = mountEl.querySelector(".vh-products");
    if (products) products.innerHTML = productsHtml();
    const summary = mountEl.querySelector(".vh-summary");
    if (summary) summary.innerHTML = summaryHtml();
    wireProducts();
    const active = document.activeElement;
    if (active && mountEl.contains(active) && active.dataset?.leg) focusLeg(active.dataset.leg);
  };

  const changed = () => {
    refreshParts();
    refreshOffer();
  };

  // Rows: a tap switches the article on (qty 1) / off; the stepper and the
  // Deckenstütze segment work inside the row without switching it.
  const wireProducts = () => {
    mountEl.querySelectorAll(".vh-item").forEach((el) => {
      const key = QTY_MAP[el.dataset.kind];
      const art = el.dataset.art;
      const toggle = () => {
        state[key] = state[key] || {};
        state[key][art] = (Number(state[key][art]) || 0) > 0 ? 0 : 1;
        changed();
      };
      el.addEventListener("click", (e) => {
        if (e.target.closest(".ios-stepper, .vh-seg")) return;
        toggle();
      });
      el.addEventListener("keydown", (e) => {
        if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); }
      });
      el.querySelector('input[data-role="acc-qty"]')?.addEventListener("change", (e) => {
        state[key][art] = Math.max(1, Math.floor(Number(e.target.value) || 1));
        changed();
      });
    });
    // Deckenstütze length: move the quantity to the picked article
    mountEl.querySelectorAll("[data-ceiling]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const opt = state.optionalQty;
        const cur = Object.keys(opt).find((a) => isCeiling(a) && opt[a] > 0);
        const qty = cur ? opt[cur] : 0;
        Object.keys(opt).filter(isCeiling).forEach((a) => (opt[a] = 0));
        opt[btn.dataset.ceiling] = qty || 1; // picking a length switches it on
        changed();
      }),
    );
    mountEl.querySelector(".vh-more")?.addEventListener("click", () => {
      showAll = !showAll;
      refreshParts();
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
    // The section switch turns the curtain on. Off is handled by the switch
    // (lines kept out of the offer), so the selection survives a save.
    setEnabled(on) {
      if (state.enabled === !!on) return;
      state.enabled = !!on;
      render();
      refreshOffer();
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
