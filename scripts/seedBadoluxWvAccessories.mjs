/* eslint-disable no-undef */
// seedBadoluxWvAccessories.mjs
// Adds the Badolux accessories for the Keramico wall panels (cleverbad.de "Passendes
// Zubehör") to KonfiguratorDB.Products. productId = the shop's article number, so the
// Badolux cart and the Hassmann CSV split them by source. Only inserts missing
// products — never changes or deletes an existing one (prices are edited in the DB).
//
// Price = our net dealer price (cleverbad.de dealer view, −25 %, excl. VAT, 2026-10-23).
//
// Run: node scripts/seedBadoluxWvAccessories.mjs          (dry run)
//      node scripts/seedBadoluxWvAccessories.mjs --write

import "dotenv/config";
import mongoose from "mongoose";

const write = process.argv.includes("--write");
const ROWS = [
  ["PR101VBM3", "Polymer Kleber Weiß, Kartusche 290 ml", 9.72],
  ["PR47VBM02", "Dichtband Blau (je lfm)", 5.76],
  ["PR59VBM03", "Profi-Abdichtung DIN 18534 selbstklebend, Innenecke", 4.41],
  ["PR59VBM05", "Profi-Abdichtung DIN 18534 selbstklebend, Außenecke", 4.41],
  ["PR59VBM07", "Wandmanschette für Rohrdurchführungen, selbstklebend", 4.18],
  ["PRI130VBM01", "Fliesenabschlussleiste Edelstahl, 2550 mm", 9.64],
  ["PRI130VBM02", "Abschluss-Würfel Edelstahl poliert", 2.44],
];

await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const col = mongoose.connection.db.collection("Products");
const now = new Date();
for (const [productId, name, price] of ROWS) {
  if (await col.findOne({ productId }, { projection: { _id: 1 } })) {
    console.log(`${productId}: exists, unchanged`);
    continue;
  }
  console.log(`${productId}: ${write ? "insert" : "would insert"} "${name}" ${price} €`);
  if (write)
    await col.insertOne({
      productId, name, price, source: "badolux", manufacturer: "Badolux", articleNumber: productId,
      widthCm: null, lengthCm: null, heightCm: null, __v: 0, createdAt: now, updatedAt: now,
    });
}
await mongoose.disconnect();
