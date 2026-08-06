// boot.js — boots the "Duschabtrennung (neu)" configurator and wires it to the offer.
// Loaded as an external module (CSP blocks inline scripts).
// Supports multiple independent configuration cards, each with its own
// Vigour/Badolux toggle, sharing one offer wiring.
import { mountConfigurator } from "/configurator/configurator-ui.js";

const configsEl = document.getElementById("dac-configs");
const template = document.getElementById("dac-config-template");
const addBtn = document.getElementById("dac-add-config");

if (configsEl && template && addBtn) {
  const MODELS = {
    vigour: "/configurator/vigor-model.json",
    badolux: "/configurator/badolux-model.json",
  };

  const models = {}; // supplier -> parsed model (cached across all cards)
  const entries = []; // { id, supplier, instance, resolved, cardEl, mountEl }
  let nextId = 1;

  const refreshOffer = () => {
    try { window.updatePricing?.(); } catch {}
    try { window.updateSummary?.(); } catch {}
  };

  const loadModel = async (key) => {
    if (models[key]) return models[key];
    models[key] = await (await fetch(MODELS[key])).json();
    return models[key];
  };

  const updateRemoveVisibility = () => {
    const show = entries.length > 1;
    for (const entry of entries) {
      const btn = entry.cardEl.querySelector("[data-dac-remove]");
      if (btn) btn.hidden = !show;
    }
  };

  const updateTitles = () => {
    entries.forEach((entry, idx) => {
      const title = entry.cardEl.querySelector("[data-dac-config-title]");
      if (title) title.textContent = `Duschabtrennung ${idx + 1}`;
    });
  };

  const mountInto = (entry, initialState) => {
    const model = models[entry.supplier];
    entry.instance = mountConfigurator(entry.mountEl, model, {
      initialState: initialState || undefined,
      // resolved() reflects the engine truth (null until every component is sized);
      // recompute on any change so editing an earlier step clears stale lines.
      onComplete: () => { entry.resolved = entry.instance.resolved(); refreshOffer(); },
      onChange: () => { entry.resolved = entry.instance.resolved(); refreshOffer(); },
    });
    // capture resolved state for a rehydrated (already-complete) configuration
    entry.resolved = entry.instance.resolved();
  };

  // Switch supplier for one card: load the other model, reset that card's wizard,
  // drop its resolved lines so the offer no longer prices the previous configuration.
  const switchSupplier = async (entry, key) => {
    if (!MODELS[key] || key === entry.supplier) return;
    entry.supplier = key;
    entry.resolved = null;
    entry.mountEl.innerHTML = '<div class="dac-loading">Konfigurator wird geladen …</div>';
    try {
      await loadModel(key);
      mountInto(entry);
      refreshOffer();
    } catch (err) {
      console.error("[daConfigurator] failed to load model:", err);
      entry.mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
  };

  const removeEntry = (entry) => {
    if (entries.length <= 1) return;
    try { entry.instance?.destroy(); } catch {}
    const idx = entries.indexOf(entry);
    if (idx !== -1) entries.splice(idx, 1);
    entry.cardEl.remove();
    updateRemoveVisibility();
    updateTitles();
    refreshOffer();
  };

  // Creates a new config card, mounts a configurator into it, and wires its
  // supplier toggle + remove button.
  const createConfig = async ({ supplier, state } = {}) => {
    const id = nextId++;
    const frag = template.content.cloneNode(true);
    const cardEl = frag.querySelector("[data-dac-card]");
    const mountEl = cardEl.querySelector("[data-dac-mount]");
    const removeBtn = cardEl.querySelector("[data-dac-remove]");
    const supplierInputs = cardEl.querySelectorAll("[data-dac-supplier-input]");

    const entry = { id, supplier: supplier || "vigour", instance: null, resolved: null, cardEl, mountEl };
    entries.push(entry);
    configsEl.appendChild(cardEl);

    // unique radio group name per card so cards don't share toggle state
    supplierInputs.forEach((input) => {
      input.name = `dac-supplier-${id}`;
      input.checked = input.value === entry.supplier;
      input.addEventListener("change", (e) => {
        if (e.target.checked) switchSupplier(entry, e.target.value);
      });
    });

    removeBtn?.addEventListener("click", () => removeEntry(entry));

    updateRemoveVisibility();
    updateTitles();

    try {
      await loadModel(entry.supplier);
      mountInto(entry, state);
    } catch (err) {
      console.error("[daConfigurator] failed to load model:", err);
      entry.mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
    return entry;
  };

  addBtn.addEventListener("click", () => { createConfig(); });

  // Public data API consumed by buildPayload()'s collectDuschabtrennungConfigurator()
  // and by RestoreManager (restore()).
  window.__daConfigurator = {
    getLines() {
      return entries.flatMap((entry) => {
        if (!entry.resolved) return [];
        return entry.resolved.lines.map((l) => ({
          label: l.article.displayName || l.component,
          articleNumber: l.article.articleNumber,
          net: l.article.net,
          finish: l.article.finishText || null,
        }));
      });
    },
    getState() {
      // array of raw engine states {selections, sizes, __supplier} — one per card
      return entries
        .map((entry) => {
          const s = entry.instance ? entry.instance.state() : null;
          return s ? { ...s, __supplier: entry.supplier } : null;
        })
        .filter(Boolean);
    },
    // Clears all cards back to one fresh empty card (initial page-load state).
    // Called by resetAllForms() when starting a NEW offer so the previous
    // offer's configuration does not leak in. Drafts use restore() instead.
    async reset() {
      for (const entry of [...entries]) {
        try { entry.instance?.destroy(); } catch {}
        entry.cardEl.remove();
      }
      entries.length = 0;
      await createConfig();
    },
    async restore(saved) {
      if (!saved) return;
      // back-compat: legacy saved offers stored a single state object, not an array
      const states = Array.isArray(saved) ? saved : [saved];

      // clear existing cards
      for (const entry of [...entries]) {
        try { entry.instance?.destroy(); } catch {}
        entry.cardEl.remove();
      }
      entries.length = 0;

      if (!states.length) {
        await createConfig();
        return;
      }
      for (const state of states) {
        const key = state?.__supplier && MODELS[state.__supplier] ? state.__supplier : "vigour";
        await createConfig({ supplier: key, state });
      }
    },
  };

  createConfig();
}
