// configurator-ui.js
// Project-styled mount for the ported GC/Hassmann Duschabtrennung configurator.
// Net-only. Single-step GC-style flow (structure → finish → per-component size),
// a breadcrumb of answered steps (click to change), and a running line-item summary.
// Engine logic lives in ./engine.js (ported verbatim from EMC2-scraper, framework-free).
import * as w from "./engine.js";
import { specFor, sketchSVG, attachSketch } from "./badolux-sketch.js";

const euro = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );

// Verbreiterungsprofil — VIGOUR catalog category "verbreiterungsprofil" (10 articles).
// These are NOT part of the wizard's leaf/component tree, so they can't be resolved by
// the engine; they are picked by hand after the sizes and appended as ordinary net lines.
// Prices are the vigor DB netPrice (matt vs. "HL" = silber hochglanz). Sorted by article
// number. HL variants reuse the matt variant's image (identical profile, other finish).
// Only VZVP1195 is live for now — uncomment a row to switch the others on.
const EXTRAS = [
  { articleNumber: "VZVP1195", name: "Verbreiterung 1 für V2 Gleittür um 26 mm", finishText: "1950 mm silber matt VIGOUR", net: 49.27, gros: 75.8, image: "VZVP1195.jpg" },
  // { articleNumber: "VZVP1195HL", name: "Verbreiterung 1 für V2 Gleittür um 26 mm", finishText: "1950 mm silber hochglanz VIGOUR", net: 60.84, gros: 93.6, image: "VZVP1195.jpg" },
  // { articleNumber: "VZVP2195", name: "Verbreiterung V2 Seitenwände um 34 mm", finishText: "H:1950 mm silber matt VIGOUR", net: 48.49, gros: 74.6, image: "VZVP2195.jpg" },
  // { articleNumber: "VZVP2195HL", name: "Verbreiterung V2 Seitenwände um 34 mm", finishText: "H:1950 mm silber hochglanz VIGOUR", net: 60.06, gros: 92.4, image: "VZVP2195.jpg" },
  // { articleNumber: "VZVP3195", name: "Verbreiterung 3 für V2 PT/FP um 10 mm", finishText: "1950 mm silber matt VIGOUR", net: 49.27, gros: 75.8, image: "VZVP3195.jpg" },
  // { articleNumber: "VZVP3195HL", name: "Verbreiterung 3 für V2 PT/FP um 10 mm", finishText: "1950 mm silber hochglanz VIGOUR", net: 60.84, gros: 93.6, image: "VZVP3195.jpg" },
  // { articleNumber: "VZVP4195", name: "Verbreiterung 4 für V2 PT m. FF um 36 mm", finishText: "1950 mm silber matt VIGOUR", net: 49.27, gros: 75.8, image: "VZVP4195.jpg" },
  // { articleNumber: "VZVP4195HL", name: "Verbreiterung 4 für V2 PT m. FF um 36 mm", finishText: "1950 mm silber hochglanz VIGOUR", net: 60.84, gros: 93.6, image: "VZVP4195.jpg" },
  // { articleNumber: "VZVP6195", name: "Verbreiterung 6 Magnetleiste um 19,2 mm", finishText: "1950 mm silber matt VIGOUR", net: 49.27, gros: 75.8, image: "VZVP6195.jpg" },
  // { articleNumber: "VZVP6195HL", name: "Verbreiterung 6 Magnetleiste um 19,2 mm", finishText: "1950 mm silber hochglanz VIGOUR", net: 60.84, gros: 93.6, image: "VZVP6195.jpg" },
];

