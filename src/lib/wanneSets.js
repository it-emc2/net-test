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
const STEINKAMP = [
  { l: 160, w: 75, p: { E: 2149, ET: 2379, V: 2179, VT: 2449 } },
  { l: 170, w: 75, p: { E: 2149, ET: 2379, V: 2249, VT: 2479 } },
  { l: 180, w: 80, p: { E: 2349, ET: 2599, V: 2479, VT: 2749, N: 2299, NT: 2449 } },
];
const MOUNT = { E: "Einbau", V: "Vorwandmontage", N: "Nische" };

// Ottofond Free-Gate via OBI, incl. VAT: plain vs. with extra Ablaufgarnitur.
const OTTOFOND = { Standard: 2188.6, "inkl. Ablaufgarnitur": 2318.87 };

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

const steinkamp = STEINKAMP.flatMap(({ l, w, p }) =>
  sides.flatMap(([side, s]) =>
    Object.entries(p).map(([code, gross]) => {
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
  Object.entries(OTTOFOND).map(([ablauf, gross]) =>
    base({
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
    }),
  ),
);

export const WANNE_SETS = [...steinkamp, ...ottofond];

if (process.argv[1]?.endsWith("wanneSets.js")) {
  // runnable self-check: node src/lib/wanneSets.js
  const ids = new Set(WANNE_SETS.map((x) => x.articleNumber));
  console.assert(ids.size === WANNE_SETS.length, "duplicate article numbers");
  console.assert(WANNE_SETS.every((x) => x.netPrice > 0 && x.image), "price/image missing");
  console.log(WANNE_SETS.length, "sets OK");
}
