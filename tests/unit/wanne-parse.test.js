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

// ---- customer-facing description (Kostentabelle + PDF): never a brand ----
import { describeWanne } from '../../src/lib/wanneDescribe.js';
import { WANNE_SETS } from '../../src/lib/wanneSets.js';

const BRANDS = /steinkamp|novellini|ottofond|easy entry|iris|free-gate|comby/i;

test('describe: door set reads as plain product text with size and height', () => {
  const p = WANNE_SETS.find((x) => x.articleNumber === 'ST160-ER-TL-TRIO');
  expect(describeWanne(p)).toBe(
    'Badewanne mit Einstiegstür links, Einbau Ecke, Wand rechts, 160 × 75 × 58,5 cm, Trio-Ablauf',
  );
});

test('describe: screen carries side, height and side wall', () => {
  const p = parseWanneDoc(
    doc('IRISWAS75L', 'NOV Iris COMBY Wannenaufsatz für Iris li', '24/60x150cm ESG klar chrom.m.S75'),
  );
  expect(describeWanne(p)).toBe(
    'Wannenaufsatz, 2-teilig, Anschlag links, Höhe 150 cm, mit Seitenwand 75 cm, ESG-Glas klar, Profile chrom',
  );
});

test('describe: no article of the catalog leaks a brand name', () => {
  const iris = parseWanneDoc(
    doc('IRIS160L2SWE', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.2 Schürzen weiß m.WE Novellini'),
  );
  expect(iris.einbau).toBe('Ecke');
  for (const p of [...WANNE_SETS, iris]) {
    expect(describeWanne(p)).not.toMatch(BRANDS);
    expect(describeWanne(p).length).toBeGreaterThan(20);
  }
});

// ---- configurations: catalog matrix + which Aufsatz fits which tub ----
import { screenFit, screensFor, screenEnd } from '../../src/public/configurator/wanne-rules.js';

const SETS = WANNE_SETS.filter((x) => x.wizard !== false);
const tub = (id) => WANNE_SETS.find((x) => x.articleNumber === id);
const fitIds = (t) => screensFor(t, SETS.filter((x) => x.type === 'screen')).map((s) => s.articleNumber).sort();

test('catalog: every Steinkamp wall/door/drain/size combination exists once', () => {
  const st = SETS.filter((x) => x.brand === 'Steinkamp' && x.type === 'tub');
  expect(st).toHaveLength(48);
  const keys = new Set(st.map((x) => [x.lengthCm, x.einbau, x.wall, x.side, x.ablauf].join('|')));
  expect(keys.size).toBe(48);
  // wall side and door side are independent
  expect(tub('ST160-EL-TR')).toMatchObject({ einbau: 'Ecke', wall: 'links', side: 'rechts' });
  expect(tub('ST160-ER-TL')).toMatchObject({ einbau: 'Ecke', wall: 'rechts', side: 'links' });
});

test('catalog: old article numbers stay for saved offers but leave the wizard', () => {
  expect(tub('STEA160R-ET')).toMatchObject({ legacy: true, wizard: false });
  expect(WANNE_SETS.filter((x) => x.brand === 'Ottofond').every((x) => x.wizard === false)).toBe(true);
});

test('rules: Steinkamp Aufsatz on the door side, hinged on a wall there', () => {
  expect(fitIds(tub('ST160-EL-TL'))).toEqual(['STSA-2T-L', 'STSA-PT-L']); // wall + door left
  expect(fitIds(tub('ST160-EL-TR'))).toEqual([]); // door at the free end: no wall to hinge on
  expect(fitIds(tub('ST170-N-TR'))).toEqual(['STSA-2T-R', 'STSA-PT-R']); // niche: door side
  expect(fitIds(tub('ST180-V-TL'))).toEqual([]); // both ends free
  expect(screenFit(tub('ST160-EL-TR'), tub('STSA-2T-L')).reason).toMatch(/Türseite/);
});

test('rules: Iris (GC docs) — door at the wall end; klappbar hinges there, COMBY needs a free door end', () => {
  const ecke = parseWanneDoc(doc('IRIS160L2S', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.2 Schürzen weiß m.Abl. Novellini'));
  const nische = parseWanneDoc(doc('IRIS160LS', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.Frontschürze weiß m.Abl. Novellini'));
  const klapp = parseWanneDoc(doc('IRISWA14L', 'Wannenaufsatz für Iris links Höhe 140cm', '24/60cm klappb. ESG klar chrom Novellini'));
  const klappR = parseWanneDoc(doc('IRISWA14R', 'Wannenaufsatz für Iris rechts Höhe 140cm', '24/60cm klappb. ESG klar chrom Novellini'));
  const comby70 = parseWanneDoc(doc('IRISWA14S70L', 'NOV Iris COMBY Wannenaufsatz für Iris li', '24/60x140cm ESG klar chrom.m.S70'));
  const comby75 = parseWanneDoc(doc('IRISWA14S75L', 'NOV Iris COMBY Wannenaufsatz für Iris li', '24/60x140cm ESG klar chrom.m.S75'));
  expect(ecke).toMatchObject({ einbau: 'Ecke', wall: 'links', side: 'links', widthCm: 70, tubHeightCm: 62 });
  expect(screenFit(ecke, klapp).ok).toBe(true); // hinged on the wall at the door
  expect(screenFit(nische, klapp).ok).toBe(true);
  expect(screenFit(ecke, klappR).ok).toBe(false); // other side
  expect(screenFit(ecke, comby70).ok).toBe(false); // wall at the door end
  expect(screenFit(nische, comby70).ok).toBe(false);
  // a free door end (Iris with 3 Schürzen, not in our catalog) takes the COMBY of matching width
  const frei = { ...ecke, einbau: 'Vorwand', wall: null };
  expect(screenFit(frei, comby70).ok).toBe(true);
  expect(screenFit(frei, comby75).reason).toMatch(/75 cm passt nicht/);
  expect(screenEnd(ecke, klapp)).toBe('links'); // door end
  expect(screenFit(tub('ST160-EL-TL'), klapp).ok).toBe(false); // other family
});

test('Iris 3 Schürzen (vigor wording of scripts/addVigorIrisProducts.mjs): both ends free, COMBY of their width', () => {
  const t160 = parseWanneDoc(doc('IRIS160L3S', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.3 Schürzen weiß m.Abl. Novellini'));
  const t180 = parseWanneDoc(doc('IRIS180L3SWE', 'Badewanne Acryl Iris 180x75/85cm weiß li', 'm.3 Schürzen weiß m.WE Novellini'));
  const scr = [
    ['IRISWA14S70L', '24/60x140cm ESG klar chrom.m.S70'],
    ['IRISWA14S75L', '24/60x140cm ESG klar chrom.m.S75'],
    ['IRISWAS70L', '24/60x150cm ESG klar chrom.m.S70'],
    ['IRISWAS75L', '24/60x150cm ESG klar chrom.m.S75'],
  ].map(([id, f]) => parseWanneDoc(doc(id, 'NOV Iris COMBY Wannenaufsatz für Iris li', f)))
    .concat(parseWanneDoc(doc('IRISWA14L', 'Wannenaufsatz für Iris links Höhe 140cm', '24/60cm klappb. ESG klar chrom Novellini')));
  expect(t160).toMatchObject({ einbau: 'Vorwand', wall: null, schuerze: '3 Schürzen', widthCm: 70, widthMaxCm: 80, requires: [] });
  expect(t180).toMatchObject({ einbau: 'Vorwand', widthCm: 75, zulauf: 'Wanneneinlauf' });
  expect(screensFor(t160, scr).map((s) => s.articleNumber)).toEqual(['IRISWA14S70L', 'IRISWAS70L']);
  expect(screensFor(t180, scr).map((s) => s.articleNumber)).toEqual(['IRISWA14S75L', 'IRISWAS75L']);
  expect(describeWanne(t160)).toBe('Badewanne mit Einstiegstür links, Vorwandmontage, Verkleidung vorn und an beiden Enden, 160 × 70/80 × 62 cm');
  // niche Iris carries the IRISNS requirement (price comes from vigor)
  const nische = parseWanneDoc(doc('IRIS160LS', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.Frontschürze weiß m.Abl. Novellini'));
  expect(nische.requires).toEqual([{ articleNumber: 'IRISNS', desc: 'Nackenstütze für Nischeneinbau der Badewanne' }]);
});
