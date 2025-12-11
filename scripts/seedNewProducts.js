// seedNewProducts.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB  = process.env.MONGODB_DB || 'KonfiguratorDB';

// Normalize productId: remove spaces but keep all digits (including leading zeros)
const normalizeId = (id) => id.replace(/\s+/g, '');

const rawProducts = [
  { productId: '24 081 000', name: 'Vital Hüftkissen schwarz', price: 109.00 },
  { productId: '24 081 100', name: 'Vital Hüftkissen blau', price: 109.00 },
  { productId: '24 081 500', name: 'Vital Steißbeinkissen schwarz', price: 109.00 },
  { productId: '24 081 600', name: 'Vital Steißbeinkissen blau', price: 109.00 },

  { productId: '24 081 005', name: 'Ersatz-Bezug zu Hüftkissen schwarz', price: 41.95 },
  { productId: '24 081 105', name: 'Ersatz-Bezug zu Hüftkissen blau', price: 41.95 },
  { productId: '24 081 505', name: 'Ersatz-Bezug zu Steißbeinkissen schwarz', price: 46.95 },
  { productId: '24 081 605', name: 'Ersatz-Bezug zu Steißbeinkissen blau', price: 46.95 },

  { productId: '25 670 000', name: 'RUSSKA Sitzring weiß', price: 29.90 },

  // IDs now exactly as you specified:
  { productId: '25 670 010', name: 'RUSSKA Sitzring Bezug weiß',       price: 14.95 },
  { productId: '25 670 020', name: 'RUSSKA Sitzring Bezug anthrazit',  price: 14.95 },
  { productId: '25 670 030', name: 'RUSSKA Sitzring Bezug grau',       price: 14.95 },

  { productId: '24 081 800', name: 'Vital Hüftkissen Mobil/Auto', price: 89.00 },

  { productId: '24 096 000', name: 'RUSSKA Sitzkissen Komfort', price: 54.90 },
  { productId: '24 097 000', name: 'RUSSKA Kissen zur Sitzerhöhung', price: 69.90 },
  { productId: '24 096 240', name: 'RUSSKA Sitzkissen Deluxe', price: 74.90 },
  { productId: '19 034 422', name: 'Lück Rhombo-therm soft Kissen', price: 85.90 },

  { productId: '35 035 200', name: 'HEPRO Haltestange GRIPO', price: 549.00 },
  { productId: '35 035 145', name: 'HEPRO Griffbügel Triangel', price: 119.00 },
  { productId: '35 035 148', name: 'HEPRO Stützbügel mit Hängegriff', price: 275.00 },
  { productId: '35 035 281', name: 'HEPRO Ringgriff 30cm', price: 309.00 },
  { productId: '35 035 280', name: 'HEPRO Ringgriff 40cm', price: 309.00 },

  { productId: '78 700 800', name: 'Duschhocker mit Armlehnen', price: 99.90 },
  { productId: '78 701 900', name: 'Duschstuhl mit Armlehnen und Rückenlehne', price: 139.90 },
  { productId: '78 700 400', name: 'Duschstuhl', price: 59.90 },
  { productId: '78 701 500', name: 'Duschstuhl mit Rückenlehne', price: 79.90 },
  { productId: '78 701 700', name: 'Duschstuhl mit Armlehnen und Rückenlehne', price: 134.90 },
  { productId: '78 700 750', name: 'Soft-Auflage zu laguna Duschstühlen', price: 25.90 },
  {
    productId: '78 700 850',
    name: 'Soft-Auflage zu laguna Duschhocker mit Hygieneausschnitt/Duschstuhl mit Hygieneausschnitt',
    price: 25.90
  },

  { productId: '78 090 000', name: 'RUSSKA Duschhocker mit Soft-Drehsitz und Ablage', price: 74.90 },

  {
    productId: '11 096 600',
    name: 'RUSSKA Funk-Sensormatte Step Control rechteckig 75 x 55 x 1 cm (ohne Empfänger Plus)',
    price: 705.00
  },
  {
    productId: '11 096 610',
    name: 'RUSSKA Funk-Sensormatte Step Control halbrund 110 x 70 x 1 cm (ohne Empfänger Plus)',
    price: 799.00
  },

  { productId: '11 020 600', name: 'Drehsitz Komfort', price: 34.90 },
  { productId: '11 020 700', name: 'RUSSKA Aufstehhilfe für Körpergewicht 35-105 kg', price: 179.00 },
  { productId: '11 020 710', name: 'RUSSKA Aufstehhilfe für Körpergewicht 60-180 kg', price: 179.00 },
  { productId: '11 020 300', name: 'RUSSKA Flexibler Drehsitz', price: 32.90 },

  { productId: '14 661 000', name: 'RUSSKA Greifhilfe Classic 45 cm', price: 26.90 },
  { productId: '14 662 000', name: 'RUSSKA Greifhilfe Classic 70 cm', price: 29.90 },

  { productId: '26 013 000', name: 'RUSSKA Strumpfhosen-Anziehhilfe Frottee', price: 25.90 },
  { productId: '26 014 000', name: 'homecraft Strumpf-Anziehhilfe kleine Nuten', price: 14.50 },
  { productId: '26 014 200', name: 'homecraft Strumpf-Anziehhilfe große Nuten', price: 14.50 },

  // Keep leading 0, just remove spaces by normalization
  { productId: '091 095 504', name: 'homecraft Strumpfhosen-Anziehhilfe', price: 23.90 },

  { productId: '10 440 000', name: 'RUSSKA Teleskop-Schuhanzieher mit Feder', price: 10.90 }
];

const products = rawProducts.map(p => ({
  productId: normalizeId(p.productId),
  name: p.name,
  price: Number(p.price),
  widthCm: null,
  heightCm: null,
  lengthCm: null
}));

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log('Connected for seeding:', MONGODB_DB);

    const ops = products.map(p => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
          $set: {
            name: p.name,
            price: p.price,
            widthCm: p.widthCm,
            heightCm: p.heightCm,
            lengthCm: p.lengthCm
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