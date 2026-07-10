// boot-dev.js — DB-backed CLONE of the "Duschabtrennung (neu)" configurator, used
// only by the developer "Duschabtrennung (DB-Test)" section for verification.
//
// Differences vs boot.js (intentional — keeps this fully isolated from the offer):
//   • Reads the "-dev" element ids so it never collides with the live section.
//   • Fetches the Vigour model from /api/da-config/model/... (served live from the
//     vigor DB) instead of the static /configurator/vigor-model.json.
//   • Exposes window.__daConfiguratorDev (separate global).
//   • Does NOT call window.updatePricing/updateSummary and is NOT collected into
//     buildPayload or RestoreManager — the clone cannot affect real offers.
// The engine + UI modules are shared (pure/stateless), so behaviour is identical.
import { mountConfigurator } from "/configurator/configurator-ui.js";

const configsEl = document.getElementById("dac-configs-dev");
const template = document.getElementById("dac-config-template-dev");
const addBtn = document.getElementById("dac-add-config-dev");

if (configsEl && template && addBtn) {
  const MODELS = {
    vigour: "/api/da-config/model/vigour",
    badolux: "/api/da-config/model/badolux",
  };

  const models = {}; // supplier -> parsed model (cached across all cards)
  const entries = []; // { id, supplier, instance, resolved, cardEl, mountEl }
  let nextId = 1;

  // Isolated clone: no offer wiring, so nothing to refresh.
  const refreshOffer = () => {};

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
      onComplete: () => { entry.resolved = entry.instance.resolved(); refreshOffer(); },
      onChange: () => { entry.resolved = entry.instance.resolved(); refreshOffer(); },
    });
    entry.resolved = entry.instance.resolved();
  };

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
      console.error("[daConfiguratorDev] failed to load model:", err);
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

    // unique radio group name per card (also namespaced -dev so it can't clash
    // with the live section's radio groups if both pages exist in the DOM)
    supplierInputs.forEach((input) => {
      input.name = `dac-supplier-dev-${id}`;
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
      console.error("[daConfiguratorDev] failed to load model:", err);
      entry.mountEl.innerHTML =
        '<div class="dac-hint">Konfigurator konnte nicht geladen werden.</div>';
    }
    return entry;
  };

  addBtn.addEventListener("click", () => { createConfig(); });

  // Separate global so it never overwrites the live window.__daConfigurator.
  // Read-only helpers for manual verification in the console; deliberately not
  // consumed by buildPayload/RestoreManager.
  window.__daConfiguratorDev = {
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
      return entries
        .map((entry) => {
          const s = entry.instance ? entry.instance.state() : null;
          return s ? { ...s, __supplier: entry.supplier } : null;
        })
        .filter(Boolean);
    },
  };

  createConfig();
}
