// src/controllers/PricingController.js
import { eventBus, Events } from "../events/EventBus.js";
import { stateManager } from "../models/StateManager.js";
import { apiService } from "../services/ApiService.js";

export class PricingController {
  constructor() {
    this._debounceTimer = null;
    this._lastPayload = null;

    // Subscribe to form changes
    eventBus.on(Events.FORM_CHANGED, () => this._scheduleUpdate());
  }

  async updatePricing(payload = null) {
    try {
      const effectivePayload = payload || this._buildPayload();

      // Skip if payload hasn't changed
      const payloadJson = JSON.stringify(effectivePayload);
      if (payloadJson === this._lastPayload) {
        return stateManager.pricing;
      }
      this._lastPayload = payloadJson;

      const result = await apiService.computePrices(effectivePayload);
      stateManager.setPricing(result);

      return result;
    } catch (error) {
      console.error("[PricingController] Update failed:", error);
      throw error;
    }
  }

  _scheduleUpdate(delay = 250) {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.updatePricing().catch(console.error);
    }, delay);
  }

  _buildPayload() {
    // Collect all form data into the expected payload structure
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
    };
  }
}

export const pricingController = new PricingController();
