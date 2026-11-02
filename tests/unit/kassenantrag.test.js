import { findKasse, defaultReason, antragValues, missingFields, missingAnswers, antragText, antragSubject, buildKassenantragHtml } from '../../src/templates/kassenantrag.js';

const sr = {
  offerNumber: 'ANG-1',
  prefill: { firstName: 'Else', lastName: 'Fröhlich', street: 'Schachtstr. 19', postalCode: '06132', city: 'Halle', geburtsdatum: '1946-04-13' },
  payloadSnapshot: { Kundendaten: { kk_versichertennr: 'G1', kassenkundeName: 'Barmer', pflegegrad: '2', emc2_contact: 'Max Muster', wohnsituation: 'Miete', vermieterGenehmigung: 'Ja' } },
};
const data = { PrimaryServiceLines: [{ ServiceLine: '- Demontage der Badewanne' }, { ServiceLine: 'Einbau der Duschwanne' }] };
const onSite = {
  individualReason: 'Die vorhandene Wanne ist trotz Haltegriff nicht mehr sicher zu betreten.',
  answers: { wohnsituation: 'Miete', vermieter: 'liegt vor', weitere: 1, zweck: ['erleichtert', 'bogus'] },
  signer: 'Tina Test',
};

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

test('antragValues: list address, cleaned offer lines, prefilled answers, short subject', () => {
  const v = antragValues(sr, data);
  expect(v).toMatchObject({ kasseName: 'BARMER', name: 'Fröhlich, Else', geburtsdatum: '13.04.1946', kvnr: 'G1', signer: 'Max Muster' });
  expect(v.kasseAddress).toEqual(['BARMER Pflegekasse', '73524 Schwäbisch Gmünd']);
  // A typed address never beats a full list address; it only fills a gap.
  const typed = (name) => ({ ...sr, payloadSnapshot: { Kundendaten: { ...sr.payloadSnapshot.Kundendaten, kassenkundeName: name, kk_krankenkasseAdresse: 'Nordhausen' } } });
  expect(antragValues(typed('mkk'), data).kasseAddress).toEqual(['Pflegekasse der mkk – meine krankenkasse', '10857 Berlin']);
  expect(antragValues(typed('TK'), data).kasseAddress).toEqual(['Techniker Krankenkasse – Pflegeversicherung', 'Nordhausen']);
  expect(v.measures).toEqual(['Demontage der Badewanne', 'Einbau der Duschwanne']);
  expect(v.answers).toEqual({ wohnsituation: 'Miete', vermieter: 'liegt vor', weitere: 0, zweck: [] });
  expect(missingFields(v)).toEqual([]);
  expect(antragSubject(v)).toBe('Wohnumfeldverbesserung – Fröhlich Else – KVNR: G1');
});

test('on-site input: individual reason first, answers in the letter, signer = sender', () => {
  const v = antragValues(sr, data, { measures: ['Nur das', ' '], ...onSite });
  expect(v.measures).toEqual(['Nur das']);
  expect(v.reason.startsWith(onSite.individualReason)).toBe(true);
  expect(v.reason).toContain('§ 40 SGB XI erforderlich');
  expect(v.answers.zweck).toEqual(['erleichtert']);
  expect(missingAnswers(v)).toEqual([]);
  const text = antragText(v);
  expect(text).toContain('Mietwohnung – Zustimmung des Vermieters liegt vor');
  expect(text).toContain('Bad nutzen: 1');
  expect(text).toContain('i. A. Tina Test');
  expect(buildKassenantragHtml(v)).toContain('<li>Nur das</li>');
});

test('missing offer data and missing on-site answers block sending', () => {
  const v = antragValues({ ...sr, payloadSnapshot: { Kundendaten: {} } }, data, { individualReason: 'zu kurz' });
  expect(missingFields(v)).toEqual(['Pflegekasse', 'Versichertennummer']);
  expect(missingAnswers(v)).toEqual(['individuelle Begründung (mind. 1 Satz)', 'Wohnsituation', 'Ziel der Maßnahme']);
});
