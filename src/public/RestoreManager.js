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

    // Awaited (not fire-and-forget): each of these populates fields
    // asynchronously, which fires "change"/"input" events picked up by the
    // global live-pricing watcher (initLivePricingSync in script.js). Left
    // un-awaited, they used to resolve after this function returns — i.e.
    // after window.__restoring is already cleared — silently un-freezing a
    // just-restored frozen offer via requestPricingRefresh().
    await Promise.all([
      window.__smartTray?.fetchAndRender?.(),
      window.__smartBathtub?.fetchAndRender?.(),
      window.__smartScreenPicker?.refresh?.(),
    ]);

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

    // pricing & panels — a frozen offer shows its pinned snapshot instead of
    // recomputing from current DB values.
    if (payload?.frozen && payload?.frozenPricing) {
      window.__pricing = payload.frozenPricing;
      window.dispatchEvent(new CustomEvent("pricing:updated", { detail: payload.frozenPricing }));
      window.updateSummaryWidgetTotal?.(payload.frozenPricing.total);
      window.updateSummaryWidgetSelfPay?.(payload.frozenPricing.selfPayAmount);
    } else if (typeof updatePricing === "function") {
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

      // Preserve the offer's original Aufschlag rule: legacy drafts have no
      // pricingRules flag → keep Kleinmaterial out of the Aufschlag so the
      // total matches what was originally saved.
      window.__kleinInAufschlag = payload?.pricingRules?.kleinInAufschlag === true;
      // Merken, dass dieses Angebot noch nach der alten Regel gespeichert wurde,
      // damit die Umstellen-Checkbox sichtbar (und ruecknehmbar) bleibt.
      window.__kleinAufschlagLegacyOffer = !window.__kleinInAufschlag;

      // BWT Freigrenzen: pin to this offer's own saved snapshot so reopening
      // it doesn't silently reprice it to whatever the admin has configured
      // right now. No snapshot at all → offer predates this mechanism →
      // historical 200 km / 2 h, same fallback pricing.js uses server-side.
      const bwtKmSnap = payload?.pricingRules?.bwtKmFreeThreshold;
      const bwtHoursSnap = payload?.pricingRules?.bwtTravelTimeFreeHours;
      window.__bwtKmFreeThreshold = bwtKmSnap != null ? Number(bwtKmSnap) : 200;
      window.__bwtTravelTimeFreeHours = bwtHoursSnap != null ? Number(bwtHoursSnap) : 2;
      window.__bwtFreigrenzenLegacyOffer = bwtKmSnap == null && bwtHoursSnap == null;

      // Freeze/lock: pin this offer's own saved state.
      window.__frozen = payload?.frozen === true;
      window.__frozenPricing = payload?.frozenPricing || null;
      window.__locked = payload?.locked === true;
      window.applyOfferLockUI?.(window.__locked);

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

      // Fall back to payload.offerNumber for drafts saved before the Draft
      // document itself carried a top-level offerNumber field, or wherever
      // the API response doesn't include it — without this, the field keeps
      // whatever number this session auto-generated on load, so pricing/
      // recompute calls target the wrong (nonexistent) saved record.
      const restoredOfferNumber = offer?.offerNumber || payload?.offerNumber;
      if (restoredOfferNumber) {
        const el = document.querySelector("#offerNumber");
        if (el) el.value = restoredOfferNumber;
      }

      // Rehydrate the "Duschabtrennung (neu)" configurator from its saved engine state
      try {
        const cfgState = payload?.duschabtrennung?.configurator?.state || null;
        if (cfgState && typeof window.__daConfigurator?.restore === "function") {
          window.__daConfigurator.restore(cfgState);
        }
      } catch (e) {
        console.warn("[daConfigurator] restore failed:", e?.message || e);
      }

      // Rehydrate the "Duschvorhang" configurator from its saved state
      try {
        const vhState = payload?.duschvorhang?.configurator?.state || null;
        if (vhState && typeof window.__vorhangConfigurator?.restore === "function") {
          window.__vorhangConfigurator.restore(vhState);
        }
      } catch (e) {
        console.warn("[vorhang] restore failed:", e?.message || e);
      }

      // Rehydrate the Handläufe Konfigurator from its saved state
      try {
        const hlCfgState = payload?.hl?.hlConfigurator?.state || null;
        if (hlCfgState && typeof window.__hlConfigurator?.restore === "function") {
          window.__hlConfigurator.restore(hlCfgState);
        }
      } catch (e) {
        console.warn("[hlConfigurator] restore failed:", e?.message || e);
      }
    } catch (e) {
      window.__restoring = false;
      window.__RESTORING__ = false;
      throw e;
    }

    // __restoring stays true through postRestoreNudges too: it dispatches
    // synthetic "change" events on checkboxes/radios to trigger dependent UI
    // logic, and requestPricingRefresh() treats any such event as a real
    // user edit that un-freezes the offer (window.__frozen = false) unless
    // this guard is still up — clearing it before these nudges run silently
    // discarded a just-restored freeze the moment the first nudge fired.
    const payload = normalized?.payload || normalizeOfferDoc(doc).payload;
    try {
      await postRestoreNudges(payload);
    } finally {
      window.__restoring = false;
      window.__RESTORING__ = false;
    }

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

    // Restore the E-Mail-Versand fields (Lead ID / Auftrag ID, recipient,
    // subject and body). These live outside any form-* element, so they are
    // restored explicitly here. The body carries the dynamic Ansprechpartner
    // name embedded in its saved text.
    try {
      const mail = payload?.mail || {};
      const setMailField = (id, value) => {
        if (value == null || value === "") return;
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setMailField("mailAuftragId", mail.auftragId || resolvedAuftragId);
      setMailField("mailTo", mail.to);
      setMailField("mailSubject", mail.subject);
      setMailField("mailBody", mail.body);
    } catch (e) {
      console.warn("[restore] mail fields restore failed:", e?.message || e);
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