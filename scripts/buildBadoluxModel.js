/* eslint-disable no-undef */
// buildBadoluxModel.js
// Generates src/public/configurator/badolux-model.json for "Duschabtrennung (neu)" in the
// same schemaVersion-2 shape the engine already consumes (src/public/configurator/engine.js).
//
// Flow follows cleverbad.de/konfigurator (Badolux's own shop), see
// docs/research-cleverbad-badolux.md §10:
//   Einbausituation → Tür → Anschlag → (Duschabtrennung, auto) → size per component
// and resolves to the same product SETS the shop does, e.g. a corner = two Lissabon
// folding doors, a Pendeltür = Festglas Wien + Pendeltür Wien 40.
//
// Sources (read-only):
//   • prices: src/templates/test/badolux-prices.json → "Duschabtrennungen (Gläser)"
//     (our dealer list; net = list × (1 − discount))
//   • shop data: scripts/data/badolux-da-cleverbad.json → article numbers, descriptions,
//     photo gallery (photos are loaded from the shop; the main photo per product is
//     stored locally under src/public/assets/badolux/da/ for the PDF and offline use)
//
// Glass/profile colour are not selectable (the shop's articles don't vary by them);
// the offer line states the default finish instead (DEFAULT_FINISH).
//
// The previous one-step model is kept as badolux-model-v1.json: boot.js reopens any
// saved Badolux state that still uses its "Produkt" step with it.
//
// Run: node scripts/buildBadoluxModel.js

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRICES = join(__dirname, "../src/templates/test/badolux-prices.json");
const SHOP = join(__dirname, "data/badolux-da-cleverbad.json");
const OUT = join(__dirname, "../src/public/configurator/badolux-model.json");
const CATEGORY = "Duschabtrennungen (Gläser)";
const IMG = "/assets/badolux/da";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const parseDiscount = (s) => {
  const n = Number(String(s ?? "").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n / 100 : 0;
};

const prices = JSON.parse(readFileSync(PRICES, "utf8"));
const shop = JSON.parse(readFileSync(SHOP, "utf8"));
const cat = prices.categories?.[CATEGORY];
if (!cat) throw new Error(`Category "${CATEGORY}" not found in ${PRICES}`);
const discount = parseDiscount(cat.discount ?? "0%");

// List price from our sheet by product name + width ("171", "140 (…)" → first number).
function listPrice(product, cm) {
  const p = cat.products.find((x) => x.name === product);
  if (!p) throw new Error(`price list has no product "${product}"`);
  const row = p.prices.find((r) => parseInt(r.masse_cm, 10) === cm);
  if (!row) throw new Error(`"${product}" has no price for ${cm} cm`);
  return Number(row.preis);
}
// Glass thickness from our sheet's spec ("Glasstärke 0,8 cm" / "x 0,6 cm").
function glassMm(product) {
  const spec = cat.products.find((x) => x.name === product)?.spec || "";
  const m = spec.match(/0,(\d) cm/);
  return m ? Number(m[1]) : null;
}

// Default finish — Badolux glass comes in one version (all shop photos: clear glass,
// chrome profiles). Profile colour is the shop's default, not stated in our sheet.
const finishText = (product, anschlag) =>
  [anschlag, `ESG Klarglas ${glassMm(product) ?? "?"} mm, EasyClean`, "Höhe 195 cm", "Profil Chrom"]
    .filter(Boolean)
    .join(" · ");

// Per shop product, once: description, features and the photo gallery (loaded from
// cleverbad.de; the local main photo sits on each article as `image`).
const products = {};
const useProduct = (slug) => {
  const p = shop.products[slug];
  if (p && !products[slug])
    products[slug] = { name: p.name, description: p.description, features: p.features, gallery: p.gallery.map((g) => shop.imgBase + g) };
  return slug;
};

/** One article. `size` is the size-button text and the engine's match key. */
function article({ product, cm, size, sku, name, slug, image, anschlag }) {
  const list = listPrice(product, cm);
  return {
    articleNumber: sku,
    width: size,
    height: "", // single height (195 cm) → no Höhe axis in the UI
    sizeLabel: null,
    list,
    discount,
    net: round2(list * (1 - discount)),
    gros: list,
    currency: "EUR",
    label: `${name} ${cm} cm`,
    displayName: `${name} ${cm} cm`,
    finishText: finishText(product, anschlag),
    image: `${IMG}/${image}`,
    product: useProduct(slug), // → model.products[slug]: description + photo gallery
  };
}
const component = (key, label, articles) => ({
  key,
  label,
  breite: articles.map((a) => a.width),
  hoehe: [""],
  sondermass: [],
  articles,
});

// --- products (article numbers = cleverbad.de variants matching our sheet's glass) ----
const LISSABON = [[80, "PRI80DK18"], [90, "PRI80DK19"], [100, "PRI80DK20"], [120, "PRI80DK21"]];
const WIEN_FEST = [[60, "PRI80DK13"], [70, "PRI80DK14"], [80, "PRI80DK15"], [90, "PRI63DK16"], [100, "PRI80DK16"], [120, "PRI80DK17"]];

// Corner cabin only: the shop's "Zweiteilig" variant (article number + "-Z", same
// price) — one of the two doors that meet at the open corner, vs. "Einteilig" for a niche.
const lissabonEck = (anschlag, suffix, image) =>
  LISSABON.map(([cm, sku]) =>
    article({ product: "Falttür - Lissabon", cm, size: `${cm} cm`, sku: `${sku}-Z`, name: `Falttür Lissabon${suffix}`, slug: "falttuer-lissabon", image, anschlag }),
  );
const nischeFalt = (anschlag) => [
  ...LISSABON.map(([cm, sku]) =>
    article({ product: "Falttür - Lissabon", cm, size: `${cm} cm · Lissabon`, sku, name: "Falttür Lissabon", slug: "falttuer-lissabon", image: "lissabon.webp", anschlag }),
  ),
  article({ product: "Faltür mit Festteil - Rom", cm: 140, size: "140 cm · Rom mit Festteil", sku: "PRI80DK22", name: "Falttür mit Festteil Rom", slug: "falttuer-rom", image: "rom.webp", anschlag }),
  article({ product: "Faltür mit Festteil - Stockholm", cm: 171, size: "171 cm · Stockholm mit Festteil", sku: "PRI80DK09", name: "Falttür mit Festteil Stockholm", slug: "falttuer-stockholm", image: "stockholm.webp", anschlag }),
];
const UNTEN = "Schiebetür - Madrid (Wand-offen, unten geführt)";
const OBEN = "Schiebetür - Madrid (Wand-Wand, oben geführt)";
const madrid = (anschlag) => [
  article({ product: UNTEN, cm: 140, size: "140 cm", sku: "PRI71DK14", name: "Schiebetür Madrid", slug: "schiebetuer-madrid", image: "madrid.webp", anschlag }),
  article({ product: UNTEN, cm: 160, size: "160 cm · untengeführt", sku: "PRI71DK15", name: "Schiebetür Madrid untengeführt", slug: "schiebetuer-madrid", image: "madrid.webp", anschlag }),
  article({ product: OBEN, cm: 160, size: "160 cm · obengeführt", sku: "PRI71DK17", name: "Schiebetür Madrid obengeführt", slug: "schiebetuer-madrid", image: "madrid.webp", anschlag }),
  article({ product: UNTEN, cm: 180, size: "180 cm", sku: "PRI71DK16", name: "Schiebetür Madrid", slug: "schiebetuer-madrid", image: "madrid.webp", anschlag }),
];
const wienFest = (anschlag, image, frontHint) =>
  WIEN_FEST.map(([cm, sku]) =>
    article({
      product: "Walk in - Wien",
      cm,
      size: frontHint ? `${cm} cm (Front ${cm + 40} cm)` : `${cm} cm`,
      sku,
      name: "Festglas Wien",
      slug: "duschglas-wien",
      image,
      anschlag,
    }),
  );
const pendel = (anschlag) => [
  article({ product: "Pendel - Wien", cm: 40, size: "40 cm", sku: "PRI80DK12", name: "Pendeltür Wien", slug: "duschglas-wien", image: "wien-pendel.webp", anschlag }),
];

// --- structure ------------------------------------------------------------------------
const EINBAU = [
  { value: "nische", label: "Nische — zwischen zwei Wänden, Glas nur vorn" },
  { value: "ecke", label: "Ecke — zwei Wände, Glas über Eck" },
  { value: "walkin", label: "Walk-In — feste Glaswand, offener Einstieg" },
];
const TUER = [
  { value: "falt", label: "Falttür — faltet nach innen und außen, braucht wenig Platz" },
  { value: "schiebe", label: "Schiebetür — gleitet zur Seite, 140 bis 180 cm" },
  { value: "pendel", label: "Pendeltür — Festglas mit schmaler Tür" },
  { value: "falt_eck", label: "Falttür übers Eck — zwei Falttüren, Einstieg über Eck" },
];
const ANSCHLAG = [
  { value: "falt_links", label: "Anschlag links — Scharnier links, Griff rechts", text: "Anschlag links" },
  { value: "falt_rechts", label: "Anschlag rechts — Scharnier rechts, Griff links", text: "Anschlag rechts" },
  { value: "schiebe_links", label: "Einstieg links — festes Glas rechts", text: "Einstieg links" },
  { value: "schiebe_rechts", label: "Einstieg rechts — festes Glas links", text: "Einstieg rechts" },
  { value: "pendel_links", label: "Festglas links — Tür rechts", text: "Festglas links" },
  { value: "pendel_rechts", label: "Festglas rechts — Tür links", text: "Festglas rechts" },
  { value: "walkin_links", label: "Wandanschluss links — Glas an der linken Wand", text: "Wandanschluss links" },
  { value: "walkin_rechts", label: "Wandanschluss rechts — Glas an der rechten Wand", text: "Wandanschluss rechts" },
];
const anschlagText = (v) => ANSCHLAG.find((a) => a.value === v)?.text;

const leaves = [];
const leafValues = [];
const images = {};
function leaf(sel, { id, label, image, components }) {
  images[id] = `${IMG}/${image}`;
  leafValues.push({ value: id, label, imageId: id });
  leaves.push({ selections: { ...sel, Duschabtrennung: id }, finish: [], components });
}

for (const side of ["links", "rechts"]) {
  const a = `falt_${side}`;
  leaf({ Einbausituation: "nische", Tuer: "falt", Anschlag: a }, {
    id: `nische_falt_${side}`, label: "Falttür in der Nische (Lissabon / Rom / Stockholm)", image: "lissabon.webp",
    components: [component("Tuer", "Falttür", nischeFalt(anschlagText(a)))],
  });
}
for (const side of ["links", "rechts"]) {
  const a = `schiebe_${side}`;
  leaf({ Einbausituation: "nische", Tuer: "schiebe", Anschlag: a }, {
    id: `nische_schiebe_${side}`, label: "Schiebetür Madrid", image: "madrid.webp",
    components: [component("Tuer", "Schiebetür Madrid", madrid(anschlagText(a)))],
  });
}
for (const side of ["links", "rechts"]) {
  const a = `pendel_${side}`;
  leaf({ Einbausituation: "nische", Tuer: "pendel", Anschlag: a }, {
    id: `nische_pendel_${side}`, label: "Festglas + Pendeltür Wien", image: "wien-pendel.webp",
    components: [
      component("Festglas", "Festglas Wien (Front = Festglas + 40 cm Pendeltür)", wienFest(anschlagText(a), "wien-pendel.webp", true)),
      component("Pendeltuer", "Pendeltür Wien", pendel(anschlagText(a))),
    ],
  });
}
leaf({ Einbausituation: "ecke", Tuer: "falt_eck" }, {
  id: "ecke_falt", label: "Eckkabine aus zwei Falttüren Lissabon", image: "lissabon-ecke.webp",
  components: [
    component("TuerVorn", "Falttür vorn", lissabonEck("Eckeinstieg", " (vorn)", "lissabon-ecke.webp")),
    component("TuerSeite", "Falttür an der Seite", lissabonEck("Eckeinstieg", " (Seite)", "lissabon-ecke.webp")),
  ],
});
for (const side of ["links", "rechts"]) {
  const a = `walkin_${side}`;
  leaf({ Einbausituation: "walkin", Anschlag: a }, {
    id: `walkin_${side}`, label: "Walk-In Festglas Wien", image: "wien-walkin.webp",
    components: [component("Festglas", "Festglas Walk-In Wien", wienFest(anschlagText(a), "wien-walkin.webp", false))],
  });
}

const model = {
  meta: {
    schemaVersion: 2,
    badoluxModel: 2,
    supplier: "BADOLUX",
    builtFrom: `badolux-prices.json → ${CATEGORY}; scripts/data/badolux-da-cleverbad.json`,
    discount,
    leafCount: leaves.length,
  },
  supplier: "BADOLUX",
  sizeAxisLabel: "Maß",
  params: [
    { id: "Einbausituation", label: "Wo soll die Dusche stehen?", order: 0, mandatory: true, values: EINBAU },
    { id: "Tuer", label: "Welche Tür passt?", order: 1, mandatory: true, values: TUER },
    { id: "Anschlag", label: "Auf welcher Seite?", order: 2, mandatory: true, values: ANSCHLAG.map(({ value, label }) => ({ value, label })) },
    { id: "Duschabtrennung", label: "Duschabtrennung", order: 3, mandatory: true, values: leafValues },
  ],
  leaves,
  sondermass: {},
  images,
  products,
};

writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT}\n  leaves: ${leaves.length}, discount: ${(discount * 100).toFixed(0)}%`);
