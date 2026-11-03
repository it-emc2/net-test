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
