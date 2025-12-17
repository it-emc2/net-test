// tests/unit/logic/pricing.test.js
import { jest } from '@jest/globals';

// The pricing module exports a factory function that takes ProductModel
import pricingFactory from '../../../src/logic/pricing.js';

/**
 * Creates a minimal valid payload with all required nested structures
 */
function createBasePayload(overrides = {}) {
  const base = {
    Kundendaten: {
      wohnumfeld: { done: false, amount: 0 },
      payer: 'Selbstzahler',
      aufschlag: '35%',
      ...overrides.Kundendaten,
    },
    Arbeitszeit: {
      distanceKm: 0,
      totalHoursNumeric: 0,
      totalHoursHHMM: '0:00',
      ReiseHoursNumeric: 0,
      ArbeitHoursNumeric: 0,
      ...overrides.Arbeitszeit,
    },
    duschwanne: overrides.duschwanne || {},
    wandverkleidung: overrides.wandverkleidung || {},
    duschabtrennung: overrides.duschabtrennung || {},
    optional: overrides.optional || {},
    rabatt: overrides.rabatt || {},
    bwt: overrides.bwt || {},
    hl: overrides.hl || {},
    activeOffer: overrides.activeOffer || 'bu',
    pricing: overrides.pricing || {},
  };

  // Deep merge Kundendaten.wohnumfeld if provided separately
  if (overrides.Kundendaten?.wohnumfeld) {
    base.Kundendaten.wohnumfeld = {
      done: false,
      amount: 0,
      ...overrides.Kundendaten.wohnumfeld,
    };
  }

  return base;
}

