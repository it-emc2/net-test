/* eslint-disable no-undef */
// buildBadoluxModel.js
// Generates src/public/configurator/badolux-model.json in the same schemaVersion-2 shape
// the Duschabtrennung (neu) engine already consumes (see src/public/configurator/engine.js).
//
// Source (read-only): src/templates/test/badolux-prices.json → ONLY the
// "Duschabtrennungen (Gläser)" category. All other badolux categories are seeded into the
// product DB (scripts/seedBadolux.js) for use in other sections, NOT here.
//
// Mapping badolux → Vigour schema:
//   • one structure param "Produkt" whose values are the glass products
//   • one leaf per product (finish: [] — badolux glass has no Glasart/Beschichtung tree)
//   • one component per leaf; each `masse_cm` row is a size option (rendered as one "Maß" row)
//   • per-article we KEEP the list price + discount (not baked): {list, discount, net}
//
// Run: node scripts/buildBadoluxModel.js

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "../src/templates/test/badolux-prices.json");
const OUT = join(__dirname, "../src/public/configurator/badolux-model.json");
const CATEGORY = "Duschabtrennungen (Gläser)";

// "20%" -> 0.20
const parseDiscount = (s) => {
  const n = Number(String(s ?? "").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(n) ? n / 100 : 0;
};
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
// numeric masse → "80 cm"; descriptive masse ("140 (40er fest…)") kept verbatim
const sizeDisplay = (m) => (/^\d+$/.test(String(m).trim()) ? `${m} cm` : String(m));

const src = JSON.parse(readFileSync(SRC, "utf8"));
const cat = src.categories?.[CATEGORY];
if (!cat) throw new Error(`Category "${CATEGORY}" not found in ${SRC}`);

const discount = parseDiscount(cat.discount ?? src.discounts?.Glaeser ?? "0%");

const values = [];
const leaves = [];

cat.products.forEach((p, idx) => {
  const value = `${String(idx + 1).padStart(3, "0")}_${slug(p.name)}`;
  values.push({ value, label: p.name });

  const breite = [];
  const articles = [];
  for (const row of p.prices || []) {
    const disp = sizeDisplay(row.masse_cm);
    breite.push(disp);
    const list = Number(row.preis) || 0;
    articles.push({
      articleNumber: disp, // shown in the offer line: "<Produkt> (<Maß>)"
      width: disp, // engine matches article.width === chosen size
      height: "", // single sentinel height (fixed 195 cm per spec) → no Höhe axis
      sizeLabel: null,
      list, // net list price from the PDF (pre-discount)
      discount, // e.g. 0.20 — kept first-class, not baked away
      net: round2(list * (1 - discount)), // effective net used by pricing.js
      gros: list, // no separate gross sell price for badolux
      currency: "EUR",
      label: `${p.name} ${disp}`,
      spec: p.spec || "",
      note: p.note || "",
    });
  }

  leaves.push({
    selections: { Produkt: value },
    finish: [],
    components: [
      {
        key: "Glas",
        label: p.name,
        breite,
        hoehe: [""],
        sondermass: [],
        articles,
      },
    ],
  });
});

const model = {
  meta: {
    schemaVersion: 2,
    supplier: "BADOLUX",
    source: src.source || "badolux-all.pdf",
    builtFrom: "badolux-prices.json → " + CATEGORY,
    discount,
    productCount: values.length,
    leafCount: leaves.length,
  },
  supplier: "BADOLUX",
  sizeAxisLabel: "Maß (cm)", // overrides the engine UI's default "Breite (mm)" header
  params: [
    {
      id: "Produkt",
      label: "Produkt",
      order: 0,
      mandatory: true,
      values,
    },
  ],
  leaves,
  sondermass: {},
  images: {},
};

writeFileSync(OUT, JSON.stringify(model, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${OUT}\n  products: ${values.length}, discount: ${(discount * 100).toFixed(0)}%`,
);
