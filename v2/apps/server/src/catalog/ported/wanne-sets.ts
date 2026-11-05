// @ts-nocheck
// GENERATED verbatim copy of src/lib/wanneSets.js — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
// lib/wanneSets.js
// Bathtubs with an entry door (plus matching glass screens) bought from online
// retail, not in Vigor. Merged into /api/bathtubs/catalog next to the Novellini
// Iris articles, shaped like parseWanneDoc() output, so picker, hidden inputs,
// payload and pricing need no special case: pricing misses Vigor for these ids
// and quotes the snapshot price.
//
// ponytail: prices are the RETAIL prices incl. VAT on Megabad (crawled
// 2026-11-05) / OBI, used unchanged as netPrice — replace with the Profibad
// purchase price once access exists.
//
// Field meaning (also used by public/configurator/wanne-rules.js):
//   side   door side of a tub, hinge side ("Anschlag") of a screen — view from the front
//   einbau "Ecke" | "Nische" | "Vorwand" (Vorwandmontage: back wall only, both ends panelled)
//   wall   end wall of a tub: "links" | "rechts" | "beide" (niche) | null (Vorwand)
//   screenFamily  which screens fit which tubs ("steinkamp", "iris")
//   wizard false = kept for saved offers / order notes, not offered in the wizard

// Steinkamp easy entry — every variant Megabad sells (crawled from the variant
// selector of article 398376). [length, width, mount, door, trio, price, Megabad
// article, Steinkamp article]. mount: EL/ER = Einbau Ecke links/rechts (the wall
// is at that end, the other end has a side panel), N = Nische, V = Vorwandmontage.
// Wall side and door side are independent: every combination exists.
const STEINKAMP_ROWS = [
  [160, 75, "EL", "L", 0, 2149.00, 398376, "ST001BWTL-L1"],
  [160, 75, "EL", "L", 1, 2379.00, 398390, "ST001BWTL-L1+Trio"],
  [160, 75, "EL", "R", 0, 2149.00, 398374, "ST001BWTR-R1"],
  [160, 75, "EL", "R", 1, 2379.00, 398391, "ST001BWTR-R1+Trio"],
  [160, 75, "ER", "L", 0, 2149.00, 424871, "ST001BWTL-L2"],
  [160, 75, "ER", "L", 1, 2379.00, 424919, "ST001BWTL-L2+Trio"],
  [160, 75, "ER", "R", 0, 2149.00, 425006, "ST001BWTR-R2"],
  [160, 75, "ER", "R", 1, 2379.00, 425018, "ST001BWTR-R2+Trio"],
  [160, 75, "N", "L", 0, 2079.00, 424874, "ST001BWTL-L3"],
  [160, 75, "N", "L", 1, 2349.00, 424931, "ST001BWTL-L3+Trio"],
  [160, 75, "N", "R", 0, 2079.00, 425012, "ST001BWTR-R3"],
  [160, 75, "N", "R", 1, 2349.00, 425021, "ST001BWTR-R3+Trio"],
  [160, 75, "V", "L", 0, 2179.00, 424877, "ST001BWTL-L4"],
  [160, 75, "V", "L", 1, 2449.00, 424934, "ST001BWTL-L4+Trio"],
  [160, 75, "V", "R", 0, 2179.00, 425015, "ST001BWTR-R4"],
  [160, 75, "V", "R", 1, 2449.00, 425024, "ST001BWTR-R4+Trio"],
  [170, 75, "EL", "L", 0, 2149.00, 398379, "ST002BWTL-L1"],
  [170, 75, "EL", "L", 1, 2379.00, 398392, "ST002BWTL-L1+Trio"],
  [170, 75, "EL", "R", 0, 2149.00, 398377, "ST002BWTR-R1"],
  [170, 75, "EL", "R", 1, 2379.00, 398393, "ST002BWTR-R1+Trio"],
  [170, 75, "ER", "L", 0, 2149.00, 425045, "ST002BWTL-L2"],
  [170, 75, "ER", "L", 1, 2379.00, 425054, "ST002BWTL-L2+Trio"],
  [170, 75, "ER", "R", 0, 2149.00, 425063, "ST002BWTR-R2"],
  [170, 75, "ER", "R", 1, 2379.00, 425072, "ST002BWTR-R2+Trio"],
  [170, 75, "N", "L", 0, 2079.00, 425048, "ST002BWTL-L3"],
  [170, 75, "N", "L", 1, 2349.00, 425057, "ST002BWTL-L3+Trio"],
  [170, 75, "N", "R", 0, 2079.00, 425066, "ST002BWTR-R3"],
  [170, 75, "N", "R", 1, 2349.00, 425075, "ST002BWTR-R3+Trio"],
  [170, 75, "V", "L", 0, 2249.00, 425051, "ST002BWTL-L4"],
  [170, 75, "V", "L", 1, 2479.00, 425060, "ST002BWTL-L4+Trio"],
  [170, 75, "V", "R", 0, 2249.00, 425069, "ST002BWTR-R4"],
  [170, 75, "V", "R", 1, 2479.00, 425078, "ST002BWTR-R4+Trio"],
  [180, 80, "EL", "L", 0, 2349.00, 398387, "ST003BWTL-L1"],
  [180, 80, "EL", "L", 1, 2599.00, 398403, "ST003BWTL-L1+Trio"],
  [180, 80, "EL", "R", 0, 2349.00, 398386, "ST003BWTR-R1"],
  [180, 80, "EL", "R", 1, 2599.00, 398405, "ST003BWTR-R1+Trio"],
  [180, 80, "ER", "L", 0, 2349.00, 425081, "ST003BWTL-L2"],
  [180, 80, "ER", "L", 1, 2599.00, 425093, "ST003BWTL-L2+Trio"],
  [180, 80, "ER", "R", 0, 2349.00, 425102, "ST003BWTR-R2"],
  [180, 80, "ER", "R", 1, 2599.00, 425111, "ST003BWTR-R2+Trio"],
  [180, 80, "N", "L", 0, 2299.00, 425084, "ST003BWTL-L3"],
  [180, 80, "N", "L", 1, 2449.00, 425096, "ST003BWTL-L3+Trio"],
  [180, 80, "N", "R", 0, 2299.00, 425105, "ST003BWTR-R3"],
  [180, 80, "N", "R", 1, 2549.00, 425114, "ST003BWTR-R3+Trio"],
  [180, 80, "V", "L", 0, 2479.00, 425090, "ST003BWTL-L4"],
  [180, 80, "V", "L", 1, 2749.00, 425099, "ST003BWTL-L4+Trio"],
  [180, 80, "V", "R", 0, 2479.00, 425108, "ST003BWTR-R4"],
  [180, 80, "V", "R", 1, 2749.00, 425117, "ST003BWTR-R4+Trio"],
];
const TUB_HEIGHT_CM = 58.5; // Megabad "Höhe", same for all sizes (checked 160/170/180)
const MOUNT = {
  EL: { einbau: "Ecke", wall: "links", text: "Einbau Ecke links" },
  ER: { einbau: "Ecke", wall: "rechts", text: "Einbau Ecke rechts" },
  N: { einbau: "Nische", wall: "beide", text: "Nischeneinbau" },
  V: { einbau: "Vorwand", wall: null, text: "Vorwandmontage" },
};
const SIDE = { L: "links", R: "rechts" };

