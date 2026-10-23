/* eslint-disable no-undef */
// seedBadoluxWvAccessories.mjs
// Adds the Badolux accessories for the Keramico wall panels (cleverbad.de "Passendes
// Zubehör") to KonfiguratorDB.Products. productId = the shop's article number, so the
// Badolux cart and the Hassmann CSV split them by source. Only inserts missing
// products — never changes or deletes an existing one (prices are edited in the DB).
//
// Interim price = cleverbad.de private price (gross) ÷ 1,19 until the dealer price
// is known.
//
// Run: node scripts/seedBadoluxWvAccessories.mjs          (dry run)
//      node scripts/seedBadoluxWvAccessories.mjs --write

import "dotenv/config";
import mongoose from "mongoose";

const write = process.argv.includes("--write");
const ROWS = [
  ["PR101VBM3", "Polymer Kleber Weiß, Kartusche 290 ml", 15.42],
  ["PR47VBM02", "Dichtband Blau (je lfm)", 9.15],
  ["PR59VBM03", "Profi-Abdichtung DIN 18534 selbstklebend, Innenecke", 7.0],
  ["PR59VBM05", "Profi-Abdichtung DIN 18534 selbstklebend, Außenecke", 7.0],
  ["PR59VBM07", "Wandmanschette für Rohrdurchführungen, selbstklebend", 6.62],
  ["PRI130VBM01", "Fliesenabschlussleiste Edelstahl, 2550 mm", 15.29],
  ["PRI130VBM02", "Abschluss-Würfel Edelstahl poliert", 3.86],
];

await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const col = mongoose.connection.db.collection("Products");
const now = new Date();
for (const [productId, name, gross] of ROWS) {
  if (await col.findOne({ productId }, { projection: { _id: 1 } })) {
    console.log(`${productId}: exists, unchanged`);
    continue;
  }
  const price = Math.round((gross / 1.19) * 100) / 100;
  console.log(`${productId}: ${write ? "insert" : "would insert"} "${name}" ${price} €`);
  if (write)
    await col.insertOne({
      productId, name, price, source: "badolux", manufacturer: "Badolux", articleNumber: productId,
      widthCm: null, lengthCm: null, heightCm: null, __v: 0, createdAt: now, updatedAt: now,
    });
}
await mongoose.disconnect();
