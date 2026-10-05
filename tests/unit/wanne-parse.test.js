import { parseWanneDoc } from '../../src/routes/bathtubs.js';

// Real name/finish pairs from vigor.products (category "badewanne"). Vigor has no
// structured dimension or variant fields for these, so every attribute below is
// parsed out of this free text — if the scraper's wording drifts, these fail.
const doc = (articleNumber, name, finish) => ({
  articleNumber,
  name,
  finish,
  netPrice: 100,
});

test('tub: size, side, Schürze and Zulauf come out of name + finish', () => {
  const p = parseWanneDoc(
    doc(
      'IRIS160L2SWE',
      'Badewanne Acryl Iris 160x70/80cm weiß li',
      'm.2 Schürzen weiß m.WE Novellini',
    ),
  );
  expect(p.type).toBe('tub');
  expect(p.side).toBe('links');
  expect(p.lengthCm).toBe(160);
  expect(p.widthCm).toBe(70);
  expect(p.widthMaxCm).toBe(80);
  expect(p.schuerze).toBe('2 Schürzen');
  expect(p.zulauf).toBe('Wanneneinlauf');
});

test('tub: Frontschürze with plain drain, right-handed', () => {
  const p = parseWanneDoc(
    doc(
      'IRIS160RS',
      'Badewanne Acryl Iris 160x70/80cm weiß re',
      'm.Frontschürze weiß m.Abl. Novellini',
    ),
  );
  expect(p.side).toBe('rechts');
  expect(p.schuerze).toBe('Frontschürze');
  expect(p.zulauf).toBe('Ablauf');
});

test('screen: width x height and side panel come out of finish', () => {
  const p = parseWanneDoc(
    doc(
      'IRISWAS75L',
      'NOV Iris COMBY Wannenaufsatz für Iris li',
      '24/60x150cm ESG klar chrom.m.S75',
    ),
  );
  expect(p.type).toBe('screen');
  expect(p.side).toBe('links');
  expect(p.widthCm).toBe(60);
  expect(p.heightCm).toBe(150);
  expect(p.seitenwand).toBe('S75');
  expect(p.klappbar).toBe(false);
  expect(p.glas).toBe('ESG klar');
  expect(p.rahmen).toBe('chrom');
});

// The folding variants are the ones that used to render "60 × null cm": their
// finish has no "x<height>" block, so the height has to come from the name.
test('screen: folding variant takes its height from the name, never null', () => {
  const p = parseWanneDoc(
    doc(
      'IRISWA14R',
      'Wannenaufsatz für Iris rechts Höhe 140cm',
      '24/60cm klappb. ESG klar chrom Novellini',
    ),
  );
  expect(p.side).toBe('rechts');
  expect(p.widthCm).toBe(60);
  expect(p.heightCm).toBe(140);
  expect(p.seitenwand).toBe('ohne');
  expect(p.klappbar).toBe(true);
});

test('screen: 140 cm COMBY variant is distinguished from the 150 cm one', () => {
  const p = parseWanneDoc(
    doc(
      'IRISWA14S70L',
      'NOV Iris COMBY Wannenaufsatz für Iris li',
      '24/60x140cm ESG klar chrom.m.S70',
    ),
  );
  expect(p.heightCm).toBe(140);
  expect(p.seitenwand).toBe('S70');
});

test('a doc without an article number is dropped', () => {
  expect(parseWanneDoc({ name: 'x', finish: 'y' })).toBeNull();
});

// The picker renders the scraper's CDN url directly and falls back to a local
// placeholder when there is none, so the field must be the url or null — never
// an empty string or undefined, which would render as a broken <img src="">.
test('image passes the first scraper url through, or null when absent', () => {
  const withImg = parseWanneDoc({
    ...doc('IRISWA14L', 'n', 'f'),
    images: ['https://media.onlineplus.store/abc', 'https://media.onlineplus.store/def'],
  });
  expect(withImg.image).toBe('https://media.onlineplus.store/abc');

  expect(parseWanneDoc(doc('IRISWA14L', 'n', 'f')).image).toBeNull();
  expect(parseWanneDoc({ ...doc('IRISWA14L', 'n', 'f'), images: [] }).image).toBeNull();
});
