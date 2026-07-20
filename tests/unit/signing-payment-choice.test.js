import { hasPaymentChoice } from '../../src/templates/signing-docs.js';

test('hasPaymentChoice is true when SelfPayLines has "O " options (KK >= threshold, SZ)', () => {
  const lines = [
    { Text: 'Wählen Sie aus folgenden Zahlungsbedingungen...', IsTitle: true },
    { Text: 'O 50 % sofort und 50 % nach Fertigstellung, ohne Abzug oder', IsTitle: false },
    { Text: 'O 100 % sofort abzüglich 2 % Skonto', IsTitle: false },
  ];
  expect(hasPaymentChoice(lines)).toBe(true);
});

test('hasPaymentChoice is false for a single fixed line (KK Selbstkostenanteil under threshold)', () => {
  const lines = [
    { Text: 'Zahlungsbedingungen für den Selbstkostenanteil:', IsTitle: true },
    { Text: '100 % sofort, aber ohne Skonto', IsTitle: false },
  ];
  expect(hasPaymentChoice(lines)).toBe(false);
});

test('hasPaymentChoice is false for empty/missing SelfPayLines', () => {
  expect(hasPaymentChoice([])).toBe(false);
  expect(hasPaymentChoice(undefined)).toBe(false);
});