describe('Pricing Module', () => {
  let mockProductModel;
  let pricing;

  beforeEach(() => {
    mockProductModel = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      }),
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      })
    };
    
    pricing = pricingFactory(mockProductModel);
  });

  describe('factory function', () => {
    test('returns object with computePrices method', () => {
      expect(pricing).toHaveProperty('computePrices');
      expect(typeof pricing.computePrices).toBe('function');
    });
  });

  describe('computePrices', () => {
    test('returns expected structure for empty payload', async () => {
      const payload = createBasePayload();
      const result = await pricing.computePrices(payload);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('materials');
      expect(result).toHaveProperty('services');
      expect(result).toHaveProperty('productsSubtotal');
      expect(result).toHaveProperty('markup');
      expect(result).toHaveProperty('vatOnNet');
      expect(result).toHaveProperty('total');
    });

    test('calculates 19% VAT', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'TEST1', price: 100, name: 'Test Product' }
        ])
      });

      const payload = createBasePayload({
        optional: { opt_TEST1: true, qty_TEST1: 1 },
      });

      const result = await pricing.computePrices(payload);
      
      if (result.netAfterRabatt_and_Bonus > 0) {
        const expectedVat = Math.round((result.netAfterRabatt_and_Bonus * 0.19 + Number.EPSILON) * 100) / 100;
        expect(result.vatOnNet).toBeCloseTo(expectedVat, 2);
      }
    });

    describe('offer types', () => {
      test('defaults to bu offer type', async () => {
        const payload = createBasePayload({ activeOffer: 'bu' });
        const result = await pricing.computePrices(payload);
        
        expect(result.materials.title).toBe('Material für Badumbau');
      });

      test('recognizes bwt offer type', async () => {
        const payload = createBasePayload({ activeOffer: 'bwt' });
        const result = await pricing.computePrices(payload);
        
        expect(result.materials.title).toBe('Material für Badewannentür');
      });

      test('recognizes hl offer type', async () => {
        const payload = createBasePayload({ activeOffer: 'hl' });
        const result = await pricing.computePrices(payload);
        
        expect(result.materials.title).toBe('Material für Handlauf');
      });

      test('bwt has zero markup', async () => {
        const payload = createBasePayload({ activeOffer: 'bwt' });
        const result = await pricing.computePrices(payload);
        
        expect(result.markupPct).toBe(0);
        expect(result.markup).toBe(0);
      });
    });

    describe('markup calculation', () => {
      test('extracts markup from Kundendaten.aufschlag percentage string', async () => {
        const payload = createBasePayload({
          Kundendaten: { aufschlag: '35%' }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.markupPct).toBe(0.35);
      });

      test('uses numeric markupPct from pricing if provided', async () => {
        const payload = createBasePayload({
          pricing: { markupPct: 0.25 }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.markupPct).toBe(0.25);
      });

      test('defaults to 35% markup when not specified', async () => {
        const payload = createBasePayload({
          Kundendaten: { aufschlag: undefined }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.markupPct).toBe(0.35);
      });
    });

    describe('discount calculation', () => {
      test('applies material discount percentage', async () => {
        mockProductModel.find.mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { productId: 'TEST1', price: 1000, name: 'Expensive Item' }
          ])
        });

        const payload = createBasePayload({
          optional: { opt_TEST1: true, qty_TEST1: 1 },
          rabatt: { materialDiscountPct: 0.05 }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.materialDiscountPct).toBe(0.05);
        const expectedRabatt = Math.round((result.productsSubtotal * 0.05 + Number.EPSILON) * 100) / 100;
        expect(result.rabattAmount).toBeCloseTo(expectedRabatt, 2);
      });
    });

    describe('bonus flags', () => {
      test('recognizes bonus300 flag', async () => {
        const payload = createBasePayload({
          rabatt: { bonus300: true }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.bonusFlags.bonus_neu).toBe(true);
        expect(result.bonusGross).toBeGreaterThanOrEqual(252.1);
      });

      test('recognizes bonusGrab flag', async () => {
        const payload = createBasePayload({
          rabatt: { bonusGrab: true }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.bonusFlags.bonus_Haltegriff).toBe(true);
      });
    });

    describe('subsidy calculation', () => {
      test('calculates 4180 maximal subsidy', async () => {
        const payload = createBasePayload({
          Kundendaten: {
            budgetOption: '4180_MAXIMAL',
            wohnumfeld: { done: false, amount: 0 }
          }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.subsidyAmount).toBe(4180);
      });

      test('calculates 8360 for two persons', async () => {
        const payload = createBasePayload({
          Kundendaten: {
            budgetOption: 'ZWEI_PERSONEN_8360',
            wohnumfeld: { done: false, amount: 0 }
          }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.subsidyAmount).toBe(8360);
      });

      test('subtracts prior wohnumfeld amount for Kassenkunde', async () => {
        const payload = createBasePayload({
          Kundendaten: {
            payer: 'Kassenkunde',
            budgetOption: '4180_MAXIMAL',
            wohnumfeld: { done: true, amount: 1000 }
          }
        });

        const result = await pricing.computePrices(payload);
        
        expect(result.subsidyAmount).toBe(4180);
        expect(result.prior).toBe(1000);
        expect(result.subsidyAmount_max).toBe(3180);
      });

      test('calculates selfPayAmount correctly', async () => {
        mockProductModel.find.mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { productId: 'TEST1', price: 5000, name: 'Expensive' }
          ])
        });

        const payload = createBasePayload({
          optional: { opt_TEST1: true, qty_TEST1: 1 },
          Kundendaten: {
            payer: 'Kassenkunde',
            budgetOption: '4180_MAXIMAL',
            wohnumfeld: { done: false, amount: 0 }
          }
        });

        const result = await pricing.computePrices(payload);
        
        const expectedSelf = Math.max(0, result.total - result.subsidyAmount_max);
        expect(result.selfPayAmount).toBeCloseTo(expectedSelf, 2);
      });
    });
  });

  describe('service costs', () => {
    test('includes Fahrzeugbereitstellung', async () => {
      const payload = createBasePayload();
      const result = await pricing.computePrices(payload);
      
      const fahrzeug = result.services.lines.find(l => l.key === 'fahrzeug');
      expect(fahrzeug).toBeDefined();
      expect(fahrzeug.amount).toBe(80);
    });

    test('includes Werkzeuge', async () => {
      const payload = createBasePayload();
      const result = await pricing.computePrices(payload);
      
      const werkzeug = result.services.lines.find(l => l.key === 'werkzeuge');
      expect(werkzeug).toBeDefined();
      expect(werkzeug.amount).toBe(7.5);
    });

    test('includes Beräumung', async () => {
      const payload = createBasePayload();
      const result = await pricing.computePrices(payload);
      
      const beraeumung = result.services.lines.find(l => l.key === 'beraeumung');
      expect(beraeumung).toBeDefined();
      expect(beraeumung.amount).toBe(4.5);
    });

    test('calculates kilometer cost', async () => {
      const payload = createBasePayload({
        Arbeitszeit: { distanceKm: 50 }
      });

      const result = await pricing.computePrices(payload);
      
      const km = result.services.lines.find(l => l.key === 'kilometer');
      expect(km).toBeDefined();
      expect(km.amount).toBe(35); // 100km round trip * 0.35
    });

    test('uses Kassenkunde labor rate of 69.5', async () => {
      const payload = createBasePayload({
        Kundendaten: { payer: 'Kassenkunde' },
        Arbeitszeit: { ArbeitHoursNumeric: 2 }
      });

      const result = await pricing.computePrices(payload);
      
      expect(result.services.laborRate).toBe(69.5);
    });

    test('uses Selbstzahler labor rate of 59.5', async () => {
      const payload = createBasePayload({
        Kundendaten: { payer: 'Selbstzahler' },
        Arbeitszeit: { ArbeitHoursNumeric: 2 }
      });

      const result = await pricing.computePrices(payload);
      
      expect(result.services.laborRate).toBe(59.5);
    });
  });

  describe('materials', () => {
    test('adds Abdicht-Set when selected', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'TRWDB', price: 50, name: 'Abdicht-Set' }
        ])
      });

      const payload = createBasePayload({
        duschwanne: { abdichtSet: true }
      });

      const result = await pricing.computePrices(payload);
      
      const line = result.materials.lines.find(l => l.productId === 'TRWDB');
      expect(line).toBeDefined();
    });

    test('adds drain set when selected', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'AGD9060', price: 75, name: 'Drain Set' }
        ])
      });

      const payload = createBasePayload({
        duschwanne: { drainSet: true }
      });

      const result = await pricing.computePrices(payload);
      
      const line = result.materials.lines.find(l => l.productId === 'AGD9060');
      expect(line).toBeDefined();
    });

    test('calculates wall panels with color', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'V3WVK09', price: 200, name: 'Wandverkleidung 997' }
        ])
      });

      const payload = createBasePayload({
        wandverkleidung: {
          wvQty997: 3,
          wvColor: 'Weiß'
        }
      });

      const result = await pricing.computePrices(payload);
      
      const line = result.materials.lines.find(l => l.productId === 'V3WVK09');
      expect(line).toBeDefined();
      expect(line.qty).toBe(3);
      expect(line.label).toContain('Weiß');
    });
  });

  describe('BWT specific', () => {
    test('includes BWT door materials', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: '1226', price: 800, name: 'Standard Tür' }
        ])
      });

      const payload = createBasePayload({
        activeOffer: 'bwt',
        bwt: { bwtDoorStdQty: 1 }
      });

      const result = await pricing.computePrices(payload);
      
      const doorLine = result.materials.lines.find(l => l.productId === '1226');
      expect(doorLine).toBeDefined();
    });

    test('includes BWT grab bars with markup', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'CLPESG40', price: 50, name: 'Haltegriff 40cm' }
        ])
      });

      const payload = createBasePayload({
        activeOffer: 'bwt',
        Kundendaten: { aufschlag: '35%' },
        bwt: { bwtAidsHaltegriff40Qty: 2 }
      });

      const result = await pricing.computePrices(payload);
      
      const grabLine = result.materials.lines.find(l => l.productId === 'CLPESG40');
      expect(grabLine).toBeDefined();
      // BWT grab bars: lineTotal = unitPrice * (1 + markup) * qty
      expect(grabLine.lineTotal).toBeCloseTo(135, 2);
    });

    test('returns bwtIncludedDisplayUI for BWT offers', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: '140322', price: 30, name: 'Lieferkosten' },
          { productId: 'KM02', price: 15, name: 'Kleinmaterial' }
        ])
      });

      const payload = createBasePayload({
        activeOffer: 'bwt',
        bwt: { bwtDoorStdQty: 1 }
      });

      const result = await pricing.computePrices(payload);
      
      expect(result.bwtIncludedDisplayUI).toBeDefined();
      expect(Array.isArray(result.bwtIncludedDisplayUI)).toBe(true);
    });
  });

  describe('optional products', () => {
    test('collects optional selections', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'CLPESG40', price: 50, name: 'Haltegriff 40' },
          { productId: 'CLPESG60', price: 60, name: 'Haltegriff 60' }
        ])
      });

      const payload = createBasePayload({
        optional: {
          opt_CLPESG40: true,
          qty_CLPESG40: 2,
          opt_CLPESG60: true,
          qty_CLPESG60: 1
        }
      });

      const result = await pricing.computePrices(payload);
      
      expect(result.grabCounts.total).toBe(3);
      expect(result.grabCounts.cl40).toBe(2);
    });

    test('separates optional lines for UI display', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'CLPESG40', price: 50, name: 'Haltegriff 40' }
        ])
      });

      const payload = createBasePayload({
        optional: {
          opt_CLPESG40: true,
          qty_CLPESG40: 1
        }
      });

      const result = await pricing.computePrices(payload);
      
      // materialsDisplayUI should NOT contain optional items
      const optInMaterials = result.materialsDisplayUI.lines.find(
        l => l.source === 'optional'
      );
      expect(optInMaterials).toBeUndefined();
    });
  });

  describe('rounding', () => {
    test('rounds monetary values to 2 decimal places', async () => {
      const payload = createBasePayload();
      const result = await pricing.computePrices(payload);
      
      const checkDecimals = (value) => {
        if (typeof value !== 'number') return true;
        const str = value.toString();
        const parts = str.split('.');
        return parts.length === 1 || parts[1].length <= 2;
      };

      expect(checkDecimals(result.productsSubtotal)).toBe(true);
      expect(checkDecimals(result.markup)).toBe(true);
      expect(checkDecimals(result.vatOnNet)).toBe(true);
      expect(checkDecimals(result.total)).toBe(true);
    });
  });
});