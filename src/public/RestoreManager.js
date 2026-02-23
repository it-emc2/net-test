// RestoreManager.js
export function initRestoreManager({
  OFFERS,
  restoreHandlers,
  hooks = {},
}) {
  const {
    updatePricing,
    refreshAllPanels,
    updateSummaryWidgetName,
    ensureTrinitySealingSelectedFromPayload,
  } = hooks;

  function normalizeOfferDoc(doc) {
    const offer = doc?.offer || doc || {};
    const payload = offer?.payload || doc?.payload || {};
    const rawOfferType =
      doc?.offerType ||
      offer?.offerType ||
      payload?.activeOffer ||
      payload?.offerType ||
      payload?.currentOfferKey ||
      "bu";

    const offerType = String(rawOfferType).trim().toLowerCase();

    // normalize sub-objects so old offers don't crash restores
    const p = {
      ...payload,
      activeOffer: payload.activeOffer || offerType,
      Kundendaten: payload.Kundendaten || {},
      Arbeitszeit: payload.Arbeitszeit || {},
      duschwanne: payload.duschwanne || {},
      wandverkleidung: payload.wandverkleidung || {},
      duschabtrennung: payload.duschabtrennung || {},
      optional: payload.optional || {},
      rabatt: payload.rabatt || {},
      bwt: payload.bwt || {},
      hl: payload.hl || {},
      ah: payload.ah || {},
      hms: payload.hms || {},
      wd: payload.wd || {},
    };

    return { doc, offer, payload: p, offerType };
  }

  function pagesToRestoreFor(offerType) {
    const basePages = ["Kundendaten", "Arbeitszeit"];
    const offerPages = (OFFERS?.[offerType]?.pages) || [];
    return Array.from(new Set([...basePages, ...offerPages]));
  }

  const dispatchChange = (el) => {
    if (!el) return;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  async function postRestoreNudges(payload) {
    const fire = (sel) => dispatchChange(document.querySelector(sel));

    fire('input[name="payer"]:checked');
    fire('input[name="aufschlag"]:checked');
    fire('input[name="hasPflegegrad"]:checked');
    fire('input[name="pflegegrad"]:checked');
    fire('input[name="wohnumfeldDone"]:checked');

    // Duschwanne dependencies
    fire("#addFlooring");
    document
      .querySelectorAll('#form-duschwanne input[name*="workTasks"]')
      .forEach((el) => dispatchChange(el));

    // refresh smart pickers if present
    document.getElementById("chosenBathtubProductId")
      ?.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("chosenScreenProductId")
      ?.dispatchEvent(new Event("change", { bubbles: true }));

    window.__smartTray?.fetchAndRender?.();
    window.__smartBathtub?.fetchAndRender?.();
    window.__smartScreenPicker?.refresh?.();

    // pricing & panels
    if (typeof updatePricing === "function") {
      await updatePricing(payload);
      await updatePricing(payload); // keep your existing double-run behavior if needed
    }
    if (typeof ensureTrinitySealingSelectedFromPayload === "function") {
      ensureTrinitySealingSelectedFromPayload(payload?.duschwanne);
    }
    await refreshAllPanels?.();

    updateSummaryWidgetName?.();
  }

  async function restoreConfiguratorFromOffer(doc) {
    window.__restoring = true;
    window.__RESTORING__ = true;
    try {
      const n = normalizeOfferDoc(doc);
      const { offerType, offer, payload } = n;

      const ctx = { offerType, offer, doc: n.doc };

      const pages = pagesToRestoreFor(offerType);
      for (const page of pages) {
        const handler = restoreHandlers?.[page];
        if (typeof handler === "function") handler(payload, ctx);
      }

      // keep "Rabatt must restore" behavior
      if (!pages.includes("Rabatt") && typeof restoreHandlers?.Rabatt === "function") {
        restoreHandlers.Rabatt(payload, ctx);
      }

      if (offer?.offerNumber) {
        const el = document.querySelector("#offerNumber");
        if (el) el.value = offer.offerNumber;
      }
    } finally {
      window.__restoring = false;
      window.__RESTORING__ = false;
    }

    // run nudges after flags are cleared (mirrors your current flow)
    const { payload } = normalizeOfferDoc(doc);
    await postRestoreNudges(payload);
  }

  function restoreConfiguratorFromSnapshot({ payload }) {
    return restoreConfiguratorFromOffer({ payload });
  }

  // keep existing external API (draft loader / other code depends on it)
  window.restoreConfiguratorFromOffer = restoreConfiguratorFromOffer;
  window.restoreConfiguratorFromSnapshot = restoreConfiguratorFromSnapshot;

  return { restoreConfiguratorFromOffer, restoreConfiguratorFromSnapshot };
}