// src/bridge/LegacyBridge.js
/**
 * Bridge between new MVC architecture and legacy global functions.
 * This allows gradual migration without breaking existing code.
 */

import { stateManager } from "../models/StateManager.js";
import { eventBus, Events } from "../events/EventBus.js";
import { navigationController } from "../controllers/NavigationController.js";
import { pricingController } from "../controllers/PricingController.js";
import { apiService } from "../services/ApiService.js";
import { parseMoneyEuro, hhmmToHours, hoursToHHMM } from "../utils/parsers.js";
import { euro, euroC } from "../utils/formatters.js";

// Expose to window for legacy compatibility
export function installLegacyBridge() {
  // State management
  window.getCurrentOfferType = () => stateManager.currentOfferType;
  window.getCurrentStep = () => stateManager.currentStep;
  window.loadWizardState = () => ({
    offerType: stateManager.currentOfferType,
    step: stateManager.currentStep,
  });

  // Navigation
  window.setStep = (step) => navigationController.navigateTo(step);
  window.startOfferFlow = (offerType) =>
    navigationController.startOffer(offerType);
  window.goHomeWithoutOffer = () => navigationController.goHome();

  // Pricing
  window.updatePricing = (payload) => pricingController.updatePricing(payload);
  window.__pricing = null;
  eventBus.on(Events.PRICING_UPDATED, (data) => {
    window.__pricing = data;
    window.dispatchEvent(new CustomEvent("pricing:updated", { detail: data }));
  });

  // Utilities
  window.parseMoneyEuro = parseMoneyEuro;
  window.hhmmToHours = hhmmToHours;
  window.hoursToHHMM = hoursToHHMM;
  window.euro = euro;
  window.euroC = euroC;

  // Restoring flags
  Object.defineProperty(window, "__RESTORING__", {
    get: () => stateManager.isRestoring,
    set: (v) => stateManager.setRestoring(v),
  });
  Object.defineProperty(window, "__restoring", {
    get: () => stateManager.isRestoring,
    set: (v) => stateManager.setRestoring(v),
  });

  // Build payload (for export functions)
  window.buildPayload = () => {
    const forms = stateManager.state.forms;
    return {
      Kundendaten: forms.Kundendaten,
      Arbeitszeit: forms.Arbeitszeit,
      duschwanne: forms.duschwanne,
      wandverkleidung: forms.wandverkleidung,
      duschabtrennung: forms.duschabtrennung,
      optional: forms.optional,
      rabatt: forms.rabatt,
      bwt: forms.bwt,
      hl: forms.hl,
      ah: forms.ah,
      activeOffer: stateManager.currentOfferType,
      offerNumber: document.getElementById("offerNumber")?.value || "",
    };
  };

  console.log("[LegacyBridge] Installed legacy compatibility layer");
}