const megabadUrl = (art, slug) =>
  art === 425060
    ? `https://www.megabad.com/steinkamp-badewannen-mit-tuer-und-acrylverkleidung-a-${art}.htm`
    : `https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-${slug}-a-${art}.htm`;

// ordering info per article id, filled while the lists are built
const shop = new Map();

const steinkamp = STEINKAMP_ROWS.map(([l, w, mount, door, trio, gross, art, mpn]) => {
  const m = MOUNT[mount];
  const side = SIDE[door];
  const articleNumber = `ST${l}-${mount}-T${door}${trio ? "-TRIO" : ""}`;
  shop.set(articleNumber, {
    shop: "Megabad / Profibad",
    shopArt: art,
    mpn,
    url: megabadUrl(art, mount === "V" ? "vorwandmontage" : "einbau"),
  });
  return {
    type: "tub",
    unit: "Stück",
    articleNumber,
    name: `Steinkamp easy entry Badewanne ${l}x${w} cm mit Glastür ${side}, ${m.text}`,
    finish: `Acrylverkleidung, 8 mm ESG-Glastür, ${m.text}${trio ? ", Trio-Ablauf" : ""}`,
    brand: "Steinkamp",
    side,
    einbau: m.einbau,
    wall: m.wall,
    lengthCm: l,
    widthCm: w,
    widthMaxCm: w,
    tubHeightCm: TUB_HEIGHT_CM,
    hasDoor: true,
    screenFamily: "steinkamp",
    ablauf: trio ? "Trio" : "Standard",
    schuerze: null,
    zulauf: null,
    grosPrice: gross,
    netPrice: gross,
    image: `./assets/wanne/steinkamp-${side}.jpg`,
  };
});

