// Fills the local preview database "oc_preview" (and "vigor") from the golden fixtures — catalog,
// config and one admin user (capture@local.test). Wipes both first. Local replica only.
//   node v2/scripts/seed-preview.mjs
import fs from "node:fs";
import mongoose from "mongoose";
const R = new URL("../..", import.meta.url).pathname, j = (p) => JSON.parse(fs.readFileSync(`${R}/${p}`, "utf8"));
await mongoose.connect("mongodb://127.0.0.1:27018/?directConnection=true", { dbName: "oc_preview" });
const db = mongoose.connection.db;
await db.dropDatabase();
await db.collection("Products").insertMany(j("tests/golden/fixtures/docs/products.json"));
await db.collection("appconfigs").insertMany(Object.entries(j("tests/golden/fixtures/pricing/config.json")).map(([key, value]) => ({ key, value })));
await db.collection("users").insertOne({ email: "capture@local.test", name: "Capture", role: "admin", active: true });
const v = j("tests/golden/fixtures/docs/vigor-products.json"); const vdb = mongoose.connection.getClient().db("vigor"); await vdb.dropDatabase(); if (v.length) await vdb.collection("products").insertMany(v);
console.log("seeded", await db.collection("Products").countDocuments());
await mongoose.disconnect();
