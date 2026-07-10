// seedVigorModelDoc.js
// One-time bootstrap for the DB-backed configurator model (Task C, Part 1).
// Uploads the current enriched src/public/configurator/vigor-model.json into the
// "vigor" MongoDB as a single document in the "models" collection:
//   { _id: "vigour", schemaVersion, builtAt, model: {...} }
// so the app can serve the model live from the DB (see src/routes/da-config.js)
// instead of the static file. Idempotent — re-run to refresh the doc.
//
// Later this doc will be written by the scraper at the end of each run; this
// script just seeds it now so the DB path can be verified without the scraper.
//
// Run: node scripts/seedVigorModelDoc.js

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MODEL_PATH = join(__dirname, "../src/public/configurator/vigor-model.json");

async function main() {
  const uri = process.env.VIGOR_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("VIGOR_MONGODB_URI (or MONGODB_URI) missing from .env");

  const model = JSON.parse(readFileSync(MODEL_PATH, "utf8"));

  const conn = await mongoose.createConnection(uri, { dbName: "vigor" }).asPromise();
  await conn.db.collection("models").updateOne(
    { _id: "vigour" },
    {
      $set: {
        schemaVersion: model?.meta?.schemaVersion ?? null,
        builtAt: new Date().toISOString(),
        model,
      },
    },
    { upsert: true },
  );
  await conn.close();

  const leaves = model?.leaves?.length ?? 0;
  const params = model?.params?.length ?? 0;
  console.log(
    `[seedVigorModelDoc] upserted vigor.models/_id=vigour ` +
      `(params ${params}, leaves ${leaves})`,
  );
}

main().catch((e) => {
  console.error("[seedVigorModelDoc] failed:", e.message);
  process.exit(1);
});
