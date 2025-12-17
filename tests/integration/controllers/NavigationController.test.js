// tests/controllers/NavigationController.test.js
import { navigationController } from '../../../src/controllers/NavigationController.js';
import { stateManager } from '../../../src/models/StateManager.js';

describe('NavigationController', () => {
  beforeEach(() => {
    stateManager.resetForms();
    stateManager.setOfferType(null);
    stateManager.setStep('home');
    window.location.hash = '';
    sessionStorage.clear();
  });

  describe('getPagesForOffer', () => {
    test('returns correct pages for BU offer', () => {
      const pages = navigationController.getPagesForOffer('bu');
      
      expect(pages).toContain('Kundendaten');
      expect(pages).toContain('Duschwanne');
      expect(pages).toContain('Wandverkleidung');
    });

    test('returns correct pages for BWT offer', () => {
      const pages = navigationController.getPagesForOffer('bwt');
      
      expect(pages).toContain('Kundendaten');
      expect(pages).toContain('bwt');
      expect(pages).not.toContain('Duschwanne');
    });

    test('returns empty array for unknown offer', () => {
      const pages = navigationController.getPagesForOffer('unknown');
      expect(pages).toEqual([]);
    });
  });

  describe('normalizeStep', () => {
    test('returns first page if step is invalid', () => {
      const step = navigationController.normalizeStep('invalid', 'bu');
      expect(step).toBe('Kundendaten');
    });

    test('returns step if valid for offer', () => {
      const step = navigationController.normalizeStep('Duschwanne', 'bu');
      expect(step).toBe('Duschwanne');
    });
  });

  describe('startOffer', () => {
    test('resets forms and navigates to first page', () => {
      stateManager.setFormData('Kundendaten', { firstName: 'Max' });
      
      navigationController.startOffer('bu');

      expect(stateManager.currentOfferType).toBe('bu');
      expect(stateManager.currentStep).toBe('Kundendaten');
      expect(stateManager.getFormData('Kundendaten')).toEqual({});
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      navigationController.startOffer('bu');
    });

    test('navigateNext moves to next page', () => {
      navigationController.navigateNext();
      expect(stateManager.currentStep).toBe('Arbeitszeit');
    });

    test('navigatePrev moves to previous page', () => {
      navigationController.navigateTo('Arbeitszeit');
      navigationController.navigatePrev();
      expect(stateManager.currentStep).toBe('Kundendaten');
    });

    test('navigatePrev does nothing on first page', () => {
      navigationController.navigatePrev();
      expect(stateManager.currentStep).toBe('Kundendaten');
    });
  });
});