// tests/unit/utils/formatters.test.js
import { 
  euro, 
  euroC, 
  parseMoneyEuro, 
  hhmmToHours, 
  hoursToHHMM 
} from '../../../src/utils/formatters.js';

describe('euro', () => {
  test('formats number as German decimal', () => {
    expect(euro(1234.56)).toBe('1.234,56');
    expect(euro(0)).toBe('0,00');
    expect(euro(1000)).toBe('1.000,00');
  });

  test('handles null/undefined', () => {
    expect(euro(null)).toBe('0,00');
    expect(euro(undefined)).toBe('0,00');
  });
});

describe('euroC', () => {
  test('formats number as Euro currency', () => {
    expect(euroC(1234.56)).toMatch(/1\.234,56/);
    expect(euroC(1234.56)).toMatch(/€/);
  });
});

describe('parseMoneyEuro', () => {
  test('parses German format (comma decimal)', () => {
    expect(parseMoneyEuro('1.234,56')).toBe(1234.56);
    expect(parseMoneyEuro('1.234,56 €')).toBe(1234.56);
  });

  test('parses simple format', () => {
    expect(parseMoneyEuro('1234.56')).toBe(1234.56);
    expect(parseMoneyEuro('100')).toBe(100);
  });

  test('returns 0 for invalid input', () => {
    expect(parseMoneyEuro('')).toBe(0);
    expect(parseMoneyEuro(null)).toBe(0);
    expect(parseMoneyEuro('abc')).toBe(0);
  });
});

describe('hhmmToHours', () => {
  test('converts HH:MM to decimal hours', () => {
    expect(hhmmToHours('01:30')).toBe(1.5);
    expect(hhmmToHours('02:00')).toBe(2);
    expect(hhmmToHours('00:45')).toBe(0.75);
  });

  test('returns 0 for invalid input', () => {
    expect(hhmmToHours('')).toBe(0);
    expect(hhmmToHours(null)).toBe(0);
    expect(hhmmToHours('invalid')).toBe(0);
  });
});

describe('hoursToHHMM', () => {
  test('converts decimal hours to H:MM', () => {
    expect(hoursToHHMM(1.5)).toBe('1:30');
    expect(hoursToHHMM(2)).toBe('2:00');
    expect(hoursToHHMM(0.75)).toBe('0:45');
  });

  test('handles zero and invalid', () => {
    expect(hoursToHHMM(0)).toBe('0:00');
    expect(hoursToHHMM(null)).toBe('0:00');
  });
});
