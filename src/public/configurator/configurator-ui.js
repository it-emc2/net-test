// configurator-ui.js
// Project-styled mount for the ported GC/Hassmann Duschabtrennung configurator.
// Net-only. Single-step GC-style flow (structure → finish → per-component size),
// a breadcrumb of answered steps (click to change), and a running line-item summary.
// Engine logic lives in ./engine.js (ported verbatim from EMC2-scraper, framework-free).
import * as w from "./engine.js";

const euro = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    Number(n || 0),
  );

export function mountConfigurator(el, model, options = {}) {
  let state = w.settle(model, options.initialState || w.initialState());
  let pending = { width: null, height: null }; // in-progress component size
  const emit = (name, payload) => {
    if (typeof options[name] === "function") options[name](payload);
  };

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

  function leafPreviewEl(v) {
    const wrap = document.createElement("div");
    wrap.className = "dac-leaf-preview";
    const img = document.createElement("img");
    img.src = imageUrl(v.imageId);
    img.alt = v.label;
    img.loading = "lazy";
    img.onerror = () => wrap.remove();
    wrap.appendChild(img);
    const cap = document.createElement("span");
    cap.className = "dac-leaf-preview-label";
    cap.textContent = v.label;
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
    state = w.settle(model, { selections, sizes: {} });
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
        state = settled;
        pending = { width: null, height: null };
        emit("onChange", state);
        render();
        return;
      }
    }
  }

  function canGoBack() {
    const order = model.params.map((p) => p.id);
    const answered = answeredSteps();
    for (let i = answered.length - 1; i >= 0; i--) {
      const target = answered[i];
      const idx = order.indexOf(target);
      const selections = {};
      for (const id of order.slice(0, idx))
        if (state.selections[id] != null) selections[id] = state.selections[id];
      const cs = w.currentStep(model, w.settle(model, { selections, sizes: {} }));
      if (
        (cs.phase === "structure" || cs.phase === "finish") &&
        cs.paramId === target
      )
        return true;
    }
    return false;
  }

  function renderBreadcrumb(container) {
    const ids = answeredSteps();
    if (ids.length === 0) return;
    const bc = document.createElement("div");
    bc.className = "dac-breadcrumb";
    for (const id of ids) {
      const { paramLabel, valueLabel } = chipFor(id);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "dac-chip";
      chip.innerHTML = `<span class="dac-chip-k">${paramLabel}</span><span class="dac-chip-v">${valueLabel}</span><span class="dac-chip-x">✎</span>`;
      chip.addEventListener("click", () => changeStep(id));
      bc.appendChild(chip);
    }
    container.appendChild(bc);
  }

  // model.images stores "assets/<uuid>_<ext>" but the files actually live at
  // /configurator/assets/<uuid>.<ext> — fix up the path once, here.
  function imageUrl(imageId) {
    const raw = model.images[imageId];
    if (!raw) return null;
    return "/configurator/" + raw.replace(/_(jpe?g|png|webp|gif)$/i, ".$1");
  }

  function optionButton(val, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dac-opt";
    const src = val.imageId && imageUrl(val.imageId);
    if (src) {
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
    span.textContent = val.label;
    btn.appendChild(span);
    btn.addEventListener("click", onClick);
    return btn;
  }

  function renderStep(main) {
    const step = w.currentStep(model, state);
    const heading = (text) => {
      const h = document.createElement("h3");
      h.className = "dac-step-title";
      h.textContent = text;
      main.appendChild(h);
    };

    // Show the leaf's product image as soon as it's pinned down (right after the
    // last structure question), and keep it visible through finish + sizing.
    const leafPrev = leafPreview();
    if (leafPrev) main.appendChild(leafPreviewEl(leafPrev));

    if (step.phase === "structure" || step.phase === "finish") {
      const p = paramMeta(step.paramId);
      heading(p?.label ?? step.paramId);
      const grid = document.createElement("div");
      grid.className = "dac-grid";
      for (const val of w.availableOptions(model, state, step.paramId)) {
        grid.appendChild(
          optionButton(val, () => {
            state = w.settle(
              model,
              w.applySelection(model, state, step.paramId, val.value),
            );
            emit("onChange", state);
            render();
          }),
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
      const done = w.resolveConfiguration(model, state);
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
      const done = w.resolveConfiguration(model, state);
      if (done) emit("onComplete", done);
      emit("onChange", state);
    }

    heading("Maße festlegen");

    const sizePill = (label, selected, onClick, isSonder = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dac-opt dac-size" + (isSonder ? " dac-sondermass" : "");
      if (selected) b.dataset.selected = "true";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    };

    for (const c of leaf.components) {
      const cur = state.sizes[c.key] || {};
      const singleH = c.hoehe.length === 1 ? c.hoehe[0] : null;

      const group = document.createElement("div");
      group.className = "dac-component";
      const ct = document.createElement("h4");
      ct.className = "dac-comp-title";
      ct.textContent = c.label;
      group.appendChild(ct);

      const blbl = document.createElement("div");
      blbl.className = "dac-sizelabel";
      // Vigour: "Breite (mm)"; badolux overrides via model.sizeAxisLabel ("Maß (cm)").
      blbl.textContent = model.sizeAxisLabel || "Breite (mm)";
      group.appendChild(blbl);
      const bwrap = document.createElement("div");
      bwrap.className = "dac-grid dac-grid-sizes";
      for (const n of c.breite) {
        const selected = !cur.sondermass && cur.width === n;
        bwrap.appendChild(
          sizePill(String(n), selected, () => {
            const height =
              singleH != null ? singleH : cur.sondermass ? null : cur.height ?? null;
            state = w.setComponentSize(state, c.key, n, height);
            finishAndRender();
          }),
        );
      }
      for (const sm of c.sondermass) {
        bwrap.appendChild(
          sizePill(
            sm,
            cur.sondermass === sm,
            () => {
              state = w.setComponentSondermass(state, c.key, sm);
              finishAndRender();
            },
            true,
          ),
        );
      }
      group.appendChild(bwrap);

      // Höhe only when there is a real height choice (multi-height, non-Sondermaß)
      if (singleH == null && !cur.sondermass) {
        const hlbl = document.createElement("div");
        hlbl.className = "dac-sizelabel";
        hlbl.textContent = "Höhe (mm)";
        group.appendChild(hlbl);
        const hwrap = document.createElement("div");
        hwrap.className = "dac-grid dac-grid-sizes";
        for (const hh of c.hoehe) {
          hwrap.appendChild(
            sizePill(String(hh), cur.height === hh, () => {
              state = w.setComponentSize(state, c.key, cur.width ?? null, hh);
              finishAndRender();
            }),
          );
        }
        group.appendChild(hwrap);
      }

      main.appendChild(group);
    }

    if (step.phase === "done") {
      const done = document.createElement("p");
      done.className = "dac-done-hint";
      done.textContent =
        "Die Konfiguration ist abgeschlossen und wurde dem Angebot hinzugefügt. Sie können die Maße oben jederzeit ändern.";
      main.appendChild(done);
      const again = document.createElement("button");
      again.type = "button";
      again.className = "dac-reset";
      again.textContent = "Neue Konfiguration";
      again.addEventListener("click", reset);
      main.appendChild(again);
    }
  }

  function renderSummary(aside) {
    aside.className = "dac-summary";
    const h = document.createElement("h3");
    h.textContent = "Auswahl";
    aside.appendChild(h);

    const body = document.createElement("div");
    body.className = "dac-summary-body";
    const productsCol = document.createElement("div");
    productsCol.className = "dac-summary-products";
    body.appendChild(productsCol);

    const leafPrev = leafPreview();
    if (leafPrev) {
      const imageCol = document.createElement("div");
      imageCol.className = "dac-summary-image";
      const previewEl = leafPreviewEl(leafPrev);
      const img = previewEl.querySelector("img");
      if (img) {
        img.addEventListener("click", () =>
          openLightbox(img.src, leafPrev.label),
        );
      }
      imageCol.appendChild(previewEl);
      body.appendChild(imageCol);
    }

    const cfg = w.resolveConfiguration(model, state);
    const list = document.createElement("div");
    list.className = "dac-lines";
    if (cfg) {
      for (const line of cfg.lines) {
        const row = document.createElement("div");
        row.className = "dac-line";

        const nameSpan = document.createElement("span");
        nameSpan.className = "dac-line-name";
        nameSpan.textContent = line.article.displayName || line.component;
        row.appendChild(nameSpan);

        const artSpan = document.createElement("span");
        artSpan.className = "dac-line-art";
        artSpan.textContent = line.article.articleNumber;
        row.appendChild(artSpan);

        if (line.article.finishText) {
          const finishSpan = document.createElement("span");
          finishSpan.className = "dac-line-finish";
          finishSpan.textContent = line.article.finishText;
          row.appendChild(finishSpan);
        }

        // Einbaumaß — display-only, present for a minority of articles (~43%).
        // Each entry's `label` is a ready-to-show string; join multiple with " · ".
        if (Array.isArray(line.article.einbaumass) && line.article.einbaumass.length) {
          const einbauSpan = document.createElement("span");
          einbauSpan.className = "dac-line-einbau";
          einbauSpan.textContent = line.article.einbaumass
            .map((e) => e.label)
            .filter(Boolean)
            .join(" · ");
          row.appendChild(einbauSpan);
        }

        // Stock badge — display-only. In stock when stockQuantity > 0; otherwise
        // treated as "auf Bestellung". Shown only when the article carries stock data.
        const hasStock =
          line.article.stockQuantity != null || line.article.stockText != null;
        if (hasStock) {
          const inStock = Number(line.article.stockQuantity) > 0;
          const stockSpan = document.createElement("span");
          stockSpan.className =
            "dac-line-stock " + (inStock ? "dac-stock-in" : "dac-stock-out");
          stockSpan.textContent = inStock
            ? `Auf Lager (${line.article.stockQuantity})`
            : "Auf Bestellung";
          if (line.article.stockText) stockSpan.title = line.article.stockText;
          row.appendChild(stockSpan);
        }

        const priceSpan = document.createElement("span");
        priceSpan.className = "dac-line-price";
        priceSpan.textContent = euro(line.article.net);
        row.appendChild(priceSpan);

        if (line.article.sourceUrl) {
          const gcLink = document.createElement("a");
          gcLink.className = "dac-line-gc";
          gcLink.href = line.article.sourceUrl;
          gcLink.target = "_blank";
          gcLink.rel = "noopener noreferrer";
          gcLink.textContent = "open ↗";
          row.appendChild(gcLink);
        }

        list.appendChild(row);
      }
      productsCol.appendChild(list);
      aside.appendChild(body);
      const total = document.createElement("div");
      total.className = "dac-total";
      total.innerHTML = `<span>Gesamt (netto)</span><span>${euro(cfg.net)}</span>`;
      aside.appendChild(total);
    } else {
      aside.appendChild(body);
      const hint = document.createElement("div");
      hint.className = "dac-hint";
      hint.textContent = "Konfiguration noch nicht vollständig …";
      aside.appendChild(hint);
    }
  }

  function openLightbox(src, alt) {
    const overlay = document.createElement("div");
    overlay.className = "dac-lightbox-overlay";
    const img = document.createElement("img");
    img.src = src;
    img.alt = alt || "";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "dac-lightbox-close";
    closeBtn.setAttribute("aria-label", "Schließen");
    closeBtn.textContent = "×";
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKey);

    document.body.appendChild(overlay);
  }

  function renderBackBar(main) {
    if (!canGoBack()) return;
    const bar = document.createElement("div");
    bar.className = "dac-backbar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "dac-back";
    back.innerHTML = "&#8592; Zurück";
    back.addEventListener("click", goBack);
    bar.appendChild(back);
    main.appendChild(bar);
  }

  function render() {
    el.innerHTML = "";
    el.classList.add("dac-wizard");
    const main = document.createElement("div");
    main.className = "dac-main";
    renderBackBar(main);
    renderBreadcrumb(main);
    renderStep(main);
    el.appendChild(main);
    const aside = document.createElement("aside");
    renderSummary(aside);
    el.appendChild(aside);
  }

  render();
  return {
    state: () => state,
    resolved: () => w.resolveConfiguration(model, state),
    reset,
    destroy: () => {
      el.innerHTML = "";
    },
  };
}
