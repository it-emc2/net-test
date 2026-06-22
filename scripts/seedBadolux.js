/* eslint-disable no-undef */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'KonfiguratorDB';

const products = [

{ productId: 'AGB001', name: 'Abfluss fur Duschwanne mit und ohne Rand', price: 33.42, widthCm: null, heightCm: null, lengthCm: null },
{ productId: 'SLB001', name: 'Schwallleiste zu Duschwannen ohne Rand', price: 13.62, widthCm: null, heightCm: null, lengthCm: null },
{ productId: 'WP007', name: 'Wandpaneel Sonder-Dekor', price: 169, widthCm: null, heightCm: null, lengthCm: null },
];

(async () => {
  try {
    if (!MONGODB_URI) throw new Error('Missing MONGODB_URI in environment');

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

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
            source: 'badolux'
          }
        },
        upsert: true
      }
    }));

    const result = await Product.bulkWrite(ops, { ordered: false });
    console.log('Seed result:', {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount
    });
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();