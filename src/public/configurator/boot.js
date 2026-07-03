// boot.js — boots the "Duschabtrennung (neu)" configurator and wires it to the offer.
// Loaded as an external module (CSP blocks inline scripts).
// Supports two suppliers (Vigour / Badolux) sharing one mount + one offer wiring.
import { mountConfigurator } from "/configurator/configurator-ui.js";

const mountEl = document.getElementById("dac-mount");
if (mountEl) {
  const MODELS = {
    vigour: "/configurator/vigor-model.json",
    badolux: "/configurator/badolux-model.json",
  };

  let supplier = "vigour";
  const models = {}; // supplier -> parsed model (cached)
  let instance = null;
  let resolved = null; // last resolved configuration (or null)

  const refreshOffer = () => {
    try { window.updatePricing?.(); } catch {}
    try { window.updateSummary?.(); } catch {}
  };

  const loadModel = async (key) => {
    if (models[key]) return models[key];
    models[key] = await (await fetch(MODELS[key])).json();
    return models[key];
  };

  const mount = (initialState) => {
    const model = models[supplier];
    instance = mountConfigurator(mountEl, model, {
      initialState: initialState || undefined,
      // resolved() reflects the engine truth (null until every component is sized);
      // recompute on any change so editing an earlier step clears stale lines.
      onComplete: () => { if (!instance) return; resolved = instance.resolved(); refreshOffer(); },
      onChange: () => { if (!instance) return; resolved = instance.resolved(); refreshOffer(); },
    });
    // capture resolved state for a rehydrated (already-complete) configuration
    resolved = instance.resolved();
  };

  // Switch supplier: load the other model, reset the wizard, drop any resolved lines
  // so the offer no longer prices the previous supplier's configuration.
  const switchSupplier = async (key) => {
    if (!MODELS[key] || key === supplier) return;
    supplier = key;
    resolved = null;
    mountEl.innerHTML = '<div class="dac-loading">Konfigurator wird geladen …</div>';
    try {
      await loadModel(key);
      mount();
      refreshOffer();
    } catch (err) {
      console.error("[daConfigurator] failed to load model:", err);
      mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
  };

  // Wire the supplier toggle (radio inputs name="dac-supplier") if present.
  document
    .querySelectorAll('input[name="dac-supplier"]')
    .forEach((el) =>
      el.addEventListener("change", (e) => {
        if (e.target.checked) switchSupplier(e.target.value);
      }),
    );

  // Public data API consumed by buildPayload()'s collectDuschabtrennungConfigurator()
  // and by RestoreManager (restore()).
  window.__daConfigurator = {
    getLines() {
      if (!resolved) return [];
      return resolved.lines.map((l) => ({
        label: `${l.component} (${l.article.articleNumber})`,
        articleNumber: l.article.articleNumber,
        net: l.article.net,
      }));
    },
    getState() {
      // raw engine state {selections, sizes} plus the active supplier (for restore)
      const s = instance ? instance.state() : null;
      return s ? { ...s, __supplier: supplier } : null;
    },
    async restore(state) {
      if (!state) return;
      const key = state.__supplier && MODELS[state.__supplier] ? state.__supplier : supplier;
      resolved = null;
      supplier = key;
      // reflect the restored supplier in the toggle UI
      const radio = document.querySelector(
        `input[name="dac-supplier"][value="${key}"]`,
      );
      if (radio) radio.checked = true;
      try {
        await loadModel(key);
        mount(state);
      } catch (err) {
        console.error("[daConfigurator] restore failed:", err);
      }
    },
  };

  (async () => {
    try {
      await loadModel(supplier);
      mount();
    } catch (err) {
      console.error("[daConfigurator] failed to load model:", err);
      mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
  })();
}