// Steinkamp easy entry Badewannenaufsätze (Megabad 2026-11-05, 469,99 € each).
// Hinged on an END wall and running along the front rim (Montageanleitung
// "Drehfalttür zweiteilig"). The Pendeltür can be hinged left or right — one OC
// article per side so the offer says which.
const STEINKAMP_SCREENS = [
  { id: "STSA-2T-L", side: "links", kind: "falt", w: 100, art: 2067467, mpn: "ST0007BWS-L", label: "2-teilig faltbar" },
  { id: "STSA-2T-R", side: "rechts", kind: "falt", w: 100, art: 2067482, mpn: "ST0007BWS-R", label: "2-teilig faltbar" },
  { id: "STSA-PT-L", side: "links", kind: "pendel", w: 88, art: 398433, mpn: "ST0007BWA", label: "Pendeltür 1-teilig" },
  { id: "STSA-PT-R", side: "rechts", kind: "pendel", w: 88, art: 398433, mpn: "ST0007BWA", label: "Pendeltür 1-teilig" },
].map((x) => {
  shop.set(x.id, {
    shop: "Megabad / Profibad",
    shopArt: x.art,
    mpn: x.mpn,
    url: `https://www.megabad.com/steinkamp-duschabtrennungen-easy-entry-badewannenaufsaetze-badewannenaufsatz-a-${x.art}.htm`,
  });
  return {
    type: "screen",
    unit: "Stück",
    articleNumber: x.id,
    name: `Steinkamp easy entry Badewannenaufsatz ${x.label}, Anschlag ${x.side}`,
    finish: `${x.w} x 140 cm, 6 mm ESG klar`,
    brand: "Steinkamp",
    side: x.side,
    widthCm: x.w,
    heightCm: 140,
    screenKind: x.kind,
    seitenwand: "ohne",
    klappbar: x.kind === "falt",
    screenFamily: "steinkamp",
    grosPrice: 469.99,
    netPrice: 469.99,
    image: null,
  };
});

// Ottofond Free-Gate via OBI, incl. VAT. Hidden in the wizard (wizard:false):
// which corner and which door side "links"/"rechts" mean is not documented
// consistently by the shops — kept for saved offers and order notes.
const OTTOFOND = {
  Standard: [2188.6, { links: 4163259, rechts: 4163267 }, "weiss"],
  "inkl. Ablaufgarnitur": [2318.87, { links: 4408225, rechts: 4408233 }, "inkl-ablaufgarnitur"],
};
const obiUrl = (art, side, kind) =>
  `https://www.obi.de/p/${art}/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-${kind === "weiss" ? "weiss-" : ""}${side}${kind === "weiss" ? "" : "-" + kind}`;
const ottofond = ["links", "rechts"].flatMap((side) =>
  Object.entries(OTTOFOND).map(([ablauf, [gross, ids, kind]]) => {
    const articleNumber = `OTFG180${side === "links" ? "L" : "R"}${ablauf === "Standard" ? "" : "-A"}`;
    shop.set(articleNumber, { shop: "OBI", shopArt: ids[side], url: obiUrl(ids[side], side, kind) });
    return {
      type: "tub",
      unit: "Stück",
      articleNumber,
      name: `Ottofond Badewannen-Set Free-Gate 180x80 cm Tür ${side}`,
      finish: `Sanitäracryl weiß, herausnehmbare Tür, ${ablauf === "Standard" ? "verchromte Ablaufgarnitur" : "inkl. Ablaufgarnitur"}`,
      brand: "Ottofond",
      side,
      einbau: null,
      wall: null,
      lengthCm: 180,
      widthCm: 80,
      widthMaxCm: 80,
      hasDoor: true,
      ablauf,
      schuerze: null,
      zulauf: null,
      wizard: false,
      grosPrice: gross,
      netPrice: gross,
      image: `./assets/wanne/ottofond-${side}.webp`,
    };
  }),
);

