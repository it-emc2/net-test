/* eslint-disable no-undef */
// seedBadewannen.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

// Remove spaces + “invisible” chars (NBSP, soft-hyphen, zero-width, BOM)
const normalizeId = (id) =>
  String(id)
    .trim()
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\s\u00A0\u00AD\u200B\u200C\u200D\uFEFF]+/g, '');

// "2.369,95 €" -> 2369.95
const parseEuroPrice = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/\s/g, '')
    .replace(/€$/i, '')
    .replace(/\./g, '') // thousands separator
    .replace(/,/g, '.'); // decimal comma -> dot
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const rawProducts = [
  // -----------------------------
  // Badewannen (with prices)
  // -----------------------------
  {
    productId: 'IRIS160RS',
    name: 'Badewanne IRIS160RS (160x80x62 cm, Acryl, weiß, mit Schürze, rechts)',
    price: '2.369,95 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160R2S',
    name: 'Badewanne IRIS160R2S (160x80x62 cm, Acryl, weiß, mit Schürze, rechts)',
    price: '2.454,65 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160LS',
    name: 'Badewanne IRIS160LS (160x80x62 cm, Acryl, weiß, mit Schürze, links)',
    price: '2.369,95 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160L2S',
    name: 'Badewanne IRIS160L2S (160x80x62 cm, Acryl, weiß, mit Schürze, links)',
    price: '2.454,65 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160RSWE',
    name: 'Badewanne IRIS160RSWE (160x80x62 cm, Acryl, weiß, mit Schürze, rechts)',
    price: '2.418,90 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    // your source contains an invisible char at the end; normalizeId() will fix it
    productId: 'IRIS160R2SWE­',
    name: 'Badewanne IRIS160R2SWE (160x80x62 cm, Acryl, weiß, mit Schürze, rechts)',
    price: '2.503,60 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160LSWE',
    name: 'Badewanne IRIS160LSWE (160x80x62 cm, Acryl, weiß, mit Schürze, links)',
    price: '2.418,90 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },
  {
    productId: 'IRIS160L2SWE­',
    name: 'Badewanne IRIS160L2SWE (160x80x62 cm, Acryl, weiß, mit Schürze, links)',
    price: '2.503,60 €',
    widthCm: 80,
    heightCm: 62,
    lengthCm: 160
  },

  // -----------------------------
  // Wannenaufsatz (with prices)
  // widths/heights given in mm -> stored as cm
  // -----------------------------
  {
    productId: 'IRISWAS70R',
    name: 'Wannenaufsatz IRISWAS70R (2-teilig, rechts, satiniert, Crystal Clear, chrom, ESG 6mm, 60x1500 mm)',
    price: '661,10 €',
    widthCm: 6.0, // 60 mm
    heightCm: 150.0 // 1500 mm
  },
  {
    productId: 'IRISWAS70L',
    name: 'Wannenaufsatz IRISWAS70L (2-teilig, links, satiniert, Crystal Clear, chrom, ESG 6mm, 60x1500 mm)',
    price: '661,10 €',
    widthCm: 6.0,
    heightCm: 150.0
  },
  {
    productId: 'IRISWAS75R',
    name: 'Wannenaufsatz IRISWAS75R (2-teilig, rechts, satiniert, Crystal Clear, chrom, ESG 6mm, 60x1500 mm)',
    price: '680,35 €',
    widthCm: 6.0,
    heightCm: 150.0
  },
  {
    productId: 'IRISWAS75L',
    name: 'Wannenaufsatz IRISWAS75L (2-teilig, links, satiniert, Crystal Clear, chrom, ESG 6mm, 60x1500 mm)',
    price: '680,35 €',
    widthCm: 6.0,
    heightCm: 150.0
  },
  {
    productId: 'IRISWA14S70R­',
    name: 'Wannenaufsatz IRISWA14S70R (Pendeltür, 2-teilig, rechts, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '661,10 €',
    widthCm: 60.0, // 600 mm
    heightCm: 140.0 // 1400 mm
  },
  {
    productId: 'IRISWA14S70L­',
    name: 'Wannenaufsatz IRISWA14S70L (Pendeltür, 2-teilig, links, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '661,10 €',
    widthCm: 60.0,
    heightCm: 140.0
  },
  {
    productId: 'IRISWA14S75R­',
    name: 'Wannenaufsatz IRISWA14S75R (Pendeltür, 2-teilig, rechts, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '680,35 €',
    widthCm: 60.0,
    heightCm: 140.0
  },
  {
    productId: 'IRISWA14S75L­',
    name: 'Wannenaufsatz IRISWA14S75L (Pendeltür, 2-teilig, links, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '680,35 €',
    widthCm: 60.0,
    heightCm: 140.0
  },
  {
    productId: 'IRISWA14R',
    name: 'Wannenaufsatz IRISWA14R (Pendeltür, 2-teilig, rechts, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '417,45 €',
    widthCm: 60.0,
    heightCm: 140.0
  },
  {
    productId: 'IRISWA14L',
    name: 'Wannenaufsatz IRISWA14L (Pendeltür, 2-teilig, links, satiniert, Crystal Clear, chrom, ESG 6mm, 600x1400 mm)',
    price: '417,45 €',
    widthCm: 60.0,
    heightCm: 140.0
  }
];

const products = rawProducts.map((p) => ({
  productId: normalizeId(p.productId),
  name: p.name,
  price: parseEuroPrice(p.price),
  widthCm: p.widthCm ?? null,
  heightCm: p.heightCm ?? null,
  lengthCm: p.lengthCm ?? null
}));

(async () => {
  try {
    if (!MONGODB_URI) throw new Error('Missing env MONGODB_URI');

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map((p) => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
          $set: {
            name: p.name,
            price: p.price,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            lengthCm: p.lengthCm,
            source: 'hassmann'
          }
        },
        upsert: true
      }
    }));

    const result = await Product.bulkWrite(ops);
    console.log('Seed result:', result);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();