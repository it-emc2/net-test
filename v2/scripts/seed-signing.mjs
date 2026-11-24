// Fills the local database "oc_signing" (the signing-page recordings, capture-signing.cjs) from the
// golden fixtures — catalog, config and one user (capture@local.test). Wipes "oc_signing" first and
// touches no other database (the "vigor" database is only read by the server, if present).
//   node v2/scripts/seed-signing.mjs
import fs from "node:fs";
import mongoose from "mongoose";
const R = new URL("../..", import.meta.url).pathname, j = (p) => JSON.parse(fs.readFileSync(`${R}/${p}`, "utf8"));
await mongoose.connect("mongodb://127.0.0.1:27018/?directConnection=true", { dbName: "oc_signing" });
const db = mongoose.connection.db;
if (db.databaseName !== "oc_signing") throw new Error("wrong database");
await db.dropDatabase();
await db.collection("Products").insertMany(j("tests/golden/fixtures/docs/products.json"));
await db.collection("appconfigs").insertMany(Object.entries(j("tests/golden/fixtures/pricing/config.json")).map(([key, value]) => ({ key, value })));
await db.collection("users").insertOne({ email: "capture@local.test", name: "Capture", role: "admin", active: true });
console.log("seeded oc_signing", await db.collection("Products").countDocuments());
await mongoose.disconnect();
