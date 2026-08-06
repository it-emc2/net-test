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
    ...(overrides.pricingRules ? { pricingRules: overrides.pricingRules } : {}),
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

      test('bwt uses global markup like other offer types', async () => {
        const payload = createBasePayload({ activeOffer: 'bwt' });
        const result = await pricing.computePrices(payload);
        
        expect(result.markupPct).toBe(0.35);
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
            // Real value sent by the "twoPersons" checkbox (Kundendaten
            // budgetOptionsPanel), not a made-up enum key.
            budgetOption: 'Zwei Personen mit Pflegegrad',
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
    // Fahrzeug/Werkzeug/Beräumung are billed per Arbeitstag (workDays), not a
    // flat one-off amount — createBasePayload() defaults workDays to 0, so
    // these need it set explicitly to exercise the "one work day" case.
    test('includes Fahrzeugbereitstellung', async () => {
      const payload = createBasePayload({ Arbeitszeit: { workDays: 1 } });
      const result = await pricing.computePrices(payload);

      const fahrzeug = result.services.lines.find(l => l.key === 'fahrzeug');
      expect(fahrzeug).toBeDefined();
      expect(fahrzeug.amount).toBe(80);
    });

    test('includes Werkzeuge', async () => {
      const payload = createBasePayload({ Arbeitszeit: { workDays: 1 } });
      const result = await pricing.computePrices(payload);

      const werkzeug = result.services.lines.find(l => l.key === 'werkzeuge');
      expect(werkzeug).toBeDefined();
      expect(werkzeug.amount).toBe(7.5);
    });

    test('includes Beräumung', async () => {
      const payload = createBasePayload({ Arbeitszeit: { workDays: 1 } });
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

    // Regression: Arbeitszeit (Facharbeiter hours) must be billed even though
    // its price-math line is deliberately hidden from the offer PDF
    // (docxHide:true). This used to be silently dropped from services.sum
    // entirely when the BWT included-lines override replaced services.lines.
    test('Arbeitszeit hours are billed even though the hour-math line is hidden from the offer', async () => {
      const payload = createBasePayload({
        activeOffer: 'bwt',
        Arbeitszeit: {
          totalHoursNumeric: 5,
          ArbeitHoursNumeric: 5,
          ReiseHoursNumeric: 0,
          distanceKm: 0,
        },
        bwt: {},
      });

      const result = await pricing.computePrices(payload);

      const visibleOnly = (result.bwtIncludedDisplayUI || [])
        .filter((l) => !l.docxHide)
        .reduce((acc, l) => acc + (Number(l.lineTotal) || 0), 0);

      // services.sum must include the hidden labor line, not just
      // Fahrzeug/Werkzeug/Beräumung.
      expect(result.services.sum).toBeGreaterThan(visibleOnly);

      const laborLine = (result.bwtIncludedDisplayUI || []).find(
        (l) => l.productId === 'facharbeiter',
      );
      expect(laborLine).toBeDefined();
      expect(laborLine.docxHide).toBe(true);
      expect(laborLine.lineTotal).toBeGreaterThan(0);
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

    // BWT_KM_FREE_THRESHOLD / BWT_TRAVEL_TIME_FREE_HOURS are admin-tunable.
    // If the admin later tightens them, already-saved offers must keep the
    // number they were quoted with — buildPayload() snapshots the value into
    // pricingRules at save time; pricing.js must read that snapshot, not the
    // live cfg.get(), and must fall back to the historical 200 km / 2 h (not
    // whatever's live) when a payload predates this mechanism entirely.
    test('Freigrenzen: snapshot in pricingRules wins over the live config; missing snapshot falls back to 200 km / 2 h', async () => {
      const arbeitszeit = {
        distanceKm: 18, // 36 km round trip
        travelDays: 1,
        workDays: 1,
        ArbeitHoursNumeric: 5,
        ReiseHoursNumeric: 2.5,
      };
      const payloadFor = (pricingRulesOverride) =>
        createBasePayload({
          activeOffer: 'bwt',
          Arbeitszeit: arbeitszeit,
          bwt: {},
          ...(pricingRulesOverride ? { pricingRules: pricingRulesOverride } : {}),
        });

      const noSnapshot = await pricing.computePrices(payloadFor(undefined));
      const explicitLegacy = await pricing.computePrices(
        payloadFor({ bwtKmFreeThreshold: 200, bwtTravelTimeFreeHours: 2 }),
      );
      const explicitNoFreeAllowance = await pricing.computePrices(
        payloadFor({ bwtKmFreeThreshold: 0, bwtTravelTimeFreeHours: 0 }),
      );

      // No snapshot at all (offer predates this feature) behaves exactly like
      // an explicit 200/2 snapshot — both keep the historical free allowance.
      expect(noSnapshot.services.sum).toBeCloseTo(explicitLegacy.services.sum, 2);

      // An offer that explicitly opted into (or was created under) a 0/0
      // rule bills strictly more: full Reisezeit + Kilometerpauschale kick in.
      expect(explicitNoFreeAllowance.services.sum).toBeGreaterThan(noSnapshot.services.sum);
    });

    // Lieferkosten Badewannentür + Kleinmaterial moved from the "services"
    // (Auszuführende Arbeiten) bucket into materials (Material für
    // Badewannentür) so the PDF can show them as their own itemized position —
    // same total price, different position. Guards against three ways that
    // reclassification can silently break: still counted twice, still taxed
    // with Aufschlag, or newly discounted by the material Rabatt %.
    test('Lieferkosten + Kleinmaterial are materials, not services, and stay markup/rabatt-neutral', async () => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: '1226', price: 800, name: 'Standard Tür' },
          { productId: '140322', price: 59, name: 'Lieferkosten' },
          { productId: 'KM02', price: 150, name: 'Kleinmaterial' },
        ]),
      });

      const payload = createBasePayload({
        activeOffer: 'bwt',
        Kundendaten: { aufschlag: '35%' },
        bwt: { bwtDoorStdQty: 1 },
        rabatt: { materialDiscountPct: 0.05 },
      });

      const result = await pricing.computePrices(payload);

      const byId = (id) =>
        result.materials.lines.find((l) => l.productId === id);
      expect(byId('140322')).toBeDefined();
      expect(byId('KM02')).toBeDefined();

      // Not double-counted in the labor/services bucket.
      const inServices = (id) =>
        (result.bwtIncludedDisplayUI || []).some((l) => l.productId === id || l.key === id);
      expect(inServices('140322')).toBe(false);
      expect(inServices('KM02')).toBe(false);

      // Markup applies only to the door (800), not Lieferkosten/Kleinmaterial.
      expect(result.markupBase).toBeCloseTo(800, 2);

      // Rabatt (5%) applies only to the door (800), not Lieferkosten/Kleinmaterial.
      expect(result.rabattAmount).toBeCloseTo(40, 2);
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

  describe('Aufschlag / Kleinmaterial rule is payload-gated', () => {
    const km02Payload = (extra) =>
      createBasePayload({
        activeOffer: 'bu',
        Kundendaten: { aufschlag: '50%' },
        duschwanne: { smallMaterial: true },
        ...extra,
      });

    beforeEach(() => {
      mockProductModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { productId: 'KM02', price: 100, name: 'Kleinmaterial' },
        ]),
      });
    });

    test('legacy payload (no flag) excludes Kleinmaterial from the markup', async () => {
      const result = await pricing.computePrices(km02Payload());
      const km = result.materials.lines.find((l) => l.productId === 'KM02');
      expect(km).toBeDefined();
      // KM02 is the only line and it is excluded → markup 0 (unchanged legacy).
      expect(result.markup).toBe(0);
    });

    test('new-rules payload includes Kleinmaterial in the 50% markup', async () => {
      const result = await pricing.computePrices(
        km02Payload({ pricingRules: { kleinInAufschlag: true } }),
      );
      // Kleinmaterial (100) now part of the 50% Aufschlag base → markup 50.
      expect(result.markup).toBe(50);
    });
  });
});
