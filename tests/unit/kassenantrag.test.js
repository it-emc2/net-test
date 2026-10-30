import { findKasse, defaultReason, antragValues, missingFields, antragText, buildKassenantragHtml } from '../../src/templates/kassenantrag.js';

const sr = {
  offerNumber: 'ANG-1',
  prefill: { firstName: 'Else', lastName: 'Fröhlich', street: 'Schachtstr. 19', postalCode: '06132', city: 'Halle', geburtsdatum: '1946-04-13' },
  payloadSnapshot: { Kundendaten: { kk_versichertennr: 'G1', kassenkundeName: 'Barmer', pflegegrad: '2', emc2_contact: 'Max Muster' } },
};
const data = { PrimaryServiceLines: [{ ServiceLine: '- Demontage der Badewanne' }, { ServiceLine: 'Einbau der Duschwanne' }] };

test('findKasse: exact, alias, longest contained name, unknown', () => {
  expect(findKasse('barmer').id).toBe('barmer');
  expect(findKasse('Techniker').id).toBe('tk');
  expect(findKasse('IKK gesund plus Magdeburg').id).toBe('ikk-gesund-plus');
  expect(findKasse('AOK')).toBeNull();
  expect(findKasse('')).toBeNull();
});

test('defaultReason names the fixture being replaced', () => {
  expect(defaultReason(['Demontage der Badewanne', 'Einbau der Duschwanne'])).toContain('bisherigen Badewanne');
  expect(defaultReason(['Einbau der Duschwanne'])).toContain('bisherigen Duschwanne');
  expect(defaultReason(['Haltegriff'])).toContain('bisherigen Sanitäreinrichtungen');
});

test('antragValues: list address, offer lines, rep overrides, formatted birth date', () => {
  const v = antragValues(sr, data);
  expect(v).toMatchObject({ kasseName: 'BARMER', name: 'Fröhlich, Else', geburtsdatum: '13.04.1946', kvnr: 'G1', signer: 'Max Muster' });
  expect(v.kasseAddress).toEqual(['BARMER Pflegekasse', '73524 Schwäbisch Gmünd']);
  expect(v.measures).toEqual(['Demontage der Badewanne', 'Einbau der Duschwanne']);
  expect(missingFields(v)).toEqual([]);

  const o = antragValues(sr, data, { measures: ['Nur das', ' '], reason: 'Eigene Begründung' });
  expect(o.measures).toEqual(['Nur das']);
  expect(o.reason).toBe('Eigene Begründung');
  expect(antragText(o)).toContain('- Nur das');
  expect(buildKassenantragHtml(o)).toContain('<li>Nur das</li>');
});

test('missingFields blocks an incomplete Antrag', () => {
  const v = antragValues({ ...sr, payloadSnapshot: { Kundendaten: {} } }, data);
  expect(missingFields(v)).toEqual(['Pflegekasse', 'Versichertennummer']);
});
