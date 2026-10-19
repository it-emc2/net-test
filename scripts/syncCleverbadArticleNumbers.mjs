/* eslint-disable no-undef */
// syncCleverbadArticleNumbers.mjs
// Writes the cleverbad.de article number (Badolux's shop) onto our Badolux products
// as `articleNumber`, from src/logic/cleverbad-catalog.json (`ours`, built by
// scripts/buildCleverbadCatalog.mjs). Only sets that one field; never deletes or
// changes anything else. WP007 (Sonder-Dekor) is skipped — its article depends on
// the motif picked per offer.
//
// Run: node scripts/syncCleverbadArticleNumbers.mjs          (dry run)
//      node scripts/syncCleverbadArticleNumbers.mjs --write

import "dotenv/config";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";

const write = process.argv.includes("--write");
const catalog = JSON.parse(readFileSync(new URL("../src/logic/cleverbad-catalog.json", import.meta.url), "utf8"));
const map = Object.entries(catalog.ours).filter(([pid]) => pid !== "WP007");

await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const col = mongoose.connection.db.collection("Products");
let changed = 0;
for (const [productId, sku] of map) {
  const doc = await col.findOne({ productId }, { projection: { articleNumber: 1 } });
  if (!doc) { console.warn(`missing product ${productId}`); continue; }
  if (doc.articleNumber === sku) continue;
  console.log(`${productId}: ${doc.articleNumber ?? "—"} → ${sku}`);
  changed++;
  if (write) await col.updateOne({ productId }, { $set: { articleNumber: sku, updatedAt: new Date() } });
}
console.log(`${changed} product(s) ${write ? "updated" : "would change (dry run, pass --write)"}`);
await mongoose.disconnect();
