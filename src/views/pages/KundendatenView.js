// src/views/pages/KundendatenView.js
import { FormViewBase } from '../FormViewBase.js';
import { eventBus, Events } from '../../events/EventBus.js';
import { stateManager } from '../../models/StateManager.js';

export class KundendatenView extends FormViewBase {
  constructor() {
    super('page-kundendaten', 'Kundendaten');
    this.init();
  }

  init() {
    super.init(); // Important: call parent init for state sync

    // Register all fields
    this.registerAllFields();

    // Setup validation rules
    this.setValidationRules({
      salutation: [
        (v) => !v ? 'Anrede ist erforderlich' : null
      ],
      firstName: [
        (v) => !v ? 'Vorname ist erforderlich' : null,
        (v) => v && v.length < 2 ? 'Vorname zu kurz' : null
      ],
      lastName: [
        (v) => !v ? 'Nachname ist erforderlich' : null
      ],
      email: [
        (v) => !v ? 'E-Mail ist erforderlich' : null,
        (v) => v && !v.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) ? 'Ungültige E-Mail' : null
      ],
      phone: [
        (v) => !v ? 'Telefonnummer ist erforderlich' : null
      ],
      street: [
        (v) => !v ? 'Straße ist erforderlich' : null
      ],
      postalCode: [
        (v) => !v ? 'PLZ ist erforderlich' : null,
        (v) => v && !v.match(/^\d{5}$/) ? 'PLZ muss 5 Ziffern haben' : null
      ],
      city: [
        (v) => !v ? 'Stadt ist erforderlich' : null
      ],
    });

    // Setup special behaviors
    this.setupSpecialBehaviors();
  }

  setupSpecialBehaviors() {
    // Bitrix24 contact loader
    const bitrixBtn = this.$('#load-bitrix-contact');
    if (bitrixBtn) {
      this.addListener(bitrixBtn, 'click', () => this.loadBitrixContact());
    }

    // Distance suggester
    const distanceBtn = this.$('#suggest-distance');
    if (distanceBtn) {
      this.addListener(distanceBtn, 'click', () => this.suggestDistance());
    }

    // Budget panel
    this.setupBudgetPanel();
  }

  setupBudgetPanel() {
    const budgetRadios = this.$$('input[name="budgetOption"]');
    budgetRadios.forEach(radio => {
      this.addListener(radio, 'change', (e) => {
        this.onBudgetOptionChange(e.target.value);
      });
    });

    const pflegegradCheckboxes = this.$$('input[name="pflegegrad[]"]');
    pflegegradCheckboxes.forEach(cb => {
      this.addListener(cb, 'change', () => {
        this.updateBudgetCalculation();
      });
    });

    const wohnumfeldInput = this.$('#wohnumfeld-previous');
    if (wohnumfeldInput) {
      this.addListener(wohnumfeldInput, 'input', () => {
        this.updateBudgetCalculation();
      });
    }

    // Restore budget panel state on init
    const currentOption = stateManager.getField('Kundendaten', 'budgetOption');
    if (currentOption) {
      this.onBudgetOptionChange(currentOption);
    }
  }

  onBudgetOptionChange(option) {
    const panels = {
      '4180-maximal': this.$('#budget-max-panel'),
      '8360-zwei-personen': this.$('#budget-two-persons-panel'),
      '4180-zuzahlung': this.$('#budget-copay-panel')
    };

    // Hide all panels
    Object.values(panels).forEach(panel => {
      if (panel) panel.hidden = true;
    });

    // Show selected panel
    if (panels[option]) {
      panels[option].hidden = false;
    }

    this.updateBudgetCalculation();
  }

  updateBudgetCalculation() {
    const budgetData = {
      budgetOption: this.$('input[name="budgetOption"]:checked')?.value,
      pflegegrad: Array.from(this.$$('input[name="pflegegrad[]"]:checked')).map(cb => cb.value),
      wohnumfeldPrevious: parseFloat(this.$('#wohnumfeld-previous')?.value || 0)
    };

    eventBus.emit('budget:calculation:requested', budgetData);
  }

  async loadBitrixContact() {
    const contactId = this.$('#bitrix-contact-id')?.value;
    if (!contactId) {
      eventBus.emit(Events.NOTIFICATION_WARNING, 'Bitte Kontakt-ID eingeben');
      return;
    }

    try {
      eventBus.emit(Events.LOADING_START, { source: 'bitrix' });

      const response = await fetch(`/api/bitrix/contact/${contactId}`);
      const data = await response.json();

      if (data.result) {
        // Update state via StateManager
        const contactData = {
          salutation: data.result.HONORIFIC || 'Herr',
          firstName: data.result.NAME || '',
          lastName: data.result.LAST_NAME || '',
          phone: data.result.PHONE?.[0]?.VALUE || '',
          email: data.result.EMAIL?.[0]?.VALUE || '',
          street: data.result.ADDRESS || '',
          city: data.result.ADDRESS_CITY || '',
          postalCode: data.result.ADDRESS_POSTAL_CODE || ''
        };

        // This will automatically update the view via state sync
        eventBus.emit(Events.FORM_DATA_SET, {
          formKey: this.formKey,
          data: contactData
        });

        eventBus.emit(Events.NOTIFICATION_SUCCESS, 'Kontaktdaten geladen');
      }
    } catch (error) {
      console.error('Bitrix load failed:', error);
      eventBus.emit(Events.NOTIFICATION_ERROR, 'Fehler beim Laden der Kontaktdaten');
    } finally {
      eventBus.emit(Events.LOADING_END, { source: 'bitrix' });
    }
  }

  async suggestDistance() {
    const customerData = stateManager.getFormData('Kundendaten');
    
    if (!customerData.street || !customerData.city) {
      eventBus.emit(Events.NOTIFICATION_WARNING, 'Bitte Straße und Stadt eingeben');
      return;
    }

    try {
      eventBus.emit(Events.LOADING_START, { source: 'distance' });

      const response = await fetch('/api/routing/suggest-distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Kundendaten: customerData })
      });

      const data = await response.json();
      
      if (data.roundTripKm) {
        stateManager.setField('Kundendaten', 'distanceKm', Math.round(data.roundTripKm));
        eventBus.emit(Events.NOTIFICATION_SUCCESS, 
          `Geschätzte Entfernung: ${Math.round(data.roundTripKm)} km`
        );
      }
    } catch (error) {
      console.error('Distance suggestion failed:', error);
      eventBus.emit(Events.NOTIFICATION_ERROR, 'Fehler bei der Entfernungsberechnung');
    } finally {
      eventBus.emit(Events.LOADING_END, { source: 'distance' });
    }
  }

  // Override to add pre-validation before state update
  onFieldChange(fieldName, value) {
    // Clear error on field change
    this.clearFieldError(fieldName);

    // Call parent to update state
    super.onFieldChange(fieldName, value);

    // Trigger pricing update on relevant fields
    const pricingRelevantFields = ['distanceKm', 'budgetOption', 'pflegegrad'];
    if (pricingRelevantFields.includes(fieldName)) {
      eventBus.emit(Events.PRICING_REQUESTED);
    }
  }
}