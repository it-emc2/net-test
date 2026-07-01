import { buildAhData } from '../../src/routes/docx-template.js';

// Alltagsbegleitung-only offer: HnD has no trips, so the HnD-only `anfahrtTotal`
// is 0. The single combined Anfahrtspauschale line must still show a Gesamtpreis
// for the Alltagsbegleitung trips — which the grand total already includes.
// (52/12 trips/month × 7,96 € = 34,49 €.)
const abOnlyBody = {
  ah: {
    services: [
      {
        type: 'Alltagsbegleitung',
        schedules: [{ dauer: '1:00', regelmaessigkeit: 'Wöchentlich' }],
        tasks: [],
      },
    ],
  },
  Arbeitszeit: { ahTravelZone: '1' },
};

test('Anfahrtspauschale Gesamt is filled for an Alltagsbegleitung-only offer', () => {
  const data = buildAhData(abOnlyBody);
  expect(data.AhAnfahrtMenge).not.toBe('');       // trips shown
  expect(data.AhAnfahrtEinzelpreis).not.toBe('');  // unit price shown
  expect(data.AhAnfahrtGesamt).not.toBe('');       // must not be empty
});

test('Anfahrtspauschale Gesamt reflects all trips (52/12 × 7,96 € = 34,49 €)', () => {
  const data = buildAhData(abOnlyBody);
  expect(data.AhAnfahrtGesamt).toContain('34,49');
});
