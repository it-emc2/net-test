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
    const offerPages = OFFERS?.[offerType]?.pages || [];
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
    document
      .getElementById("chosenBathtubProductId")
      ?.dispatchEvent(new Event("change", { bubbles: true }));
    document
      .getElementById("chosenScreenProductId")
      ?.dispatchEvent(new Event("change", { bubbles: true }));

    window.__smartTray?.fetchAndRender?.();
    window.__smartBathtub?.fetchAndRender?.();
    window.__smartScreenPicker?.refresh?.();

    // Wandverkleidung dependencies
    fire('input[name="wvKind"]:checked');

    // Optional parents
    [
      "#cat_SHOWER",
      "#cat_THERMO",
      "#cat_GRAB",
      "#cat_FOLD",
      "#cat_SEAT",
      "#cat_BASIN",
      "#cat_BASIN_TAP",
      "#cat_METER",
      "#cat_RAMPE",
      "#cat_REHA",
      "#cat_SONDER",
    ].forEach((id) => dispatchChange(document.querySelector(id)));

    // Optional child tiles
    document
      .querySelectorAll(
        '#form-optional input[type="checkbox"][id^="opt_"]:checked',
      )
      .forEach((el) => dispatchChange(el));

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

    let normalized = null;
    try {
      normalized = normalizeOfferDoc(doc);
      const { offerType, offer, payload } = normalized;

      window.__lastRestoredDoc = normalized.doc;
      window.__lastRestoredPayload = payload;
      window.__lastOfferPayload = payload;

      console.log("[SKETCH][payload-stored]", {
        payloadKeys: Object.keys(payload || {}),
        hlKeys: payload?.hl ? Object.keys(payload.hl) : [],
        hasHLJson: !!payload?.hl?.hlSketchJson,
        hasHLDataUrl: !!payload?.hl?.hlSketchDataUrl,
        hasModernSketch: !!payload?.hl?.sketch,
      });

      const ctx = { offerType, offer, doc: normalized.doc };

      const pages = pagesToRestoreFor(offerType);
      for (const page of pages) {
        const handler = restoreHandlers?.[page];
        if (typeof handler === "function") handler(payload, ctx);
      }

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

    const payload = normalized?.payload || normalizeOfferDoc(doc).payload;
    await postRestoreNudges(payload);

    // Populate Auftrag ID fields from whichever key old/new drafts used
    const resolvedAuftragId = String(
      payload?.postal?.auftragId ||
      payload?.dealId ||
      normalized?.doc?.dealId ||
      payload?.Kundendaten?.dealId ||
      payload?.Zusammenfassung?.dealId ||
      ""
    ).trim();
    if (resolvedAuftragId && typeof syncSummaryLeadIds === "function") {
      syncSummaryLeadIds(resolvedAuftragId);
    }

    try {
      await window.__drawingReady;
      console.log("[SKETCH][restore-call-site]", {
        drawingPads: window.__drawingPads ? Object.keys(window.__drawingPads) : [],
        hasHl: !!payload?.hl,
      });

      const restoreOne = (key, section) => {
        window.restoreSketchFor?.(key, section);

        let dataUrl = section?.sketch?.dataUrl || section?.dataUrl || "";
        if (!dataUrl) {
          if (key === "hl") dataUrl = section?.hlSketchDataUrl || "";
          if (key === "bwt") dataUrl = section?.bwtSketchDataUrl || "";
          if (key === "da") dataUrl = section?.daSketchDataUrl || "";
        }
        window.renderStaticSketchPreview?.(key, dataUrl);
      };

      restoreOne("da", payload?.duschabtrennung || {});
      restoreOne("bwt", payload?.bwt || {});
      restoreOne("hl", payload?.hl || {});

      setTimeout(() => {
        console.log("[SKETCH][late-retry]");
        restoreOne("da", payload?.duschabtrennung || {});
        restoreOne("bwt", payload?.bwt || {});
        restoreOne("hl", payload?.hl || {});
      }, 350);
    } catch (e) {
      console.warn("[SKETCH][restore-call-site] failed:", e);
    }
  }

  function restoreConfiguratorFromSnapshot({ payload }) {
    return restoreConfiguratorFromOffer({ payload });
  }

  // keep existing external API (draft loader / other code depends on it)
  window.restoreConfiguratorFromOffer = restoreConfiguratorFromOffer;
  window.restoreConfiguratorFromSnapshot = restoreConfiguratorFromSnapshot;

  return { restoreConfiguratorFromOffer, restoreConfiguratorFromSnapshot };
}