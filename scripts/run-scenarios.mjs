/* eslint-disable no-undef */
// scripts/run-scenarios.mjs
import fs from 'fs/promises';
import path from 'path';
import url from 'url';
import mongoose from 'mongoose';                // ⬅ add
import pricingFactory from '../src/logic/pricing.js';
import ProductModel from '../src/models/Product.js';

mongoose.set('strictQuery', true);              // optional
// mongoose.set('bufferCommands', false);       // optional: fail fast if not connected

const pricing = pricingFactory(ProductModel);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const euro = (n) =>
  (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const deepMerge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) return b.slice();
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
};

async function runOne(file) {
  const base = JSON.parse(await fs.readFile(path.join(__dirname, '../scenarios/base.json'), 'utf8'));
  const override = JSON.parse(await fs.readFile(file, 'utf8'));
  const payload = deepMerge(base, override);

  const r = await pricing.computePrices(payload);

  console.log(`\n=== ${path.basename(file)} ===`);
  console.log('Nettobetrag_nach_Rabatt_und_Bonus:', euro(r.netAfterRabatt_and_Bonus));
  console.log('MwSt:', euro(r.vatOnNet));
  console.log('Brutto:', euro(r.total));
  console.log('Rabatt_Betrag:', euro(r.rabattAmount));
  console.log('Bonus_Betrag:', euro(r.bonusGross));
  console.log('Gesamt_nach_Rabatt:', euro(r.totalAfterRabatt));
  console.log('Gesamt_nach_Bonus:', euro(r.totalAfterBonus));
  console.log('Zuschuss:', euro(r.subsidyAmount));
  console.log('Selbstkostenanteil:', euro(r.selfPayAmount));
}

async function runAll() {
  // ⬇️ CONNECT before running
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/konfigurator';
  const dbName = process.env.MONGODB_DBNAME || 'konfigurator';
  await mongoose.connect(uri, { dbName });

  try {
    const dir = path.join(__dirname, '../scenarios');
    const files = (await fs.readdir(dir))
      .filter(f => f !== 'base.json' && f.endsWith('.json'))
      .map(f => path.join(dir, f));

    for (const f of files) {
      await runOne(f);
    }
  } finally {
    // ⬇️ DISCONNECT after running
    await mongoose.disconnect();
  }
}

runAll().catch(async (e) => {
  console.error(e);
  // eslint-disable-next-line no-empty
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
