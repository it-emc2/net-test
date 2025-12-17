// src/models/StateManager.js
import { eventBus, Events } from "../events/EventBus.js";

class StateManager {
  constructor() {
    this._state = {
      currentOfferType: null,
      currentStep: "home",
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
         hms: {},
          wd: {},
      },
      pricing: null,
      ui: {
        isRestoring: false,
        isDirty: false,
      },
    };

    this._subscribers = new Map();
    this._setupEventListeners();
  }

  _setupEventListeners() {
    // Listen for field-level updates from views
    eventBus.on(Events.FORM_FIELD_CHANGED, ({ formKey, field, value }) => {
      this.setField(formKey, field, value);
    });

    // Listen for bulk updates
    eventBus.on(Events.FORM_DATA_SET, ({ formKey, data }) => {
      this.setFormData(formKey, data);
    });
  }

  // === Getters ===
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

  get isDirty() {
    return this._state.ui.isDirty;
  }

  // === Setters with event emission ===
  setOfferType(offerType) {
    const prev = this._state.currentOfferType;
    this._state.currentOfferType = offerType;
    if (prev !== offerType) {
      eventBus.emit(Events.OFFER_STARTED, { offerType, previousType: prev });
      this._persist();
    }
  }

  setStep(step) {
    const prev = this._state.currentStep;
    this._state.currentStep = step;
    if (prev !== step) {
      eventBus.emit(Events.STEP_CHANGED, { step, previousStep: prev });
      this._persist();
    }
  }

  setPricing(pricingData) {
    this._state.pricing = pricingData;
    eventBus.emit(Events.PRICING_UPDATED, pricingData);
  }

  // === Form Data Management ===
  
  /**
   * Set a single field in a form
   * @param {string} formKey - Form identifier (e.g., 'Kundendaten')
   * @param {string} field - Field name
   * @param {*} value - Field value
   */
  setField(formKey, field, value) {
    if (!this._state.forms[formKey]) {
      this._state.forms[formKey] = {};
    }

    const prevValue = this._state.forms[formKey][field];
    
    // Only update if value actually changed
    if (prevValue === value) return;

    this._state.forms[formKey][field] = value;
    this._state.ui.isDirty = true;

    // Emit specific field changed event
    eventBus.emit(Events.FIELD_CHANGED, { 
      formKey, 
      field, 
      value, 
      prevValue 
    });

    // Emit form-specific event for targeted subscriptions
    eventBus.emit(`${Events.FORM_CHANGED}:${formKey}`, { 
      field, 
      value,
      formData: this._state.forms[formKey]
    });

    // Emit general form changed event
    eventBus.emit(Events.FORM_CHANGED, { 
      formKey, 
      data: this._state.forms[formKey] 
    });

    // Persist after debounce
    this._debouncedPersist();
  }

  /**
   * Set multiple fields at once
   */
  setFormData(formKey, data) {
    if (!this._state.forms[formKey]) {
      this._state.forms[formKey] = {};
    }

    const prevData = { ...this._state.forms[formKey] };
    this._state.forms[formKey] = { ...this._state.forms[formKey], ...data };
    this._state.ui.isDirty = true;

    eventBus.emit(Events.FORM_CHANGED, { 
      formKey, 
      data: this._state.forms[formKey],
      prevData
    });

    eventBus.emit(`${Events.FORM_CHANGED}:${formKey}`, { 
      formData: this._state.forms[formKey],
      prevData
    });

    this._debouncedPersist();
  }

  /**
   * Get field value
   */
  getField(formKey, field) {
    return this._state.forms[formKey]?.[field];
  }

  /**
   * Get all form data
   */
  getFormData(formKey) {
    return this._state.forms[formKey] || {};
  }

  /**
   * Get all form data for payload building
   */
  getAllFormData() {
    return { ...this._state.forms };
  }

  setRestoring(isRestoring) {
    this._state.ui.isRestoring = isRestoring;
  }

  // === Bulk operations ===
  resetForms() {
    Object.keys(this._state.forms).forEach((key) => {
      this._state.forms[key] = {};
    });
    this._state.ui.isDirty = false;
    this._clearPersisted();
    eventBus.emit(Events.OFFER_RESET, {});
  }

  resetForm(formKey) {
    if (this._state.forms[formKey]) {
      this._state.forms[formKey] = {};
      eventBus.emit(Events.FORM_CHANGED, { formKey, data: {} });
      this._persist();
    }
  }

  // === Persistence ===
  _persist() {
    try {
      const data = this.toJSON();
      sessionStorage.setItem('emc2_wizard_state', JSON.stringify(data));
      
      // Also persist to individual keys for legacy compatibility
      Object.entries(this._state.forms).forEach(([key, formData]) => {
        sessionStorage.setItem(key, JSON.stringify(formData));
      });
      
      this._state.ui.isDirty = false;
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  _debouncedPersist() {
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => this._persist(), 300);
  }

  _clearPersisted() {
    sessionStorage.removeItem('emc2_wizard_state');
    Object.keys(this._state.forms).forEach(key => {
      sessionStorage.removeItem(key);
    });
  }

  restore() {
    this.setRestoring(true);
    try {
      // Try to restore from new format first
      const saved = sessionStorage.getItem('emc2_wizard_state');
      if (saved) {
        this.fromJSON(JSON.parse(saved));
        return true;
      }

      // Fall back to legacy format (individual keys)
      let restored = false;
      Object.keys(this._state.forms).forEach(key => {
        const data = sessionStorage.getItem(key);
        if (data) {
          try {
            this._state.forms[key] = JSON.parse(data);
            restored = true;
          } catch (e) {
            console.warn(`Failed to restore ${key}:`, e);
          }
        }
      });

      // Restore offer type
      const offerType = sessionStorage.getItem('offerType');
      if (offerType) {
        this._state.currentOfferType = offerType;
        restored = true;
      }

      if (restored) {
        eventBus.emit(Events.STATE_RESTORED, { state: this._state });
      }

      return restored;
    } finally {
      this.setRestoring(false);
    }
  }

  // === Serialization ===
  toJSON() {
    return {
      currentOfferType: this._state.currentOfferType,
      currentStep: this._state.currentStep,
      forms: this._state.forms,
      timestamp: Date.now()
    };
  }

  fromJSON(json) {
    if (!json) return;
    
    this.setRestoring(true);
    try {
      if (json.currentOfferType) {
        this._state.currentOfferType = json.currentOfferType;
      }
      if (json.currentStep) {
        this._state.currentStep = json.currentStep;
      }
      if (json.forms) {
        Object.entries(json.forms).forEach(([key, data]) => {
          this._state.forms[key] = data;
        });
      }
      
      eventBus.emit(Events.STATE_RESTORED, { state: this._state });
    } finally {
      this.setRestoring(false);
    }
  }

  // === Validation Support ===
  validate(formKey, rules) {
    const formData = this.getFormData(formKey);
    const errors = [];

    Object.entries(rules).forEach(([field, validators]) => {
      const value = formData[field];
      
      validators.forEach(validator => {
        const error = validator(value, formData);
        if (error) {
          errors.push({ field, message: error });
        }
      });
    });

    const isValid = errors.length === 0;
    
    eventBus.emit(Events.VALIDATION_RESULT, {
      formKey,
      isValid,
      errors
    });

    return { isValid, errors };
  }

  // === Debug/Dev Tools ===
  dump() {
    return JSON.stringify(this._state, null, 2);
  }

  load(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.fromJSON(data);
      this._persist();
      return true;
    } catch (e) {
      console.error('Failed to load state:', e);
      return false;
    }
  }
}

// Singleton
export const stateManager = new StateManager();

// Dev tools
if (typeof window !== 'undefined') {
  window.__EMC2_STATE__ = stateManager;
}