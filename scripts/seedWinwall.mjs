/* eslint-disable no-undef */
// seedWinwall.mjs
// Adds the winwall Wandverkleidung line to KonfiguratorDB.Products: the 10 chosen
// decors in every format of the dealer price list, the accessories, cutting and
// freight. productId = winwall article number (WS + decor + format), so the
// winwall cart can order exactly what the offer lists. Only inserts missing
// products — never changes or deletes an existing one (prices are edited in the DB).
//
// Prices = net dealer prices, winwall Händlerpreisliste 2026 (Stand 03/2026).
//
// Run: node scripts/seedWinwall.mjs          (dry run)
//      node scripts/seedWinwall.mjs --write

import "dotenv/config";
import mongoose from "mongoose";
import { WINWALL_DECORS, WINWALL_FORMATS, WINWALL_EXTRAS } from "../src/logic/pricing-core.js";

const write = process.argv.includes("--write");

const rows = [];
for (const d of WINWALL_DECORS) {
  for (const f of WINWALL_FORMATS) {
    const size = `${f.widthCm} × ${f.heightCm} cm`;
    rows.push({
      productId: `WS${d.code}${f.code}`,
      name: `winwall Duschrückwand ${d.name} ${f.set ? `Set 2 × ${size}` : size}`,
      price: f.price,
      widthCm: f.widthCm,
      heightCm: f.heightCm,
    });
  }
}
for (const x of WINWALL_EXTRAS) rows.push({ productId: x.id, name: x.name, price: x.price, widthCm: null, heightCm: null });

await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const col = mongoose.connection.db.collection("Products");
const now = new Date();
let added = 0;
for (const r of rows) {
  if (await col.findOne({ productId: r.productId }, { projection: { _id: 1 } })) {
    console.log(`${r.productId}: exists, unchanged`);
    continue;
  }
  console.log(`${r.productId}: ${write ? "insert" : "would insert"} "${r.name}" ${r.price} €`);
  added++;
  if (write)
    await col.insertOne({
      ...r, lengthCm: null, source: "winwall", manufacturer: "winwall", articleNumber: r.productId,
      __v: 0, createdAt: now, updatedAt: now,
    });
}
console.log(`\n${rows.length} winwall articles, ${added} ${write ? "inserted" : "to insert"}.`);
await mongoose.disconnect();
