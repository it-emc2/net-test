// boot.js — boots the "Duschabtrennung (neu)" configurator and wires it to the offer.
// Loaded as an external module (CSP blocks inline scripts).
import { mountConfigurator } from "/configurator/configurator-ui.js";

const mountEl = document.getElementById("dac-mount");
if (mountEl) {
  let model = null;
  let instance = null;
  let resolved = null; // last resolved configuration (or null)

  const refreshOffer = () => {
    try { window.updatePricing?.(); } catch {}
    try { window.updateSummary?.(); } catch {}
  };

  const mount = (initialState) => {
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
      // raw engine state {selections, sizes} — used for draft persistence
      return instance ? instance.state() : null;
    },
    restore(state) {
      if (!model || !state) return;
      resolved = null;
      mount(state);
    },
  };

  (async () => {
    try {
      model = await (await fetch("/configurator/vigor-model.json")).json();
      mount();
    } catch (err) {
      console.error("[daConfigurator] failed to load model:", err);
      mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
  })();
}
