// tests/integration/flow/OfferFlow.test.js
import { jest } from '@jest/globals';
import { stateManager } from '../../../src/models/StateManager.js';
import { navigationController } from '../../../src/controllers/NavigationController.js';
import { eventBus, Events } from '../../../src/events/EventBus.js';
import { OFFERS } from '../../../src/config/offers.js';

describe('Complete Offer Flow', () => {
  const handlers = [];

  const registerHandler = (event, handler) => {
    const unsubscribe = eventBus.on(event, handler);
    handlers.push({ event, handler, unsubscribe });
    return unsubscribe;
  };

  beforeEach(() => {
    stateManager.resetForms();
    stateManager.setOfferType(null);
    stateManager.setStep('home');
    
    // Clean up handlers from previous tests
    handlers.forEach(({ event, handler }) => {
      eventBus.off(event, handler);
    });
    handlers.length = 0;
  });

  afterEach(() => {
    handlers.forEach(({ event, handler }) => {
      eventBus.off(event, handler);
    });
    handlers.length = 0;
  });

  describe('BU (Badumbau) complete flow', () => {
    test('can complete entire BU wizard', () => {
      const stepHistory = [];
      registerHandler(Events.STEP_CHANGED, ({ step }) => stepHistory.push(step));

      navigationController.startOffer('bu');
      expect(stateManager.currentOfferType).toBe('bu');
      expect(stateManager.currentStep).toBe('Kundendaten');

      stateManager.setFormData('Kundendaten', {
        firstName: 'Max',
        lastName: 'Mustermann',
        street: 'Teststraße 1',
        zipCode: '12345',
        city: 'Berlin',
      });

      const buPages = OFFERS.bu.pages;
      
      for (let i = 0; i < buPages.length - 1; i++) {
        expect(stateManager.currentStep).toBe(buPages[i]);
        navigationController.navigateNext();
      }

      expect(stateManager.currentStep).toBe('Rabatt');

      buPages.forEach(page => {
        expect(stepHistory).toContain(page);
      });
    });

    test('can navigate backwards through wizard', () => {
      navigationController.startOffer('bu');
      
      navigationController.navigateNext();
      navigationController.navigateNext();
      navigationController.navigateNext();
      
      expect(stateManager.currentStep).toBe('Wandverkleidung');

      navigationController.navigatePrev();
      expect(stateManager.currentStep).toBe('Duschwanne');
      
      navigationController.navigatePrev();
      expect(stateManager.currentStep).toBe('Arbeitszeit');
    });

    test('preserves form data when navigating', () => {
      navigationController.startOffer('bu');
      
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      navigationController.navigateNext();
      
      stateManager.setFormData('Arbeitszeit', { hours: '2:30' });
      navigationController.navigateNext();
      
      navigationController.navigatePrev();
      navigationController.navigatePrev();
      
      expect(stateManager.getFormData('Kundendaten').firstName).toBe('Max');
      expect(stateManager.getFormData('Arbeitszeit').hours).toBe('2:30');
    });
  });

  describe('BWT short flow', () => {
    test('BWT has only 2 steps', () => {
      navigationController.startOffer('bwt');
      
      expect(stateManager.currentStep).toBe('Kundendaten');
      expect(OFFERS.bwt.pages).toHaveLength(2);

      navigationController.navigateNext();
      expect(stateManager.currentStep).toBe('bwt');

      navigationController.navigateNext();
      expect(stateManager.currentStep).toBe('bwt');
    });
  });

  describe('switching offers', () => {
    test('resets forms when switching offer types', () => {
      navigationController.startOffer('bu');
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      navigationController.navigateNext();
      
      navigationController.startOffer('bwt');
      
      expect(stateManager.getFormData('Kundendaten')).toEqual({});
      expect(stateManager.currentStep).toBe('Kundendaten');
    });
  });
});