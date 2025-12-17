// tests/unit/utils/validation.test.js
import { validateCustomerData, validateRequired } from '../../../src/utils/validation.js';

describe('validateCustomerData', () => {
  const validData = {
    firstName: 'Max',
    lastName: 'Mustermann',
    street: 'Musterstraße 1',
    zipCode: '12345',
    city: 'Berlin',
    email: 'max@example.com',
  };

  test('returns valid for complete data', () => {
    const result = validateCustomerData(validData);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('requires firstName', () => {
    const result = validateCustomerData({ ...validData, firstName: '' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'firstName' })
    );
  });

  test('requires lastName', () => {
    const result = validateCustomerData({ ...validData, lastName: null });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'lastName' })
    );
  });

  test('validates zipCode format (5 digits)', () => {
    const invalidZips = ['1234', '123456', 'abcde', ''];
    
    invalidZips.forEach(zipCode => {
      const result = validateCustomerData({ ...validData, zipCode });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ field: 'zipCode' })
      );
    });
  });

  test('validates email format if provided', () => {
    const result = validateCustomerData({ ...validData, email: 'invalid-email' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });

  test('allows empty email', () => {
    const result = validateCustomerData({ ...validData, email: '' });
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ field: 'email' })
    );
  });

  test('collects multiple errors', () => {
    const result = validateCustomerData({});
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('validateRequired', () => {
  test('returns invalid for null', () => {
    expect(validateRequired(null, 'Test').isValid).toBe(false);
  });

  test('returns invalid for undefined', () => {
    expect(validateRequired(undefined, 'Test').isValid).toBe(false);
  });

  test('returns invalid for empty string', () => {
    expect(validateRequired('', 'Test').isValid).toBe(false);
  });

  test('returns valid for non-empty value', () => {
    expect(validateRequired('value', 'Test').isValid).toBe(true);
    expect(validateRequired(0, 'Test').isValid).toBe(true);
    expect(validateRequired(false, 'Test').isValid).toBe(true);
  });
});