// tests/unit/config/offers.test.js
import { OFFERS } from '../../../src/config/offers.js';

describe('OFFERS configuration', () => {
  test('has all required offer types', () => {
    expect(OFFERS).toHaveProperty('bu');
    expect(OFFERS).toHaveProperty('bwt');
    expect(OFFERS).toHaveProperty('hl');
    expect(OFFERS).toHaveProperty('ah');
  });

  describe('bu (Badumbau)', () => {
    test('has correct name', () => {
      expect(OFFERS.bu.name).toBe('Badumbau');
    });

    test('has 7 pages in correct order', () => {
      expect(OFFERS.bu.pages).toHaveLength(7);
      expect(OFFERS.bu.pages[0]).toBe('Kundendaten');
      expect(OFFERS.bu.pages[1]).toBe('Arbeitszeit');
      expect(OFFERS.bu.pages[2]).toBe('Duschwanne');
      expect(OFFERS.bu.pages[3]).toBe('Wandverkleidung');
      expect(OFFERS.bu.pages[4]).toBe('Duschabtrennung');
      expect(OFFERS.bu.pages[5]).toBe('Optional');
      expect(OFFERS.bu.pages[6]).toBe('Rabatt');
    });

    test('Kundendaten is always first', () => {
      expect(OFFERS.bu.pages[0]).toBe('Kundendaten');
    });
  });

  describe('bwt (BWT)', () => {
    test('has 2 pages', () => {
      expect(OFFERS.bwt.pages).toHaveLength(2);
      expect(OFFERS.bwt.pages).toContain('Kundendaten');
      expect(OFFERS.bwt.pages).toContain('bwt');
    });
  });

  describe('all offers start with Kundendaten', () => {
    test.each(Object.keys(OFFERS))('%s starts with Kundendaten', (offerType) => {
      expect(OFFERS[offerType].pages[0]).toBe('Kundendaten');
    });
  });
});