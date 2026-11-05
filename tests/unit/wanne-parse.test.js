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
import { screenFit, screensFor } from '../../src/public/configurator/wanne-rules.js';

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

test('rules: Steinkamp Aufsatz only at an end wall and never above the door', () => {
  expect(fitIds(tub('ST160-EL-TR'))).toEqual(['STSA-2T-L', 'STSA-PT-L']); // wall left, door right
  expect(fitIds(tub('ST160-EL-TL'))).toEqual([]); // wall left = door side → above the door
  expect(fitIds(tub('ST170-N-TL'))).toEqual(['STSA-2T-R', 'STSA-PT-R']); // niche: opposite the door
  expect(fitIds(tub('ST180-V-TL'))).toEqual([]); // both ends free: no wall to hinge on
  expect(screenFit(tub('ST180-V-TL'), tub('STSA-2T-L')).reason).toMatch(/Seitenwand/);
});

test('rules: Iris Aufsatz must match the Iris tub side, never a Steinkamp tub', () => {
  const irisTub = parseWanneDoc(doc('IRIS160L2S', 'Badewanne Acryl Iris 160x70/80cm weiß li', 'm.2 Schürzen weiß m.Abl. Novellini'));
  const irisL = parseWanneDoc(doc('IRISWA14L', 'Wannenaufsatz für Iris links Höhe 140cm', '24/60cm klappb. ESG klar chrom Novellini'));
  const irisR = parseWanneDoc(doc('IRISWA14R', 'Wannenaufsatz für Iris rechts Höhe 140cm', '24/60cm klappb. ESG klar chrom Novellini'));
  expect(irisTub).toMatchObject({ einbau: 'Ecke', wall: 'links', screenFamily: 'iris' });
  expect(screenFit(irisTub, irisL).ok).toBe(true);
  expect(screenFit(irisTub, irisR).ok).toBe(false);
  expect(screenFit(tub('ST160-EL-TR'), irisL).ok).toBe(false);
});
