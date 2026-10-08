import { resolveFields, buildVollmachtHtml, baseDocKey, isPartnerKey } from '../../src/templates/signing-docs.js';

const sr = {
  prefill: { firstName: 'Else', lastName: 'Fröhlich', street: 'Schachtstr. 19', postalCode: '06132', city: 'Halle', phone: '0171', email: 'a@b.de', geburtsdatum: '1946-04-13' },
  payloadSnapshot: { Kundendaten: { kk_versichertennr: 'G1', kassenkundeName: 'Tk',
    partnerFirstName: 'Karl', partnerLastName: 'Fröhlich', partnerKvnr: 'P2', partnerGeburtsdatum: '1944-01-02', partnerKassenkundeName: 'AOK', partnerPflegegrad: '2' } },
};

test('partner keys', () => {
  expect(isPartnerKey('vollmacht_p2')).toBe(true);
  expect(baseDocKey('abtretung_p2')).toBe('abtretung');
  expect(isPartnerKey('vollmacht')).toBe(false);
});

test('p2 reads partner fields, shares household contact data', () => {
  const f = resolveFields(sr, { key: 'vollmacht_p2' });
  expect(f).toMatchObject({ firstName: 'Karl', kk_versichertennr: 'P2', kassenkundeName: 'AOK', street: 'Schachtstr. 19', pflegegrad: '2' });
  expect(resolveFields(sr, { key: 'vollmacht' })).toMatchObject({ firstName: 'Else', kk_versichertennr: 'G1' });
});

test('p2 edits override, p2 Vollmacht renders partner name', () => {
  expect(resolveFields(sr, { key: 'vollmacht_p2', editedFields: { kk_versichertennr: 'X' } }).kk_versichertennr).toBe('X');
  expect(buildVollmachtHtml(sr, { key: 'vollmacht_p2' }, 'display')).toContain('value="Karl"');
});
