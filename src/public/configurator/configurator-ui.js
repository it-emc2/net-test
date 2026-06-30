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

  function optionButton(val, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dac-opt";
    if (val.imageId && model.images[val.imageId]) {
      const wrap = document.createElement("span");
      wrap.className = "dac-opt-img";
      const img = document.createElement("img");
      img.src = model.images[val.imageId];
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

    if (step.phase === "component") {
      const c = step.component;
      heading(c.label);
      const singleH = c.hoehe.length === 1 ? c.hoehe[0] : null;
      const finishAndRender = () => {
        const done = w.resolveConfiguration(model, state);
        if (done) emit("onComplete", done);
        emit("onChange", state);
        render();
      };
      const commitStd = (width, height) => {
        state = w.setComponentSize(state, c.key, width, height);
        pending = { width: null, height: null };
        finishAndRender();
      };

      // auto-commit when exactly one standard size and no Sondermaß choice
      if (
        c.sondermass.length === 0 &&
        c.breite.length === 1 &&
        c.hoehe.length === 1
      ) {
        commitStd(c.breite[0], c.hoehe[0]);
        return;
      }

      const blbl = document.createElement("div");
      blbl.className = "dac-sizelabel";
      blbl.textContent = "Breite (mm)";
      main.appendChild(blbl);
      const bwrap = document.createElement("div");
      bwrap.className = "dac-grid dac-grid-sizes";
      for (const n of c.breite) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dac-opt dac-size";
        if (pending.width === n) b.dataset.selected = "true";
        b.textContent = String(n);
        b.addEventListener("click", () => {
          if (singleH != null) commitStd(n, singleH);
          else {
            pending = { ...pending, width: n };
            render();
          }
        });
        bwrap.appendChild(b);
      }
      for (const sm of c.sondermass) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "dac-opt dac-size dac-sondermass";
        b.textContent = sm;
        b.addEventListener("click", () => {
          state = w.setComponentSondermass(state, c.key, sm);
          pending = { width: null, height: null };
          finishAndRender();
        });
        bwrap.appendChild(b);
      }
      main.appendChild(bwrap);

      if (pending.width != null && singleH == null) {
        const hlbl = document.createElement("div");
        hlbl.className = "dac-sizelabel";
        hlbl.textContent = "Höhe (mm)";
        main.appendChild(hlbl);
        const hwrap = document.createElement("div");
        hwrap.className = "dac-grid dac-grid-sizes";
        for (const h of c.hoehe) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "dac-opt dac-size";
          b.textContent = String(h);
          b.addEventListener("click", () => commitStd(pending.width, h));
          hwrap.appendChild(b);
        }
        main.appendChild(hwrap);
      }
      return;
    }

    // done
    heading("Konfiguration vollständig");
    const done = document.createElement("p");
    done.className = "dac-done-hint";
    done.textContent =
      "Die Konfiguration ist abgeschlossen und wurde dem Angebot hinzugefügt.";
    main.appendChild(done);
    const again = document.createElement("button");
    again.type = "button";
    again.className = "dac-reset";
    again.textContent = "Neue Konfiguration";
    again.addEventListener("click", reset);
    main.appendChild(again);
  }

  function renderSummary(aside) {
    aside.className = "dac-summary";
    const h = document.createElement("h3");
    h.textContent = "Auswahl";
    aside.appendChild(h);
    const cfg = w.resolveConfiguration(model, state);
    const list = document.createElement("div");
    list.className = "dac-lines";
    if (cfg) {
      for (const line of cfg.lines) {
        const row = document.createElement("div");
        row.className = "dac-line";
        row.innerHTML =
          `<span class="dac-line-name">${line.component}</span>` +
          `<span class="dac-line-art">${line.article.articleNumber}</span>` +
          `<span class="dac-line-price">${euro(line.article.net)}</span>`;
        list.appendChild(row);
      }
      const total = document.createElement("div");
      total.className = "dac-total";
      total.innerHTML = `<span>Gesamt (netto)</span><span>${euro(cfg.net)}</span>`;
      aside.appendChild(list);
      aside.appendChild(total);
    } else {
      const hint = document.createElement("div");
      hint.className = "dac-hint";
      hint.textContent = "Konfiguration noch nicht vollständig …";
      aside.appendChild(hint);
    }
  }

  function render() {
    el.innerHTML = "";
    el.classList.add("dac-wizard");
    const main = document.createElement("div");
    main.className = "dac-main";
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
