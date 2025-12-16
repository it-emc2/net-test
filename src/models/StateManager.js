// src/models/StateManager.js
import { eventBus, Events } from '../events/EventBus.js';

class StateManager {
  constructor() {
    this._state = {
      // Wizard state
      currentOfferType: null,
      currentStep: 'home',
      
      // Form data per page
      forms: {
        Kundendaten: {},
        Arbeitszeit: {},
        duschwanne: {},
        wandverkleidung: {},
        duschabtrennung: {},
        optional: {},
        rabatt: {},
        bwt: {},
        hl: {},
        ah: {},
      },
      
      // Computed pricing (from server)
      pricing: null,
      
      // UI state
      ui: {
        isRestoring: false,
        isDirty: false,
      }
    };
    
    this._subscribers = new Map();
  }

  // Getters
  get state() {
    return this._state;
  }

  get currentOfferType() {
    return this._state.currentOfferType;
  }

  get currentStep() {
    return this._state.currentStep;
  }

  get pricing() {
    return this._state.pricing;
  }

  get isRestoring() {
    return this._state.ui.isRestoring;
  }

  // Setters with event emission
  setOfferType(offerType) {
    const prev = this._state.currentOfferType;
    this._state.currentOfferType = offerType;
    if (prev !== offerType) {
      eventBus.emit(Events.OFFER_STARTED, { offerType, previousType: prev });
    }
  }

  setStep(step) {
    const prev = this._state.currentStep;
    this._state.currentStep = step;
    if (prev !== step) {
      eventBus.emit(Events.STEP_CHANGED, { step, previousStep: prev });
    }
  }

  setPricing(pricingData) {
    this._state.pricing = pricingData;
    eventBus.emit(Events.PRICING_UPDATED, pricingData);
  }

  setFormData(formKey, data) {
    this._state.forms[formKey] = { ...this._state.forms[formKey], ...data };
    this._state.ui.isDirty = true;
    eventBus.emit(Events.FORM_CHANGED, { formKey, data });
  }

  getFormData(formKey) {
    return this._state.forms[formKey] || {};
  }

  setRestoring(isRestoring) {
    this._state.ui.isRestoring = isRestoring;
  }

  // Bulk operations
  resetForms() {
    Object.keys(this._state.forms).forEach(key => {
      this._state.forms[key] = {};
    });
    this._state.ui.isDirty = false;
    eventBus.emit(Events.OFFER_RESET, {});
  }

  // Serialization for persistence
  toJSON() {
    return {
      currentOfferType: this._state.currentOfferType,
      currentStep: this._state.currentStep,
      forms: this._state.forms,
    };
  }

  fromJSON(json) {
    if (!json) return;
    this.setRestoring(true);
    try {
      if (json.currentOfferType) this._state.currentOfferType = json.currentOfferType;
      if (json.currentStep) this._state.currentStep = json.currentStep;
      if (json.forms) {
        Object.entries(json.forms).forEach(([key, data]) => {
          this._state.forms[key] = data;
        });
      }
    } finally {
      this.setRestoring(false);
    }
  }
}

// Singleton
export const stateManager = new StateManager();