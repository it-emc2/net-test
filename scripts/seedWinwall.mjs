/* eslint-disable no-undef */
// seedWinwall.mjs
// Adds the winwall Wandverkleidung line to KonfiguratorDB.Products: the decors
// shown as tiles in every format of the dealer price list, the accessories,
// cutting and freight. productId = winwall article number (WS/NW + decor +
// format), so the winwall cart can order exactly what the offer lists.
// Inserts missing products; an existing winwall product only gets its price
// set to the list below when it differs (e.g. WS80301 113,50 €). Nothing is deleted.
// Panels and sealing sets are priced from pricing-core in the offer anyway, so
// a typed "Anderes Dekor" needs no product here.
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
      productId: `${d.code}${f.code}`,
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
  const have = await col.findOne({ productId: r.productId }, { projection: { _id: 1, price: 1, source: 1 } });
  if (have) {
    if (have.source === "winwall" && Number(have.price) !== r.price) {
      console.log(`${r.productId}: price ${have.price} → ${r.price} €${write ? "" : " (dry run)"}`);
      if (write) await col.updateOne({ _id: have._id }, { $set: { price: r.price, updatedAt: new Date() } });
    } else console.log(`${r.productId}: exists, unchanged`);
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