// Article numbers of the first catalog (2026-10-30): "STEA<l><L|R>-<E|ET|V|VT|N|NT>".
// They never said on which end the wall is, and several "rechts" Ecke links
// pointed to an "Ecke links" article on Megabad. Kept only so saved offers still
// price, restore and get an order note — with a warning to check the wall side.
const LEGACY = [
  [160, 75, { E: 2149, ET: 2379, V: 2179, VT: 2449 },
    { links: { E: 398376, ET: 398390, V: 424877, VT: 424934 }, rechts: { E: 425006, ET: 398391, V: 425015, VT: 425024 } }],
  [170, 75, { E: 2149, ET: 2379, V: 2249, VT: 2479 },
    { links: { E: 398379, ET: 398392, V: 425051, VT: 425060 }, rechts: { E: 425063, ET: 398393, V: 425069, VT: 425078 } }],
  [180, 80, { E: 2349, ET: 2599, V: 2479, VT: 2749, N: 2299, NT: 2449 },
    { links: { E: 398387, ET: 398403, V: 425090, VT: 425099, N: 425084, NT: 425096 }, rechts: { E: 398386, ET: 398405, V: 425108, VT: 425117, N: 425105, NT: 425114 } },
    { NT: 2549 }],
];
const LEGACY_MOUNT = { E: "Ecke", V: "Vorwand", N: "Nische" };
const legacy = LEGACY.flatMap(([l, w, prices, ids, rechtsPrice]) =>
  ["links", "rechts"].flatMap((side) =>
    Object.entries(prices).map(([code, listGross]) => {
      const gross = (side === "rechts" && rechtsPrice?.[code]) || listGross;
      const art = ids[side][code];
      const articleNumber = `STEA${l}${side === "links" ? "L" : "R"}-${code}`;
      shop.set(articleNumber, {
        shop: "Megabad / Profibad",
        shopArt: art,
        url: megabadUrl(art, code[0] === "V" ? "vorwandmontage" : "einbau"),
        legacy: true,
      });
      const einbau = LEGACY_MOUNT[code[0]];
      return {
        type: "tub",
        unit: "Stück",
        articleNumber,
        name: `Steinkamp easy entry Badewanne ${l}x${w} cm mit Glastür ${side}`,
        finish: `Acrylverkleidung, 8 mm ESG-Glastür, ${einbau}${code.endsWith("T") ? ", Trio-Ablauf" : ""}`,
        brand: "Steinkamp",
        side,
        einbau,
        wall: einbau === "Nische" ? "beide" : null,
        lengthCm: l,
        widthCm: w,
        widthMaxCm: w,
        tubHeightCm: TUB_HEIGHT_CM,
        hasDoor: true,
        ablauf: code.endsWith("T") ? "Trio" : "Standard",
        schuerze: null,
        zulauf: null,
        legacy: true,
        wizard: false,
        grosPrice: gross,
        netPrice: gross,
        image: `./assets/wanne/steinkamp-${side}.jpg`,
      };
    }),
  ),
);

// Required accessories that the wizard adds automatically with a tub (field
// `requires` on the tub). Name and price come from vigor like every other Iris
// article (scripts/addVigorIrisProducts.mjs adds IRISNS there) — purchase
// prices stay out of the repo. Ordered with the tub via Hassmann/GC, so NOT in
// WANNE_SET_ORDER (which keeps articles out of the Hassmann cart).
// IRISNS: Novellini "Nackenstütze für Nischeneinbau" — the standard head-rest
// console overhangs the tub end, so an Iris in a niche needs this one
// (GC Bildpreisliste Sanitär 2026 S. 959).
export const WANNE_ACCESSORIES = {
  IRISNS: { articleNumber: "IRISNS", desc: "Nackenstütze für Nischeneinbau der Badewanne" },
};

export const WANNE_SETS = [...steinkamp, ...STEINKAMP_SCREENS, ...ottofond, ...legacy];

// Where the office orders each article: never Hassmann, so the Hassmann
// Warenkorb CSV skips these ids; the Materialübersicht remark and the internal
// order note (/material-overview/online-orders) tell the office where to buy.
export const WANNE_SET_ORDER = new Map(
  WANNE_SETS.map((x) => {
    const o = shop.get(x.articleNumber);
    const ref = o.mpn ? `Art.-Nr. ${o.shopArt}, Hersteller-Nr. ${o.mpn}` : `Art.-Nr. ${o.shopArt}`;
    const warn = o.legacy
      ? " ACHTUNG: Artikel aus dem alten Katalog – Wandseite (Ecke links/rechts) vor der Bestellung mit der Baustelle abgleichen."
      : "";
    return [x.articleNumber, { ...o, note: `Nicht über Hassmann – hier bestellen (${o.shop}, ${ref}): ${o.url}${warn}` }];
  }),
);

if (process.argv[1]?.endsWith("wanneSets.js")) {
  // runnable self-check: node src/lib/wanneSets.js
  const ids = new Set(WANNE_SETS.map((x) => x.articleNumber));
  console.assert(ids.size === WANNE_SETS.length, "duplicate article numbers");
  console.assert(WANNE_SETS.every((x) => x.netPrice > 0), "price missing");
  console.assert([...WANNE_SET_ORDER.values()].every((o) => o.url && o.shopArt), "order link missing");
  console.assert(steinkamp.length === 48, "Steinkamp variants missing");
  console.log(WANNE_SETS.length, "articles OK");
}
