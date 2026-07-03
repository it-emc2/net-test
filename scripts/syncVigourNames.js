// syncVigourNames.js
// Enriches src/public/configurator/vigor-model.json with the real supplier product
// name + finish text from the "vigor" MongoDB (db "vigor", collection "products",
// keyed by articleNumber). Adds two NEW fields per article — displayName / finishText —
// without touching the existing `label` (auto-generated) or `finish` object (glasart/
// beschichtung/profilfarbe), which src/public/configurator/engine.js relies on to
// resolve the correct article variant.
//
// Run: node scripts/syncVigourNames.js
// Re-run whenever the "vigor" DB's product names/prices are refreshed by the scraper.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MODEL_PATH = join(__dirname, "../src/public/configurator/vigor-model.json");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing from .env");

  await mongoose.connect(uri, { dbName: "vigor" });
  const docs = await mongoose.connection.db
    .collection("products")
    .find({}, { projection: { articleNumber: 1, name: 1, finish: 1 } })
    .toArray();
  await mongoose.disconnect();

  const byArticle = new Map();
  for (const d of docs) {
    if (!d.articleNumber) continue;
    byArticle.set(d.articleNumber, { name: d.name || "", finish: d.finish || "" });
  }
  console.log(`[syncVigourNames] loaded ${byArticle.size} products from vigor.products`);

  const model = JSON.parse(readFileSync(MODEL_PATH, "utf8"));
  let matched = 0;
  let total = 0;

  for (const leaf of model.leaves || []) {
    for (const comp of leaf.components || []) {
      for (const article of comp.articles || []) {
        total++;
        const info = byArticle.get(article.articleNumber);
        if (!info) continue;
        matched++;
        if (info.name) article.displayName = info.name;
        if (info.finish) article.finishText = info.finish;
      }
    }
  }

  model.meta = { ...model.meta, namesSyncedAt: new Date().toISOString() };
  writeFileSync(MODEL_PATH, JSON.stringify(model));
  console.log(`[syncVigourNames] matched ${matched}/${total} articles; wrote ${MODEL_PATH}`);
}

main().catch((e) => {
  console.error("[syncVigourNames] failed:", e.message);
  process.exit(1);
});
