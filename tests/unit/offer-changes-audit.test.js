// Every hand change on an offer must be visible afterwards: Bitrix timeline lines + EmailLog fields.
import { describeOfferChanges, sha256 } from '../../src/lib/offerChanges.js';
import EmailLog from '../../src/models/EmailLog.js';

test('no changes → no audit lines', () => {
  expect(describeOfferChanges({})).toEqual([]);
  expect(describeOfferChanges({ overrides: { textReplacements: [], priceAdjustments: [] } })).toEqual([]);
});

test('wording, price and edited docx are all named, with the user', () => {
  const lines = describeOfferChanges({
    user: 'a@emc2.de',
    overrides: {
      textReplacements: [{ from: 'Gleittür', to: 'Flexibles Duschsystem' }],
      priceAdjustments: [{ target: 'material', amountNet: 100 }],
      extraHinweise: ['Montage nach Absprache'],
    },
    editedDocx: { name: 'ANG1.docx', sha256: sha256(Buffer.from('x')) },
  });
  const text = lines.join('\n');
  expect(lines[0]).toBe('✏️ Angebot angepasst (von a@emc2.de):');
  expect(text).toContain('„Gleittür“ → „Flexibles Duschsystem“');
  expect(text).toMatch(/Material \(Pos\. 002\): \+100,00\s€ netto \(\+119,00\s€ brutto\)/);
  expect(text).toContain('Zusätzlicher Hinweis: Montage nach Absprache');
  expect(text).toContain('Handbearbeitete DOCX hochgeladen: ANG1.docx');
  expect(text).toContain(sha256(Buffer.from('x')).slice(0, 12));
});

test('EmailLog stores overrides + docx hash; both stay absent when unused', () => {
  const log = new EmailLog({
    to: 'k@x.de',
    offerOverrides: { priceAdjustments: [{ target: 'material', amountNet: 1 }] },
    editedDocx: { name: 'a.docx', sha256: 'abc', size: 3 },
    sentBy: 'a@emc2.de',
  });
  expect(log.validateSync()).toBeUndefined();
  expect(log.editedDocx.sha256).toBe('abc');
  const plain = new EmailLog({ to: 'k@x.de' });
  expect(plain.editedDocx).toBeUndefined();
  expect(plain.offerOverrides).toBeUndefined();
});

// ---- single positions changed on the Kosten page (offerOverrides.lineEdits) ----
import { lineDescription, wordingRules } from '../../src/lib/docxTextReplace.js';

test('line description = the label without dash and quantity', () => {
  expect(lineDescription('- 2 Stk Haltegriff 40 cm')).toBe('Haltegriff 40 cm');
  expect(lineDescription('- 1,00 Stk Fahrzeugbereitstellung')).toBe('Fahrzeugbereitstellung');
  expect(lineDescription('- 273 km Kilometerpauschale ')).toBe('Kilometerpauschale');
  expect(lineDescription('- 2,5 m² Wandverkleidung weiß')).toBe('Wandverkleidung weiß');
  expect(lineDescription('- 90x90 Duschwanne')).toBe('90x90 Duschwanne');
  expect(lineDescription('Duschwanne')).toBe('Duschwanne');
});

test('a reworded position becomes a wording rule on the text the document prints', () => {
  const strip = (s) => s.replace(/\bTRINNITY\b/g, '').replace(/\s{2,}/g, ' ').trim();
  const rules = wordingRules({
    textReplacements: [{ from: 'Gleittür', to: 'Duschsystem' }],
    lineEdits: [
      { block: 'material', id: 'A', origLabel: '- 1 Stk TRINNITY Wannenabdichtband-Set 3,4 m', label: 'Abdichtband (Sonderlänge)' },
      { block: 'material', id: 'B', origLabel: '- 1 Stk X', label: '', unitPriceNet: 5 }, // price only
      { block: 'material', id: 'C', origLabel: '- 1 Stk Y', label: 'Y' },                 // unchanged
    ],
  }, strip);
  expect(rules).toEqual([
    { from: 'Gleittür', to: 'Duschsystem' },
    { from: 'Wannenabdichtband-Set 3,4 m', to: 'Abdichtband (Sonderlänge)' },
  ]);
  expect(wordingRules(undefined)).toEqual([]);
});

test('changed positions are named in the audit lines', () => {
  const lines = describeOfferChanges({ overrides: { lineEdits: [
    { block: 'material', id: 'A', origLabel: '- 1 Stk Duschwanne', label: 'Duschwanne extraflach', unitPriceNet: 250, origUnitPriceNet: 300, reason: 'Sonderpreis' },
  ] } });
  expect(lines).toHaveLength(3);
  expect(lines[1].replace(/\u00a0/g, ' ')).toContain('Preis „1 Stk Duschwanne“: 250,00 € netto je Einheit statt 300,00 € – Grund: Sonderpreis');
  expect(lines[2]).toBe('• Beschreibung „1 Stk Duschwanne“ → „Duschwanne extraflach“');
});