// Viertelkreis-Duschwanne — hand-picked matching shower trays, not part of the wizard's
// leaf/component tree (like the Verbreiterungsprofil EXTRAS above). Keyed by [radius][doorWidth];
// each entry's own `label` is the color/model, `heightCm` is the tray's rim height (display-only —
// not a selectable dimension, VIGOUR doesn't offer a choice here).
const DUSCHWANNEN = {
  500: {
    800: [
      { articleNumber: "ONAE80SF", label: "Weiß (Acryl one)", heightCm: 6.5, finishText: "Radius 50cm weiss VIGOUR", net: 105.53, gros: 234.5, image: "Duschwanne-onae80sf.jpg", stockQuantity: 0, stockText: "Ware im Nachtverbund Markt Schwaben (vorbehaltlich Prüfung) verfügbar, bei Bestellung bis 18:00 Uhr" },
    ],
    900: [
      { articleNumber: "PURAE90", label: "Weiß (Hüppe Purano)", heightCm: 4.0, finishText: "Radius 50cm weiss", net: 376.38, gros: 651, image: "Duschwanne-purae90.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
    ],
    1000: [
      { articleNumber: "ZIRKO100EF", label: "Weiß (Kaldewei Zirkon)", heightCm: 3.5, finishText: "weiss Kaldewei", net: 611.35, gros: 891, image: "Duschwanne-zirko100ef.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
    ],
  },
  550: {
    900: [
      { articleNumber: "V3ME90AN", label: "Anthrazit matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus anth. matt VIGOUR", net: 296.4, gros: 494, image: "Duschwanne-anthrazit.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME90BG", label: "Beige matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus beige matt VIGOUR", net: 296.4, gros: 494, image: "Duschwanne-beige.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME90GR", label: "Grau matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus grau matt VIGOUR", net: 296.4, gros: 494, image: "Duschwanne-grau.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME90SM", label: "Schwarz matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus schw. matt VIGOUR", net: 296.4, gros: 494, image: "Duschwanne-schwarz.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME90SP", label: "Weiß matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus weiss matt VIGOUR", net: 269.4, gros: 449, image: "Duschwanne-weiss.jpg", stockQuantity: 9, stockText: "Der Artikel ist im Lager verfügbar. Der Bestand beträgt 9 Stück." },
    ],
    1000: [
      { articleNumber: "V3ME100AN", label: "Anthrazit matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus anth. matt VIGOUR", net: 309.6, gros: 516, image: "Duschwanne-anthrazit.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME100BG", label: "Beige matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus beige matt VIGOUR", net: 309.6, gros: 516, image: "Duschwanne-beige.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME100GR", label: "Grau matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus grau matt VIGOUR", net: 309.6, gros: 516, image: "Duschwanne-grau.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME100SM", label: "Schwarz matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus schw. matt VIGOUR", net: 309.6, gros: 516, image: "Duschwanne-schwarz.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
      { articleNumber: "V3ME100SP", label: "Weiß matt", heightCm: 3.0, finishText: "Rad. 55cm SafeStepPlus weiss matt VIGOUR", net: 281.4, gros: 469, image: "Duschwanne-weiss.jpg", stockQuantity: 0, stockText: "Die Ware ist aktuell nicht verfügbar und muss bestellt werden." },
    ],
  },
};

function duschwannenDisplayName(d, widthMm) {
  const widthCm = widthMm / 10;
  const height = d.heightCm.toLocaleString("de-DE", { minimumFractionDigits: 1 });
  return `Viertelkreis-Duschwanne ${widthCm}×${widthCm}×${height} cm ${d.label}`;
}

export function mountConfigurator(el, model, options = {}) {
  // A saved card can be just {__supplier} (added, never configured) — give it the
  // empty selections/sizes the engine expects instead of failing to mount.
  let state = w.settle(model, { ...w.initialState(), ...(options.initialState || {}) });
  let pending = { width: null, height: null }; // in-progress component size
  // Drawings (picture tiles + live cabin) only for the stepwise Badolux model;
  // Vigour and the old one-step Badolux model keep their photos / text buttons.
  const drawings = model.supplier === "BADOLUX" && model.params.some((p) => p.id === "Einbausituation");
  let lastPicked = null; // param of the last option tap — the live drawing plays the door once
  const emit = (name, payload) => {
    if (typeof options[name] === "function") options[name](payload);
  };

  // --- Verbreiterungsprofil extras -------------------------------------------
  // Kept on the engine state (as `extras`) so getState()/initialState() persist and
  // restore them for free. Vigour-only articles → hidden for the BADOLUX model.
  const extrasAvailable = () => (model.supplier === "BADOLUX" ? [] : EXTRAS);
  const pickedExtras = () => {
    const ids = Array.isArray(state.extras) ? state.extras : [];
    return extrasAvailable().filter((e) => ids.includes(e.articleNumber));
  };
  function toggleExtra(articleNumber) {
    const ids = Array.isArray(state.extras) ? state.extras : [];
    state = {
      ...state,
      extras: ids.includes(articleNumber)
        ? ids.filter((x) => x !== articleNumber)
        : [...ids, articleNumber],
    };
    emit("onChange", state);
    render();
  }
  const extraQty = (articleNumber) =>
    Math.max(1, Math.floor(Number((state.extrasQty || {})[articleNumber]) || 1));
  function setExtraQty(articleNumber, qty) {
    state = { ...state, extrasQty: { ...(state.extrasQty || {}), [articleNumber]: qty } };
    emit("onChange", state);
    render();
  }

  // --- Viertelkreis-Duschwanne (matching shower tray) ------------------------
  // Available only for the current door's radius + width combination. Kept on the
  // engine state (as `duschwanne`, an articleNumber or null) next to `extras`, same
  // persistence story.
  function currentDoorWidth() {
    const leaf = w.resolvedLeaf(model, state);
    const c = leaf && leaf.components[0];
    const size = c && state.sizes[c.key];
    return size && !size.sondermass ? size.width : null;
  }
  const currentRadiusCat = () =>
    state.selections.Radius === "550mm" ? "550" : state.selections.Radius === "500mm" ? "500" : null;
  const duschwannenAvailable = () => {
    const radiusCat = currentRadiusCat();
    return radiusCat ? (DUSCHWANNEN[radiusCat] || {})[currentDoorWidth()] || [] : [];
  };
  const pickedDuschwanne = () =>
    duschwannenAvailable().find((d) => d.articleNumber === state.duschwanne) ?? null;
  function selectDuschwanne(articleNumber) {
    state = {
      ...state,
      duschwanne: state.duschwanne === articleNumber ? null : articleNumber,
    };
    emit("onChange", state);
    render();
  }

  /** Engine result plus the hand-picked extras/Duschwanne as ordinary lines (totals re-summed). */
  function resolved() {
    const cfg = w.resolveConfiguration(model, state);
    if (!cfg) return null;
    const picked = pickedExtras();
    const dw = pickedDuschwanne();
    const extraLines = picked.map((e) => ({
      component: e.name,
      key: "extra:" + e.articleNumber,
      qty: extraQty(e.articleNumber),
      article: {
        articleNumber: e.articleNumber,
        displayName: e.name,
        finishText: e.finishText,
        net: e.net,
        gros: e.gros,
        currency: cfg.currency,
      },
    }));
    if (dw) {
      const dwName = duschwannenDisplayName(dw, currentDoorWidth());
      extraLines.push({
        component: dwName,
        key: "duschwanne:" + dw.articleNumber,
        article: {
          articleNumber: dw.articleNumber,
          displayName: dwName,
          finishText: dw.finishText,
          net: dw.net,
          gros: dw.gros,
          currency: cfg.currency,
          stockQuantity: dw.stockQuantity,
          stockText: dw.stockText,
        },
      });
    }
    if (!extraLines.length) return cfg;
    const lines = cfg.lines.concat(extraLines);
    return {
      ...cfg,
      lines,
      net: lines.reduce((s, l) => s + l.article.net * (l.qty || 1), 0),
      gros: lines.reduce((s, l) => s + l.article.gros * (l.qty || 1), 0),
    };
  }

  // param metadata from structure params OR the resolved leaf's finish params
  function paramMeta(paramId) {
    const sp = model.params.find((x) => x.id === paramId);
    if (sp) return sp;
    return (
      w.finishParams(w.resolvedLeaf(model, state)).find((f) => f.id === paramId) ??
      null
    );
  }

  function chipFor(paramId) {
    const p = paramMeta(paramId);
    const val = state.selections[paramId];
    const label = p?.values.find((v) => v.value === val)?.label ?? val;
    return { paramLabel: p?.label ?? paramId, valueLabel: label };
  }

  // The "Duschabtrennung" structure param is the derived leaf identity — it's a
  // single-option step that settle() auto-applies, so it never appears as a
  // clickable step. Its value carries the leaf's product image, which we show
  // as a standing preview once it's set (mid-wizard, and in the summary).
  function leafPreview() {
    const p = model.params.find((x) => x.id === "Duschabtrennung");
    const val = state.selections["Duschabtrennung"];
    if (!p || val == null) return null;
    const v = p.values.find((x) => x.value === val);
    if (!v || !v.imageId || !imageUrl(v.imageId)) return null;
    return v;
  }

  // Product photos (article.image, attached server-side from vigor.products) for the
  // picked finish. Only Glasart + Profilfarbe are visible in a photo, so only those
  // must match (Beschichtung / Einzugsautomatik are ignored). Shown once every one of
  // those dims the component offers is picked — a photo with a guessed profile colour
  // is exactly the misleading preview this replaces. Prefers the picked size.
  const PHOTO_DIMS = { Glasart: "glasart", Profilfarbe: "profilfarbe" };
  function productImages() {
    const leaf = w.resolvedLeaf(model, state);
    if (!leaf) return [];
    const want = {};
    for (const fp of leaf.finish || []) {
      const dim = PHOTO_DIMS[fp.id];
      if (!dim) continue;
      want[dim] = fp.values.find((v) => v.value === state.selections[fp.id])?.cat ?? null;
    }
    const out = [];
    for (const c of leaf.components) {
      let cand = c.articles;
      let ok = true;
      for (const [dim, cat] of Object.entries(want)) {
        if (new Set(cand.map((a) => a.finish?.[dim]).filter((x) => x != null)).size <= 1) continue;
        if (cat == null) { ok = false; break; }
        cand = cand.filter((a) => a.finish?.[dim] === cat);
      }
      if (!ok) continue;
      cand = cand.filter((a) => a.image);
      const size = state.sizes[c.key];
      const a =
        (size && cand.find((x) => (size.sondermass ? x.sizeLabel === size.sondermass : x.width === size.width && x.height === size.height))) ||
        cand[0];
      if (a && !out.some((x) => x.src === a.image))
        out.push({ src: a.image, label: a.displayName || c.label });
      // Badolux: the product's photo gallery from cleverbad.de (model.products).
      for (const src of (a && model.products?.[a.product]?.gallery) || [])
        if (!out.some((x) => x.src === src)) out.push({ src, label: model.products[a.product].name });
    }
    return out;
  }

  /** Shop products behind the current configuration (Badolux model only): the
   *  article picked per component, or its first article before a size is chosen. */
  function currentProducts() {
    const leaf = w.resolvedLeaf(model, state);
    if (!leaf || !model.products) return [];
    const slugs = [];
    for (const c of leaf.components) {
      const size = state.sizes[c.key];
      const a = (size && c.articles.find((x) => x.width === size.width && x.height === size.height)) || c.articles[0];
      if (a?.product && model.products[a.product] && !slugs.includes(a.product)) slugs.push(a.product);
    }
    return slugs.map((s) => model.products[s]);
  }

  // Description + features from the shop, collapsed so the steps stay in view.
  function productInfoEl(products) {
    const box = document.createElement("details");
    box.className = "dac-info";
    const sum = document.createElement("summary");
    sum.textContent = `Produktinfo: ${products.map((p) => p.name).join(" + ")}`;
    box.appendChild(sum);
    for (const p of products) {
      if (products.length > 1) {
        const h = document.createElement("h5");
        h.textContent = p.name;
        box.appendChild(h);
      }
      for (const para of p.description || []) {
        const el = document.createElement("p");
        el.textContent = para;
        box.appendChild(el);
      }
      if (p.features?.length) {
        const ul = document.createElement("ul");
        for (const f of p.features) {
          const li = document.createElement("li");
          li.textContent = f;
          ul.appendChild(li);
        }
        box.appendChild(ul);
      }
    }
    return box;
  }

  /** Gallery for the preview: product photos first, the leaf image last. */
  function previewImages() {
    const v = leafPreview();
    const imgs = productImages();
    const leafSrc = v && imageUrl(v.imageId);
    if (leafSrc && !imgs.some((x) => x.src === leafSrc)) imgs.push({ src: leafSrc, label: v.label });
    return imgs;
  }

  function leafPreviewEl(images) {
    const v = leafPreview();
    const wrap = document.createElement("div");
    wrap.className = "dac-leaf-preview";
    const main = document.createElement("img");
    main.src = images[0].src;
    main.alt = images[0].label;
    main.loading = "lazy";
    main.onerror = () => (images.length > 1 && main.src !== images.at(-1).src ? (main.src = images.at(-1).src) : wrap.remove());
    main.addEventListener("click", () => openLightbox(images, 0));
    wrap.appendChild(main);
    if (images.length > 1) {
      const thumbs = document.createElement("div");
      thumbs.className = "dac-leaf-thumbs";
      images.slice(1).forEach((im, i) => {
        const t = document.createElement("img");
        t.src = im.src;
        t.alt = im.label;
        t.loading = "lazy";
        t.onerror = () => t.remove();
        t.addEventListener("click", () => openLightbox(images, i + 1));
        thumbs.appendChild(t);
      });
      // above the step only the first few thumbs show (CSS); "+N" opens the rest
      if (images.length > 6) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "dac-leaf-more";
        more.textContent = `+${images.length - 6}`;
        more.addEventListener("click", () => openLightbox(images, 6));
        thumbs.appendChild(more);
      }
      wrap.appendChild(thumbs);
    }
    const cap = document.createElement("span");
    cap.className = "dac-leaf-preview-label";
    cap.textContent = v ? v.label : images[0].label;
    wrap.appendChild(cap);
    return wrap;
  }

  // answered structure+finish steps, in model-param order
  function answeredSteps() {
    return model.params
      .filter((p) => state.selections[p.id] != null)
      .map((p) => p.id);
  }

  function changeStep(paramId) {
    const order = model.params.map((p) => p.id);
    const idx = order.indexOf(paramId);
    const selections = {};
    for (const id of order.slice(0, idx))
      if (state.selections[id] != null) selections[id] = state.selections[id];
    state = { ...w.settle(model, { selections, sizes: {} }), extras: state.extras, extrasQty: state.extrasQty, duschwanne: state.duschwanne };
    pending = { width: null, height: null };
    emit("onChange", state);
    render();
  }

  function reset() {
    state = w.settle(model, w.initialState());
    pending = { width: null, height: null };
    emit("onChange", state);
    render();
  }

  // Step back to the nearest previously-answered step that re-opens as a real choice
  // (skips auto-applied single-option steps). Clears component sizes. No-op at the start.
  function goBack() {
    const order = model.params.map((p) => p.id);
    const answered = answeredSteps();
    for (let i = answered.length - 1; i >= 0; i--) {
      const target = answered[i];
      const idx = order.indexOf(target);
      const selections = {};
      for (const id of order.slice(0, idx))
        if (state.selections[id] != null) selections[id] = state.selections[id];
      const settled = w.settle(model, { selections, sizes: {} });
      const cs = w.currentStep(model, settled);
      if (
        (cs.phase === "structure" || cs.phase === "finish") &&
        cs.paramId === target
      ) {
        state = { ...settled, extras: state.extras, extrasQty: state.extrasQty, duschwanne: state.duschwanne };
        pending = { width: null, height: null };
        emit("onChange", state);
        render();
        return;
      }
    }
  }

  function canGoBack() {
    return answeredSteps().some(isRealChoice);
  }

  // A step the user really chose — auto-applied single-option steps (e.g. the derived
  // "Duschabtrennung") are not listed and are not a target for "Zurück".
  function isRealChoice(paramId) {
    const order = model.params.map((p) => p.id);
    const selections = {};
    for (const id of order.slice(0, order.indexOf(paramId)))
      if (state.selections[id] != null) selections[id] = state.selections[id];
    const cs = w.currentStep(model, w.settle(model, { selections, sizes: {} }));
    return (cs.phase === "structure" || cs.phase === "finish") && cs.paramId === paramId;
  }

  // Answered steps as an iOS list: "Frage  Antwort ›", a tap reopens that step.
  // The finish picks (Glasart, Beschichtung, Profilfarbe …) share one "Ausführung" row.
  function renderAnswered(container) {
    const finishIds = new Set(w.finishParams(w.resolvedLeaf(model, state)).map((f) => f.id));
    const rows = [];
    for (const id of answeredSteps()) {
      if (!isRealChoice(id)) continue;
      const { paramLabel, valueLabel: full } = chipFor(id);
      const valueLabel = String(full).split(" — ")[0]; // Badolux: "Ecke — zwei Wände …" → "Ecke"
      const last = rows.at(-1);
      if (finishIds.has(id) && last?.finish) last.values.push(valueLabel);
      else rows.push({ id, label: finishIds.has(id) ? "Ausführung" : paramLabel, values: [valueLabel], finish: finishIds.has(id) });
    }
    if (!rows.length) return;
    const group = document.createElement("div");
    group.className = "dac-group dac-answered";
    for (const r of rows) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dac-row dac-row--nav";
      const k = document.createElement("span");
      k.className = "dac-row__k";
      k.textContent = r.label;
      const v = document.createElement("span");
      v.className = "dac-row__v";
      v.textContent = r.values.join(" · ");
      row.append(k, v);
      row.addEventListener("click", () => changeStep(r.id));
      group.appendChild(row);
    }
    container.appendChild(group);
  }

  function groupLabel(text) {
    const h = document.createElement("h4");
    h.className = "dac-group-label";
    h.textContent = text;
    return h;
  }

  // model.images stores "assets/<uuid>_<ext>" but the files actually live at
  // /configurator/assets/<uuid>.<ext> — fix up the path once, here.
  function imageUrl(imageId) {
    const raw = model.images[imageId];
    if (!raw) return null;
    if (raw.startsWith("/")) return raw;
    return "/configurator/" + raw.replace(/_(jpe?g|png|webp|gif)$/i, ".$1");
  }

  // Audit trail: which leaf/structure option the user picked, so support can
  // reconstruct a training/onboarding session afterwards. Fire-and-forget,
  // queued offline via OfflineSaveQueue (works in the offline iOS shell too —
  // see native-bridge.js) and synced once back online.
  function logLeafClick(paramId, val) {
    import("../OfflineSaveQueue.js")
      .then(({ trySaveOrQueue }) =>
        trySaveOrQueue({
          kind: "log",
          offerKey: "",
          url: "/api/bitrix/log-action",
          body: {
            event: "duschabtrennung_leaf_selected",
            dealId: document.getElementById("auftragId")?.value || "",
            offerType: "BU",
            message: `${paramId}=${val.value} (${val.label})`,
          },
        }),
      )
      .catch((e) => console.warn("[dac] leaf click log failed:", e?.message || e));
  }

  function optionButton(val, onClick, sketch = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dac-opt";
    const src = !sketch && val.imageId && imageUrl(val.imageId);
    if (sketch) {
      // Badolux: a drawing of the cabin as it would be with this answer.
      const wrap = document.createElement("span");
      wrap.className = "dac-opt-sketch";
      wrap.innerHTML = sketch;
      btn.appendChild(wrap);
    } else if (src) {
      const wrap = document.createElement("span");
      wrap.className = "dac-opt-img";
      const img = document.createElement("img");
      img.src = src;
      img.alt = val.label;
      img.loading = "lazy";
      img.onerror = () => wrap.remove();
      wrap.appendChild(img);
      btn.appendChild(wrap);
    }
    const span = document.createElement("span");
    span.className = "dac-opt-label";
    const [title, sub] = sketch ? String(val.label).split(" — ") : [val.label];
    if (sub) {
      // "Nische — zwischen zwei Wänden …" → bold title + short explanation
      const t = document.createElement("span");
      t.className = "dac-opt-title";
      t.textContent = title;
      const u = document.createElement("span");
      u.className = "dac-opt-sub";
      u.textContent = sub;
      span.append(t, u);
    } else span.textContent = val.label;
    btn.appendChild(span);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderStep(main) {
    const step = w.currentStep(model, state);
    const heading = (text) => {
      const bar = document.createElement("div");
      bar.className = "dac-step-head";
      const h = document.createElement("h3");
      h.className = "dac-step-title";
      h.textContent = text;
      bar.appendChild(h);
      if (canGoBack()) {
        const back = document.createElement("button");
        back.type = "button";
        back.className = "dac-back";
        back.textContent = "‹ Zurück";
        back.addEventListener("click", goBack);
        bar.appendChild(back);
      }
      main.appendChild(bar);
    };

    // Show the leaf's product image as soon as it's pinned down (right after the
    // last structure question), and keep it visible through finish + sizing.
    // Badolux: live drawing of the cabin so far; the door moves on hover / tap,
    // and once right after the door type or side was picked.
    const spec = drawings ? specFor(state.selections, state.sizes) : null;
    if (spec) {
      const box = document.createElement("div");
      box.className = "dac-sketch";
      const pic = document.createElement("div");
      box.appendChild(pic);
      attachSketch(pic, spec, { autoplay: lastPicked === "Tuer" || lastPicked === "Anschlag" });
      if (spec.tuer) {
        const hint = document.createElement("div");
        hint.className = "dac-sketch-hint";
        hint.textContent = "Antippen zeigt, wie die Tür öffnet";
        box.appendChild(hint);
      }
      main.appendChild(box);
    }
    lastPicked = null;

    const previews = previewImages();
    if (previews.length) main.appendChild(leafPreviewEl(previews));
    const infoProducts = currentProducts();
    if (infoProducts.length) main.appendChild(productInfoEl(infoProducts));

    if (step.phase === "structure" || step.phase === "finish") {
      const p = paramMeta(step.paramId);
      heading(p?.label ?? step.paramId);
      const grid = document.createElement("div");
      grid.className = "dac-grid";
      for (const val of w.availableOptions(model, state, step.paramId)) {
        const sketch = drawings
          ? sketchSVG(specFor({ ...state.selections, [step.paramId]: val.value }, state.sizes), {
              small: true,
              open: step.paramId === "Einbausituation" ? 0 : 0.45, // show how the door moves
            })
          : "";
        grid.appendChild(
          optionButton(val, () => {
            logLeafClick(step.paramId, val);
            lastPicked = step.paramId;
            state = {
              ...w.settle(
                model,
                w.applySelection(model, state, step.paramId, val.value),
              ),
              extras: state.extras, // applySelection drops unknown keys
              extrasQty: state.extrasQty,
              duschwanne: state.duschwanne,
            };
            emit("onChange", state);
            render();
          }, sketch),
        );
      }
      main.appendChild(grid);
      return;
    }

    // Structure + finish complete → leaf resolved. Render ALL components at once,
    // each with its current selection highlighted and freely changeable (nothing
    // disappears after picking — the user can revise Tür/Seitenwand like any selection).
    const leaf = w.resolvedLeaf(model, state);
    if (!leaf) {
      heading("Konfiguration");
      return;
    }

    const finishAndRender = () => {
      const done = resolved();
      if (done) emit("onComplete", done);
      emit("onChange", state);
      render();
    };

    // auto-size components that have exactly one possible size (no real choice to make)
    let autoChanged = false;
    for (const c of leaf.components) {
      if (
        !state.sizes[c.key] &&
        c.sondermass.length === 0 &&
        c.breite.length === 1 &&
        c.hoehe.length === 1
      ) {
        state = w.setComponentSize(state, c.key, c.breite[0], c.hoehe[0]);
        autoChanged = true;
      }
    }
    if (autoChanged) {
      const done = resolved();
      if (done) emit("onComplete", done);
      emit("onChange", state);
    }

    heading("Maße festlegen");

    // Sizes as wrapping segmented pills, one inset group per component.
    const seg = (items) => {
      const wrap = document.createElement("div");
      wrap.className = "dac-seg";
      for (const it of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dac-seg__opt" + (it.sonder ? " is-sonder" : "");
        if (it.selected) b.dataset.selected = "true";
        b.setAttribute("aria-pressed", it.selected ? "true" : "false");
        b.textContent = it.label;
        b.addEventListener("click", it.onClick);
        wrap.appendChild(b);
      }
      return wrap;
    };
    const sizeRow = (label, control) => {
      const row = document.createElement("div");
      row.className = "dac-row dac-row--size";
      const k = document.createElement("span");
      k.className = "dac-row__k";
      k.textContent = label;
      row.append(k, control);
      return row;
    };

    for (const c of leaf.components) {
      const cur = state.sizes[c.key] || {};
      const singleH = c.hoehe.length === 1 ? c.hoehe[0] : null;

      main.appendChild(groupLabel(c.label));
      const group = document.createElement("div");
      group.className = "dac-group dac-component";
      group.appendChild(sizeRow(model.sizeAxisLabel || "Breite (mm)", seg([
        ...c.breite.map((n) => ({
          label: String(n),
          selected: !cur.sondermass && cur.width === n,
          onClick: () => {
            const height = singleH != null ? singleH : cur.sondermass ? null : cur.height ?? null;
            state = w.setComponentSize(state, c.key, n, height);
            finishAndRender();
          },
        })),
        ...c.sondermass.map((sm) => ({
          label: sm,
          sonder: true,
          selected: cur.sondermass === sm,
          onClick: () => {
            state = w.setComponentSondermass(state, c.key, sm);
            finishAndRender();
          },
        })),
      ])));

      // Höhe only when there is a real height choice (multi-height, non-Sondermaß)
      if (singleH == null && !cur.sondermass && c.hoehe.length) {
        group.appendChild(sizeRow("Höhe (mm)", seg(c.hoehe.map((hh) => ({
          label: String(hh),
          selected: cur.height === hh,
          onClick: () => {
            state = w.setComponentSize(state, c.key, cur.width ?? null, hh);
            finishAndRender();
          },
        })))));
      }
      main.appendChild(group);
    }

    renderExtras(main);
    renderDuschwanne(main);

    if (step.phase === "done") {
      const again = document.createElement("button");
      again.type = "button";
      again.className = "dac-reset";
      again.textContent = "Neu konfigurieren";
      again.addEventListener("click", reset);
      main.appendChild(again);
    }
  }

  // One list row: picture, name + small text, then whatever controls (stepper, switch …).
  function itemRow({ img, title, sub, onClick, selected, controls = [] }) {
    // a div, not a <button>: a row may hold a stepper with an <input>
    const row = document.createElement("div");
    if (onClick) {
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      // taps on a stepper inside the row change the quantity, not the row
      row.addEventListener("click", (ev) => { if (!ev.target.closest(".ios-stepper")) onClick(); });
      row.addEventListener("keydown", (ev) => {
        if (ev.target === row && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onClick(); }
      });
    }
    row.className = "dac-row dac-row--item";
    if (selected != null) row.setAttribute("aria-pressed", selected ? "true" : "false");
    if (img) {
      const pic = document.createElement("span");
      pic.className = "dac-row__img";
      const im = document.createElement("img");
      im.src = img;
      im.alt = "";
      im.loading = "lazy";
      im.onerror = () => im.remove();
      pic.appendChild(im);
      row.appendChild(pic);
    }
    const text = document.createElement("span");
    text.className = "dac-row__text";
    const t = document.createElement("strong");
    t.textContent = title;
    text.appendChild(t);
    if (sub) {
      const u = document.createElement("small");
      u.textContent = sub;
      text.appendChild(u);
    }
    row.appendChild(text);
    row.append(...controls);
    return row;
  }

  function switchEl(on) {
    const sw = document.createElement("span");
    sw.className = "dac-switch" + (on ? " is-on" : "");
    sw.setAttribute("aria-hidden", "true");
    return sw;
  }

  // Optional Verbreiterungsprofil: a switch row per article, a stepper for the
  // quantity while it is on.
  function renderExtras(main) {
    const items = extrasAvailable();
    if (!items.length) return;
    const ids = Array.isArray(state.extras) ? state.extras : [];
    main.appendChild(groupLabel("Verbreiterungsprofil (optional)"));
    const group = document.createElement("div");
    group.className = "dac-group dac-extras";
    for (const e of items) {
      const on = ids.includes(e.articleNumber);
      const controls = [];
      if (on) {
        const step = document.createElement("span");
        step.className = "ios-stepper";
        step.innerHTML = '<button type="button" data-step="-1" aria-label="Weniger">−</button><input type="number" min="1" step="1" aria-label="Menge" /><button type="button" data-step="1" aria-label="Mehr">+</button>';
        const input = step.querySelector("input");
        input.value = String(extraQty(e.articleNumber));
        input.addEventListener("change", () =>
          setExtraQty(e.articleNumber, Math.max(1, Math.floor(Number(input.value) || 1))),
        );
        controls.push(step);
      }
      controls.push(switchEl(on));
      const row = itemRow({
        img: "/assets/Verbreiterungsprofil/" + e.image,
        title: e.name,
        sub: `${e.articleNumber} · ${e.finishText} · ${euro(e.net)}`,
        selected: on,
        onClick: () => toggleExtra(e.articleNumber),
        controls,
      });
      group.appendChild(row);
    }
    main.appendChild(group);
  }

  function stockBadge(article) {
    if (article.stockQuantity == null && article.stockText == null) return null;
    const inStock = Number(article.stockQuantity) > 0;
    const b = document.createElement("span");
    b.className = "dac-line-stock " + (inStock ? "dac-stock-in" : "dac-stock-out");
    const qty = document.createElement("span");
    qty.className = "dac-stock-qty";
    qty.textContent = String(Number(article.stockQuantity) || 0);
    b.append(qty, document.createTextNode(inStock ? "Auf Lager" : "Auf Bestellung"));
    if (article.stockText) b.title = article.stockText;
    return b;
  }

  // Matching Viertelkreis-Duschwanne for the picked radius + door width. Single
  // choice, tap again to deselect.
  function renderDuschwanne(main) {
    const items = duschwannenAvailable();
    if (!items.length) return;
    main.appendChild(groupLabel("Passende Duschwanne (optional)"));
    const group = document.createElement("div");
    group.className = "dac-group dac-dw";
    const width = currentDoorWidth();
    for (const d of items) {
      const on = state.duschwanne === d.articleNumber;
      const check = document.createElement("span");
      check.className = "dac-check" + (on ? " is-on" : "");
      check.setAttribute("aria-hidden", "true");
      group.appendChild(itemRow({
        img: "/assets/" + d.image,
        title: duschwannenDisplayName(d, width),
        sub: `${d.articleNumber} · ${euro(d.net)}`,
        selected: on,
        onClick: () => selectDuschwanne(d.articleNumber),
        controls: [stockBadge(d), check].filter(Boolean),
      }));
    }
    main.appendChild(group);
  }

  // "Ihre Auswahl": big picture + gallery, then one row per article and the total.
  function renderSummary(aside) {
    aside.className = "dac-summary";
    aside.appendChild(groupLabel("Ihre Auswahl"));
    const group = document.createElement("div");
    group.className = "dac-group";
    aside.appendChild(group);

    const previews = previewImages();
    if (previews.length) {
      const hero = document.createElement("div");
      hero.className = "dac-hero";
      hero.appendChild(leafPreviewEl(previews));
      group.appendChild(hero);
    }

    const cfg = resolved();
    if (!cfg) {
      const hint = document.createElement("div");
      hint.className = "dac-row dac-hint";
      hint.textContent = "Konfiguration noch nicht vollständig …";
      group.appendChild(hint);
      return;
    }
    for (const line of cfg.lines) {
      const a = line.article;
      const meta = [a.articleNumber, a.finishText,
        Array.isArray(a.einbaumass) ? a.einbaumass.map((e) => e.label).filter(Boolean).join(" · ") : ""]
        .filter(Boolean).join(" · ");
      const price = document.createElement("span");
      price.className = "dac-line-price";
      price.textContent = euro(a.net * (line.qty || 1));
      const controls = [stockBadge(a), price];
      if (a.sourceUrl) {
        const link = document.createElement("a");
        link.className = "dac-line-gc";
        link.href = a.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = "Beim Lieferanten öffnen";
        link.setAttribute("aria-label", "Beim Lieferanten öffnen");
        link.textContent = "↗";
        controls.push(link);
      }
      const row = itemRow({
        title: (line.qty > 1 ? `${line.qty} × ` : "") + (a.displayName || line.component),
        sub: meta,
        controls: controls.filter(Boolean),
      });
      row.classList.add("dac-line");
      group.appendChild(row);
    }
    const total = document.createElement("div");
    total.className = "dac-row dac-total";
    total.innerHTML = `<span>Gesamt (netto)</span><span>${euro(cfg.net)}</span>`;
    group.appendChild(total);
  }

  function openLightbox(images, start) {
    let idx = start || 0;
    const overlay = document.createElement("div");
    overlay.className = "dac-lightbox-overlay";
    const img = document.createElement("img");
    const cap = document.createElement("div");
    cap.className = "dac-lightbox-caption";
    const btn = (cls, label, text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = cls;
      b.setAttribute("aria-label", label);
      b.textContent = text;
      return b;
    };
    const closeBtn = btn("dac-lightbox-close", "Schließen", "×");
    const prevBtn = btn("dac-lightbox-nav dac-lightbox-prev", "Vorheriges Bild", "‹");
    const nextBtn = btn("dac-lightbox-nav dac-lightbox-next", "Nächstes Bild", "›");
    const show = (i) => {
      idx = (i + images.length) % images.length;
      img.src = images[idx].src;
      img.alt = images[idx].label || "";
      cap.textContent =
        (images.length > 1 ? `${idx + 1} / ${images.length} · ` : "") + (images[idx].label || "");
    };
    overlay.append(img, cap, closeBtn);
    if (images.length > 1) overlay.append(prevBtn, nextBtn);
    show(idx);

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(idx - 1);
      else if (e.key === "ArrowRight") show(idx + 1);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);
    prevBtn.addEventListener("click", () => show(idx - 1));
    nextBtn.addEventListener("click", () => show(idx + 1));
    let touchX = null;
    overlay.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener("touchend", (e) => {
      if (touchX == null || images.length < 2) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
  }

  function render() {
    el.innerHTML = "";
    el.classList.add("dac-wizard");
    const main = document.createElement("div");
    main.className = "dac-main";
    renderAnswered(main);
    renderStep(main);
    el.appendChild(main);
    const aside = document.createElement("aside");
    renderSummary(aside);
    el.appendChild(aside);
  }

  render();
  return {
    state: () => state,
    resolved,
    reset,
    previewImageUrl: () => {
      const v = leafPreview();
      return v ? imageUrl(v.imageId) : null;
    },
    destroy: () => {
      el.innerHTML = "";
    },
  };
}
