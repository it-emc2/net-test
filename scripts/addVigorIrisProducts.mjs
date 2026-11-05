// scripts/addVigorIrisProducts.mjs
// Adds the Novellini Iris articles the scraper does not load (yet) to the vigor
// "products" collection, so the Wanne wizard can offer them and pricing quotes
// their live vigor net price like every other Iris article:
//   - Iris with 3 Schürzen (both tub ends free), 160/170/180, with/without WE
//   - IRISNS  Nackenstütze für Nischeneinbau (required with an Iris in a niche)
//
// Prices are NOT in this file (purchase prices stay out of the repo): pass a JSON
// file with the GC net prices, e.g. ~/.config/emc2/vigor-iris-gc-2026-11-05.json:
//   [{ "articleNumber": "IRIS160L3S", "netPrice": 1234.56, "grosPrice": 2345.67 }, …]
//
// Usage (needs a vigor connection with WRITE access):
//   VIGOR_MONGODB_URI='mongodb+srv://…' node scripts/addVigorIrisProducts.mjs --prices <file> [--dry-run]
//
// Idempotent: upserts on the scraper's natural key {materialNumber, configHash}
// with materialNumber "manual-<articleNumber>", so re-running updates the prices
// and never duplicates. Names/finish follow the scraper's wording for the Iris
// articles already in vigor, so routes/bathtubs.js parseWanneDoc() reads them.
import fs from "node:fs";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pricesPath = args[args.indexOf("--prices") + 1];
if (!args.includes("--prices") || !pricesPath) {
  console.error("Usage: node scripts/addVigorIrisProducts.mjs --prices <file.json> [--dry-run]");
  process.exit(1);
}
const uri = process.env.VIGOR_MONGODB_URI;
if (!uri && !dryRun) {
  console.error("VIGOR_MONGODB_URI (with write access) is missing");
  process.exit(1);
}

const prices = new Map(
  JSON.parse(fs.readFileSync(pricesPath, "utf8")).map((p) => [String(p.articleNumber).trim(), p]),
);

// Article definitions — no prices here.
const articles = [];
for (const [l, w, wMax] of [[160, 70, 80], [170, 70, 80], [180, 75, 85]]) {
  for (const [s, abbr] of [["L", "li"], ["R", "re"]]) {
    for (const we of [false, true]) {
      articles.push({
        articleNumber: `IRIS${l}${s}3S${we ? "WE" : ""}`,
        category: "badewanne",
        name: `Badewanne Acryl Iris ${l}x${w}/${wMax}cm weiß ${abbr}`,
        finish: `m.3 Schürzen weiß m.${we ? "WE" : "Abl."} Novellini`,
      });
    }
  }
}
// Own category, so the Wanne catalog (category "badewanne") does not list it as
// a tub; routes/bathtubs.js fetches it by article number.
articles.push({
  articleNumber: "IRISNS",
  category: "badewanne-zubehoer",
  name: "Nackenstütze f. Badewanne Iris f. Nischeneinbau",
  finish: "Novellini",
});

const missing = articles.filter((a) => !(Number(prices.get(a.articleNumber)?.netPrice) > 0));
if (missing.length) {
  console.error("No netPrice in the price file for:", missing.map((a) => a.articleNumber).join(", "));
  process.exit(1);
}

const now = new Date();
const docs = articles.map((a) => {
  const p = prices.get(a.articleNumber);
  return {
    filter: { materialNumber: `manual-${a.articleNumber}`, configHash: "standalone" },
    set: {
      articleNumber: a.articleNumber,
      name: a.name,
      finish: a.finish,
      category: a.category,
      brand: "Novellini",
      configContext: { source: "manual-gc", brand: "Novellini", category: a.category },
      netPrice: Number(p.netPrice),
      grosPrice: Number(p.grosPrice) || null,
      currency: "EUR",
      unit: "Stück",
      priceUpdatedAt: now,
      lastSeenAt: now,
      sourceUrl: `https://gconlineplus.de/p/search/${a.articleNumber}`,
    },
  };
});

if (dryRun) {
  for (const d of docs) console.log(d.set.articleNumber.padEnd(14), d.set.category.padEnd(20), d.set.netPrice, "|", d.set.name, "|", d.set.finish);
  console.log(`\n${docs.length} articles — dry run, nothing written.`);
  process.exit(0);
}

const conn = await mongoose.createConnection(uri, { dbName: "vigor" }).asPromise();
const col = conn.db.collection("products");
let inserted = 0, updated = 0;
for (const d of docs) {
  const r = await col.updateOne(d.filter, { $set: d.set, $setOnInsert: { firstSeenAt: now } }, { upsert: true });
  if (r.upsertedCount) inserted++;
  else if (r.modifiedCount) updated++;
}
console.log(`✓ vigor.products: ${inserted} inserted, ${updated} updated, ${docs.length - inserted - updated} unchanged`);
await conn.close();
process.exit(0);
