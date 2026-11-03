// lib/wanneSets.js
// Complete "Badewanne mit Tür" sets bought from online retail (not in Vigor),
// merged into /api/bathtubs/catalog so they show up in the Wanne picker next to
// the Novellini Iris tubs. Shaped exactly like parseWanneDoc() output (type
// "tub"), so the picker, hidden inputs, payload and pricing need no special case:
// pricing misses Vigor for these ids and quotes the snapshot price.
//
// ponytail: prices are the RETAIL prices incl. VAT (Megabad 30.10.2026, OBI),
// used unchanged as netPrice — replace with the Profibad purchase price once
// access exists.

// Steinkamp easy entry via Megabad, regular (non-promo) prices incl. VAT.
// [size, [E, ET, V, VT, N, NT]]  E=Einbau V=Vorwandmontage N=Nische, T=Trio-Ablauf
// `id` = Megabad article number per side (the order link); `rechts` overrides a
// price where the right-hand door costs differently.
const STEINKAMP = [
  { l: 160, w: 75, p: { E: 2149, ET: 2379, V: 2179, VT: 2449 },
    id: { links: { E: 398376, ET: 398390, V: 424877, VT: 424934 },
          rechts: { E: 425006, ET: 398391, V: 425015, VT: 425024 } } },
  { l: 170, w: 75, p: { E: 2149, ET: 2379, V: 2249, VT: 2479 },
    id: { links: { E: 398379, ET: 398392, V: 425051, VT: 425060 },
          rechts: { E: 425063, ET: 398393, V: 425069, VT: 425078 } } },
  { l: 180, w: 80, p: { E: 2349, ET: 2599, V: 2479, VT: 2749, N: 2299, NT: 2449 },
    rechts: { NT: 2549 },
    id: { links: { E: 398387, ET: 398403, V: 425090, VT: 425099, N: 425084, NT: 425096 },
          rechts: { E: 398386, ET: 398405, V: 425108, VT: 425117, N: 425105, NT: 425114 } } },
];
const megabadUrl = (art, code) =>
  art === 425060
    ? `https://www.megabad.com/steinkamp-badewannen-mit-tuer-und-acrylverkleidung-a-${art}.htm`
    : `https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-${code[0] === "V" ? "vorwandmontage" : "einbau"}-a-${art}.htm`;
const MOUNT = { E: "Einbau", V: "Vorwandmontage", N: "Nische" };

// Ottofond Free-Gate via OBI, incl. VAT: plain vs. with extra Ablaufgarnitur.
// [price, OBI article per side]
const OTTOFOND = {
  Standard: [2188.6, { links: 4163259, rechts: 4163267 }, "weiss"],
  "inkl. Ablaufgarnitur": [2318.87, { links: 4408225, rechts: 4408233 }, "inkl-ablaufgarnitur"],
};
const obiUrl = (art, side, kind) =>
  `https://www.obi.de/p/${art}/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-${kind === "weiss" ? "weiss-" : ""}${side}${kind === "weiss" ? "" : "-" + kind}`;

const sides = [
  ["links", "L"],
  ["rechts", "R"],
];

const base = (o) => ({
  type: "tub",
  unit: "Stück",
  schuerze: null,
  zulauf: null,
  widthMaxCm: o.widthCm,
  ...o,
  netPrice: o.grosPrice,
});

// ordering info per article id, filled while the sets are built
const shop = new Map();

const steinkamp = STEINKAMP.flatMap(({ l, w, p, id, rechts }) =>
  sides.flatMap(([side, s]) =>
    Object.entries(p).map(([code, listGross]) => {
      const gross = (side === "rechts" && rechts?.[code]) || listGross;
      const art = id[side][code];
      shop.set(`STEA${l}${s}-${code}`, {
        shop: "Megabad / Profibad", shopArt: art, url: megabadUrl(art, code),
      });
      const mount = MOUNT[code[0]];
      const trio = code.endsWith("T");
      return base({
        articleNumber: `STEA${l}${s}-${code}`,
        name: `Steinkamp easy entry Badewanne ${l}x${w} cm mit Glastür ${side}`,
        finish: `Acrylverkleidung, 8 mm ESG-Glastür, ${mount}${trio ? ", Trio-Ablauf" : ""}`,
        brand: "Steinkamp",
        side,
        lengthCm: l,
        widthCm: w,
        einbau: mount,
        ablauf: trio ? "Trio" : "Standard",
        grosPrice: gross,
        image: `./assets/wanne/steinkamp-${side}.jpg`,
      });
    }),
  ),
);

const ottofond = sides.flatMap(([side, s]) =>
  Object.entries(OTTOFOND).map(([ablauf, [gross, ids, kind]]) => {
    shop.set(`OTFG180${s}${ablauf === "Standard" ? "" : "-A"}`, {
      shop: "OBI", shopArt: ids[side], url: obiUrl(ids[side], side, kind),
    });
    return base({
      articleNumber: `OTFG180${s}${ablauf === "Standard" ? "" : "-A"}`,
      name: `Ottofond Badewannen-Set Free-Gate 180x80 cm Tür ${side}`,
      finish: `Sanitäracryl weiß, herausnehmbare Tür, ${ablauf === "Standard" ? "verchromte Ablaufgarnitur" : "inkl. Ablaufgarnitur"}`,
      brand: "Ottofond",
      side,
      lengthCm: 180,
      widthCm: 80,
      einbau: null,
      ablauf,
      grosPrice: gross,
      image: `./assets/wanne/ottofond-${side}.webp`,
    });
  }),
);

export const WANNE_SETS = [...steinkamp, ...ottofond];

// Where the office orders each set: never Hassmann, so the Hassmann Warenkorb CSV
// skips these ids; the Materialübersicht remark and the internal order note
// (/material-overview/online-orders) tell the office where to buy them.
export const WANNE_SET_ORDER = new Map(
  WANNE_SETS.map((x) => {
    const o = shop.get(x.articleNumber);
    return [
      x.articleNumber,
      { ...o, note: `Nicht über Hassmann – hier bestellen (${o.shop}, Art.-Nr. ${o.shopArt}): ${o.url}` },
    ];
  }),
);

if (process.argv[1]?.endsWith("wanneSets.js")) {
  // runnable self-check: node src/lib/wanneSets.js
  const ids = new Set(WANNE_SETS.map((x) => x.articleNumber));
  console.assert(ids.size === WANNE_SETS.length, "duplicate article numbers");
  console.assert(WANNE_SETS.every((x) => x.netPrice > 0 && x.image), "price/image missing");
  console.assert([...WANNE_SET_ORDER.values()].every((o) => o.url && o.shopArt), "order link missing");
  console.log(WANNE_SETS.length, "sets OK");
}
