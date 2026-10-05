// scripts/lock-existing-offers.js — one-time migration: mark every existing
// Offer document as locked (immutable price) so the recompute guard added in
// offers.js also covers offers saved before that guard existed.
//
// Only touches documents missing `locked` — idempotent, safe to re-run.
// Defaults to a DRY RUN (prints what would change, writes nothing).
//
// Usage:
//   node scripts/lock-existing-offers.js            # dry run
//   node scripts/lock-existing-offers.js --apply    # actually writes
import "dotenv/config";
import mongoose from "mongoose";
import Offer from "../src/models/Offer.js";

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB || "KonfiguratorDB",
});

const query = { locked: { $exists: false } };
const count = await Offer.countDocuments(query);
const sample = await Offer.find(query).select("offerNumber").limit(10).lean();

console.log(`DB: ${mongoose.connection.name}`);
console.log(`Offers missing 'locked': ${count}`);
console.log(`Sample offerNumbers: ${sample.map((o) => o.offerNumber).join(", ") || "(none)"}`);

if (!apply) {
  console.log("\nDry run only — no writes made. Re-run with --apply to update these documents.");
} else {
  const result = await Offer.updateMany(query, { $set: { locked: true } });
  console.log(`\nApplied: matched ${result.matchedCount}, modified ${result.modifiedCount}.`);
}

await mongoose.disconnect();
process.exit(0);
