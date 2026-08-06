/* eslint-disable no-undef */
// seedBadolux.js
// Upserts ALL badolux products into the Products collection (source: 'badolux') so the
// non-configurator sections can pull them. The Duschabtrennung (neu) configurator does NOT
// use these — it reads src/public/configurator/badolux-model.json (see buildBadoluxModel.js).
//
// Products are generated from the read-only source price lists:
//   src/templates/test/badolux-prices.json            (glass, panels, floor, accessories …)
//   src/templates/test/duschwanne-badolux-prices.json (shower trays)
// Stored `price` = effective NET (list price minus the category discount), rounded to cents.
//
// Run: node scripts/seedBadolux.js   (requires MONGODB_URI)

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prices = JSON.parse(
  readFileSync(join(__dirname, '../src/templates/test/badolux-prices.json'), 'utf8'),
);
const trays = JSON.parse(
  readFileSync(join(__dirname, '../src/templates/test/duschwanne-badolux-prices.json'), 'utf8'),
);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const parsePct = (s) => {
  const n = Number(String(s ?? '').replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n / 100 : 0;
};
const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
const net = (list, pct) => round2(Number(list) * (1 - pct));
// "70 x 140" -> { widthCm: 70, lengthCm: 140 }; "80" -> { widthCm: 80 }
const dims = (m) => {
  const s = String(m).match(/(\d+)\s*x\s*(\d+)/i);
  if (s) return { widthCm: Number(s[1]), lengthCm: Number(s[2]) };
  const one = String(m).match(/^\s*(\d+)/);
  return one ? { widthCm: Number(one[1]) } : {};
};

const products = [];
const push = (productId, name, price, extra = {}) =>
  products.push({ productId, name, price: round2(price), widthCm: null, heightCm: null, lengthCm: null, ...extra });

const cats = prices.categories;
const disc = {
  glass: parsePct(cats['Duschabtrennungen (Gläser)']?.discount ?? prices.discounts?.Glaeser),
  panel: parsePct(cats['Wandpaneele']?.discount ?? prices.discounts?.Wandpaneele),
  floor: parsePct(cats['Boden (Bodenbelag)']?.discount ?? prices.discounts?.Bodenbelag),
  tray: parsePct(trays.discount ?? prices.discounts?.Duschwannen),
};

// --- Duschabtrennungen (Gläser) — 20% ---
cats['Duschabtrennungen (Gläser)'].products.forEach((p, i) => {
  for (const row of p.prices || []) {
    const m = String(row.masse_cm);
    push(`BDX-GL-${i + 1}-${slug(m)}`, `Duschabtrennung ${p.name} ${m} cm`, net(row.preis, disc.glass), {
      ...dims(m),
    });
  }
});

// --- Wandpaneele — 10% (one row per colour, using its Artikelnummer) ---
for (const p of cats['Wandpaneele'].products) {
  if (Array.isArray(p.farben)) {
    for (const f of p.farben) {
      push(`BDX-WP-${slug(f.artikelnummer)}`, `Wandpaneel ${p.name} ${f.farbe} (${f.artikelnummer})`, net(p.preis, disc.panel));
    }
  } else {
    push(`BDX-WP-${slug(p.name)}`, `Wandpaneel ${p.name}`, net(p.preis, disc.panel));
  }
}

// --- Boden (Bodenbelag) — 20% ---
for (const p of cats['Boden (Bodenbelag)'].products) {
  for (const f of p.farben || []) {
    push(`BDX-BO-${slug(f.artikelnummer)}`, `Bodenplatte ${f.farbe} (${p.einheit || 'Paket'})`, net(p.preis, disc.floor));
  }
}

// --- Zubehör / Montage — no discount ---
for (const p of cats['Zubehör / Montage'].products) {
  for (const r of p.prices || []) {
    const variant = r.stueck || r.menge || '';
    push(`BDX-ZB-${slug(p.name)}-${slug(String(variant))}`, `${p.name}${variant ? ` (${variant})` : ''}`, r.preis);
  }
}

// --- Abdichtung — no discount ---
for (const p of cats['Abdichtung'].products) {
  push(`BDX-AB-${slug(p.name)}`, `${p.name}${p.einheit ? ` (${p.einheit})` : ''}`, p.preis);
}

// --- Winkelleisten — no discount ---
for (const p of cats['Winkelleisten'].products) {
  for (const r of p.prices || []) {
    const variant = r.farbe || r.profil || '';
    const unit = r.preis_pro_stk ?? r.preis;
    push(`BDX-WL-${slug(p.name)}-${slug(String(variant))}`, `${p.name}${variant ? ` ${variant}` : ''}`, unit);
  }
}

// --- Duschwannen — 25% ---
const trayHeight = (() => {
  const m = String(trays.spec).match(/Höhe\s*([\d.,]+)\s*cm/i);
  return m ? Number(m[1].replace(',', '.')) : 2.6;
})();
trays.prices.forEach((row) => {
  const m = String(row.masse_cm);
  push(`BDX-DW-${slug(m)}`, `Duschwanne ${m} cm (${trays.spec})`, net(row.preis, disc.tray), {
    ...dims(m),
    heightCm: trayHeight,
  });
});

// --- Manual extras not present in the price lists ---
push('AGB001', 'Abfluss für Duschwanne mit und ohne Rand', 33.42);
push('SLB001', 'Schwallleiste zu Duschwannen ohne Rand', 13.62);

(async () => {
  try {
    if (!MONGODB_URI) throw new Error('Missing MONGODB_URI in environment');

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB, '| products:', products.length);

    const ops = products.map((p) => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
          $set: {
            productId: p.productId,
            name: p.name,
            price: Number(p.price),
            widthCm: p.widthCm ?? null,
            heightCm: p.heightCm ?? null,
            lengthCm: p.lengthCm ?? null,
            source: 'badolux',
          },
        },
        upsert: true,
      },
    }));

    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log('Seed result:', {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
