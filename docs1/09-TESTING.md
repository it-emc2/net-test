# Testing Guide

## Overview

Testing uses **Jest 29** with both Node.js and JSDOM environments. Tests are organized by type: unit, integration, and end-to-end.

## Configuration

### Jest Config (in `package.json`)

```json
{
  "jest": {
    "testEnvironment": "node",
    "coverageDirectory": "coverage",
    "collectCoverageFrom": [
      "src/**/*.js",
      "!src/public/**",
      "!src/templates/**",
      "!src/app.js",
      "!src/server.js"
    ],
    "testMatch": [
      "**/tests/**/*.test.js",
      "**/tests/**/*.spec.js"
    ],
    "setupFilesAfterSetup": ["./tests/setup.js"],
    "testTimeout": 10000
  }
}
```

### Test Setup (`tests/setup.js`)

Provides browser-like environment for frontend tests:
- JSDOM for browser APIs (document, window, localStorage, sessionStorage)
- Global `fetch` mock
- localStorage/sessionStorage mocks with cleanup
- Automatic cleanup between tests

## Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage

# Validate (lint + unit tests)
npm run validate
```

## Test Structure

```
tests/
+-- setup.js                    # Jest setup (JSDOM, mocks)
+-- unit/
|   +-- pricing.test.js         # Pricing engine unit tests
|   +-- bwt-save-restore.test.js # BWT form save/restore round-trip
|   +-- validation.test.js      # Input validation tests
|   +-- StateManager.test.js    # State management tests
|   +-- EventBus.test.js        # Event system tests
|   +-- logic/
|       +-- pricing.test.js     # Direct pricing logic tests
+-- integration/
|   +-- OfferFlow.test.js       # End-to-end offer creation
|   +-- (API integration tests)
+-- e2e/
    +-- (End-to-end browser tests)
```

## Key Test Files

### Pricing Tests (`tests/unit/pricing.test.js`)

Tests the core pricing computation engine with mock ProductModel.

**Test Scenarios**:
- **Example A (BU)**: Bathroom renovation with optional grab bar
  - Verifies 35% markup applied correctly
  - Verifies material line items calculated
  - Verifies service costs (vehicle, tools, clearance, km, labor)
  - Verifies VAT (19%) calculation
  - Verifies subsidy deduction

- **Example B (BWT)**: Bathtub door with grab bar
  - Verifies **zero markup** on BWT materials
  - Verifies BWT grab bar gets markup applied to lineTotal only
  - Verifies "Enthalt je Einheit" breakdown
  - Verifies extra hours calculation

**Mock ProductModel**:
```javascript
const MockProduct = {
  find: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue([
      { productId: 'SLA8090W', name: 'Duschwanne...', price: 299 },
      { productId: 'CLPESG30', name: 'Haltegriff 30cm', price: 45 },
      // ... more products
    ])
  })
};
```

### BWT Save/Restore Tests (`tests/unit/bwt-save-restore.test.js`)

Tests the save/restore round-trip for BWT form fields (571 lines).

**What It Tests**:
1. `formToObject()` captures all BWT fields correctly from DOM
2. `restoreBwt()` restores DOM state from saved payload
3. All door variants (Standard, Wien, Wien Glas, Budget, Variodoor) save/restore
4. Quantities, colors, heights, dimensions preserved
5. Anschlag (hinge side) and tray color radio buttons
6. Quick-add rows with custom items

**Known Bug Fixed**: `syncBwtDoorStdHeightCaption()` was undefined, blocking restore of Anschlag/Farbe fields. Fixed with `typeof` guard.

### Validation Tests (`tests/unit/validation.test.js`)

Tests customer data validation:
- Required fields: firstName, lastName
- Email format validation
- Postal code format (5-digit German)
- Street and city presence

### StateManager Tests (`tests/unit/StateManager.test.js`)

Tests centralized state management:
- Field set/get operations
- Event emission on state changes
- Form data bulk operations
- Serialization/deserialization
- sessionStorage persistence

### EventBus Tests (`tests/unit/EventBus.test.js`)

Tests pub/sub event system:
- Subscribe and emit
- Unsubscribe
- Once (single-fire)
- Context binding
- Multiple subscribers
- Event cleanup

## Testing Patterns

### Mocking the Database

For pricing tests, the ProductModel is mocked:

```javascript
import pricingFactory from '../../src/logic/pricing.js';

const mockProducts = [
  { productId: 'SLA8090W', name: 'Duschwanne', price: 299 },
  { productId: 'KM02', name: 'Kleinmaterial', price: 25 }
];

const MockModel = {
  find: jest.fn(() => ({
    lean: jest.fn(() => Promise.resolve(mockProducts))
  }))
};

const { computePrices } = pricingFactory(MockModel);
```

### DOM Testing (JSDOM)

For frontend tests requiring DOM:

```javascript
// Setup provides document, window, localStorage, sessionStorage
// Create DOM elements for testing
document.body.innerHTML = `
  <form id="bwt-form">
    <input name="bwtDoorStdQty" value="1">
    <input type="checkbox" name="bwtDoorStd" checked>
  </form>
`;

// Test form interactions
const form = document.getElementById('bwt-form');
expect(form.querySelector('[name="bwtDoorStdQty"]').value).toBe('1');
```

### API Testing (Supertest)

For integration tests:

```javascript
import request from 'supertest';
import app from '../../src/app.js';

describe('POST /api/price', () => {
  it('should compute prices', async () => {
    const res = await request(app)
      .post('/api/price')
      .send(testPayload)
      .expect(200);
    
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.materials).toBeDefined();
  });
});
```

## Coverage

Coverage is collected from `src/**/*.js` excluding:
- `src/public/**` (frontend - needs browser environment)
- `src/templates/**` (static templates)
- `src/app.js` (entry point)
- `src/server.js` (legacy entry point)

Reports are output to `coverage/` directory.

## Dev Dependencies for Testing

```json
{
  "jest": "^29.7.0",
  "supertest": "^7.0.0",
  "jsdom": "^25.0.1",
  "@jest/globals": "latest"
}
```
