// src/views/FormViewBase.js
import { ViewBase } from './ViewBase.js';
import { eventBus, Events } from '../events/EventBus.js';
import { stateManager } from '../models/StateManager.js';

export class FormViewBase extends ViewBase {
  constructor(containerId, formKey) {
    super(containerId);
    this.formKey = formKey;
    this._formElements = new Map();
    this._validationRules = {};
  }

  // Auto-register form fields
  registerFormField(name, selector = null) {
    const element = selector ? this.$(selector) : this.$(`[name="${name}"]`);
    if (!element) {
      console.warn(`[${this.constructor.name}] Field "${name}" not found`);
      return null;
    }

    this._formElements.set(name, element);

    // Auto-sync to state on change
    this.addListener(element, 'input', (e) => {
      const value = this.getFieldValue(element);
      this.onFieldChange(name, value);
    });

    // Special handling for checkboxes/radios
    if (element.type === 'checkbox' || element.type === 'radio') {
      this.addListener(element, 'change', (e) => {
        const value = this.getFieldValue(element);
        this.onFieldChange(name, value);
      });
    }

    return element;
  }

  registerAllFields(containerSelector = null) {
    const container = containerSelector ? this.$(containerSelector) : this.container;
    if (!container) return;

    const fields = container.querySelectorAll('input, select, textarea');
    
    fields.forEach(field => {
      if (field.name) {
        this.registerFormField(field.name);
      }
    });
  }

  // Get field value (handles different input types)
  getFieldValue(element) {
    if (!element) return null;

    if (element.type === 'checkbox') {
      return element.checked;
    }
    
    if (element.type === 'radio') {
      const checked = this.container.querySelector(`[name="${element.name}"]:checked`);
      return checked ? checked.value : null;
    }
    
    if (element.type === 'number') {
      return element.value === '' ? null : parseFloat(element.value);
    }

    if (element.tagName === 'SELECT' && element.multiple) {
      return Array.from(element.selectedOptions).map(opt => opt.value);
    }
    
    return element.value;
  }

  // Set field value
  setFieldValue(name, value) {
    const element = this._formElements.get(name);
    if (!element) return;

    if (element.type === 'checkbox') {
      element.checked = !!value;
    } else if (element.type === 'radio') {
      const radio = this.container.querySelector(`[name="${name}"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else if (element.tagName === 'SELECT' && element.multiple && Array.isArray(value)) {
      Array.from(element.options).forEach(opt => {
        opt.selected = value.includes(opt.value);
      });
    } else {
      element.value = value ?? '';
    }

    // Trigger change event for any dependent UI updates
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Field change handler - override in subclasses for custom behavior
  onFieldChange(fieldName, value) {
    // Emit to StateManager
    eventBus.emit(Events.FORM_FIELD_CHANGED, {
      formKey: this.formKey,
      field: fieldName,
      value
    });
  }

  // Get all form data
  getFormData() {
    const data = {};
    this._formElements.forEach((element, name) => {
      data[name] = this.getFieldValue(element);
    });
    return data;
  }

  // Set all form data
  setFormData(data) {
    if (!data) return;
    
    Object.entries(data).forEach(([name, value]) => {
      this.setFieldValue(name, value);
    });
  }

  // Sync from StateManager
  syncFromState() {
    const data = stateManager.getFormData(this.formKey);
    this.setFormData(data);
  }

  // Sync to StateManager
  syncToState() {
    const data = this.getFormData();
    eventBus.emit(Events.FORM_DATA_SET, {
      formKey: this.formKey,
      data
    });
  }

  // Listen to state changes
  setupStateSync() {
    // Listen for state changes (from other sources)
    this.subscribe(`${Events.FORM_CHANGED}:${this.formKey}`, ({ formData }) => {
      if (!stateManager.isRestoring) {
        this.setFormData(formData);
      }
    });

    // Listen for specific field changes
    this.subscribe(Events.FIELD_CHANGED, ({ formKey, field, value }) => {
      if (formKey === this.formKey && !stateManager.isRestoring) {
        this.setFieldValue(field, value);
      }
    });

    // Initial sync from state
    this.syncFromState();
  }

  // === Validation ===
  
  setValidationRules(rules) {
    this._validationRules = rules;
  }

  validate() {
    return stateManager.validate(this.formKey, this._validationRules);
  }

  showFieldError(fieldName, message) {
    const element = this._formElements.get(fieldName);
    if (!element) return;

    element.classList.add('error', 'border-red-500');
    element.setAttribute('aria-invalid', 'true');

    let errorEl = element.parentElement.querySelector('.error-message');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'error-message text-red-600 text-sm mt-1';
      element.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  clearFieldError(fieldName) {
    const element = this._formElements.get(fieldName);
    if (!element) return;

    element.classList.remove('error', 'border-red-500');
    element.removeAttribute('aria-invalid');

    const errorEl = element.parentElement.querySelector('.error-message');
    if (errorEl) errorEl.remove();
  }

  clearAllErrors() {
    this._formElements.forEach((_, name) => this.clearFieldError(name));
  }

  handleValidationResult({ formKey, isValid, errors }) {
    if (formKey !== this.formKey) return;

    this.clearAllErrors();

    if (!isValid) {
      errors.forEach(({ field, message }) => {
        this.showFieldError(field, message);
      });
    }
  }

  // === Lifecycle ===
  
  init() {
    this.setupStateSync();
    
    // Listen to validation results
    this.subscribe(Events.VALIDATION_RESULT, (result) => {
      this.handleValidationResult(result);
    });
  }

  destroy() {
    // Sync one final time before destroying
    if (this._formElements.size > 0) {
      this.syncToState();
    }
    
    super.destroy();
  }
}