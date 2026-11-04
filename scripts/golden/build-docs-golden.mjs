#!/usr/bin/env node
// Builds the DOCX golden master.
// 1) Catalog snapshot from the LOCAL replica (Products + the vigor docs the pricing fixtures use).
// 2) Renders every selected (anonymised) pricing case through the real docx router via the
//    in-memory harness and stores a normalised text/structure snapshot.
// Run after build-pricing-golden.mjs:  node scripts/golden/build-docs-golden.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import {
  DOCS_DIR, PRICING_DIR, ENDPOINTS, startHarness, stopHarness, renderDocx, normaliseDocx, selectDocCases,
} from "../../tests/golden/docs-harness.mjs";

const LOCAL = "mongodb://127.0.0.1:27018";
mkdirSync(DOCS_DIR, { recursive: true });

// ---- 1) catalog snapshot (no customer data in these collections)
const strip = (d) => { const { _id, ...rest } = d; return rest; };
const client = new MongoClient(LOCAL, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const products = (await client.db("KonfiguratorDB").collection("Products").find().toArray()).map(strip);
const vigorIds = Object.keys(JSON.parse(readFileSync(join(PRICING_DIR, "vigor.json"), "utf8")));
const vigorProducts = (await client.db("vigor").collection("products")
  .find({ $or: [{ productId: { $in: vigorIds } }, { articleNumber: { $in: vigorIds } }, { sku: { $in: vigorIds } }] })
  .toArray()).map(strip);
await client.close();
writeFileSync(join(DOCS_DIR, "products.json"), JSON.stringify(products));
writeFileSync(join(DOCS_DIR, "vigor-products.json"), JSON.stringify(vigorProducts));

// ---- 2) render + snapshot
const pricingCases = JSON.parse(readFileSync(join(PRICING_DIR, "cases.json"), "utf8"));
const cases = selectDocCases(pricingCases);
const today = new Date();
await startHarness();
const snapshots = [];
const failures = [];
for (const c of cases) {
  for (const ep of ENDPOINTS) {
    const { status, body } = await renderDocx(ep.path, structuredClone(c.payload));
    if (status !== 200) { failures.push(`${c.id} ${ep.key} → HTTP ${status}`); continue; }
    snapshots.push({ id: `${c.id}__${ep.key}`, caseId: c.id, endpoint: ep.key, docx: normaliseDocx(body, { today }) });
  }
}
await stopHarness();
writeFileSync(join(DOCS_DIR, "snapshots.json"), JSON.stringify(snapshots, null, 1));
writeFileSync(join(DOCS_DIR, "meta.json"), JSON.stringify({
  builtAt: today.toISOString(), cases: cases.length, snapshots: snapshots.length,
  products: products.length, vigorProducts: vigorProducts.length, failures,
}, null, 1));
console.log(JSON.stringify({ cases: cases.length, snapshots: snapshots.length, vigorProducts: vigorProducts.length, failures }, null, 1));
process.exit(0);
