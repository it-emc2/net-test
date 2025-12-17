// tests/unit/models/StateManager.test.js
import { jest } from '@jest/globals';
import { stateManager } from '../../../src/models/StateManager.js';
import { eventBus, Events } from '../../../src/events/EventBus.js';

describe('StateManager', () => {
  beforeEach(() => {
    stateManager.resetForms();
    stateManager.setOfferType(null);
    stateManager.setStep('home');
  });

  describe('offer type management', () => {
    test('setOfferType updates state and emits event', () => {
      const handler = jest.fn();
      eventBus.on(Events.OFFER_STARTED, handler);

      stateManager.setOfferType('bu');

      expect(stateManager.currentOfferType).toBe('bu');
      expect(handler).toHaveBeenCalledWith({
        offerType: 'bu',
        previousType: null,
      });
    });

    test('setOfferType does not emit if same value', () => {
      stateManager.setOfferType('bu');
      const handler = jest.fn();
      eventBus.on(Events.OFFER_STARTED, handler);
      stateManager.setOfferType('bu');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('step management', () => {
    test('setStep updates state and emits event', () => {
      const handler = jest.fn();
      eventBus.on(Events.STEP_CHANGED, handler);
      stateManager.setStep('Kundendaten');
      expect(stateManager.currentStep).toBe('Kundendaten');
      expect(handler).toHaveBeenCalledWith({
        step: 'Kundendaten',
        previousStep: 'home',
      });
    });
  });

  describe('form data management', () => {
    test('setFormData merges with existing data', () => {
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      stateManager.setFormData('Kundendaten', { lastName: 'Mustermann' });
      const data = stateManager.getFormData('Kundendaten');
      expect(data).toEqual({ firstName: 'Max', lastName: 'Mustermann' });
    });

    test('setFormData emits FORM_CHANGED event', () => {
      const handler = jest.fn();
      eventBus.on(Events.FORM_CHANGED, handler);
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      expect(handler).toHaveBeenCalledWith({
        formKey: 'Kundendaten',
        data: { firstName: 'Max' },
      });
    });

    test('resetForms clears all form data', () => {
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      stateManager.resetForms();
      expect(stateManager.getFormData('Kundendaten')).toEqual({});
    });
  });

  describe('serialization', () => {
    test('toJSON returns current state', () => {
      stateManager.setOfferType('bwt');
      stateManager.setStep('Arbeitszeit');
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      const json = stateManager.toJSON();
      expect(json.currentOfferType).toBe('bwt');
      expect(json.currentStep).toBe('Arbeitszeit');
      expect(json.forms.Kundendaten.firstName).toBe('Max');
    });

    test('fromJSON restores state', () => {
      const saved = {
        currentOfferType: 'hl',
        currentStep: 'Rabatt',
        forms: { Kundendaten: { firstName: 'Anna' } },
      };
      stateManager.fromJSON(saved);
      expect(stateManager.currentOfferType).toBe('hl');
      expect(stateManager.currentStep).toBe('Rabatt');
      expect(stateManager.getFormData('Kundendaten').firstName).toBe('Anna');
    });
  });
});
