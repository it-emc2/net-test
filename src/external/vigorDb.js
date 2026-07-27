// src/external/vigorDb.js
// Shared lazy connection to the SEPARATE "vigor" MongoDB (collections "products"
// and "models"), which the scraper refreshes daily. The main app connection points
// at KonfiguratorDB, so this opens its own connection: prefer VIGOR_MONGODB_URI,
// fall back to MONGODB_URI with dbName "vigor" (works when both DBs live on the
// same cluster/credentials).
//
// Extracted from routes/vorhang.js + routes/da-config.js, which had the same
// connect-once helper copied verbatim.
import mongoose from "mongoose";

let connPromise = null;

export function getVigorDb() {
  if (!connPromise) {
    const uri = process.env.VIGOR_MONGODB_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("VIGOR_MONGODB_URI / MONGODB_URI missing");
    const conn = mongoose.createConnection(uri, { dbName: "vigor" });
    const p = conn.asPromise().then((c) => c.db);
    // A failed connect must not poison the cache: without this, one outage at
    // startup makes every later call reject with that first error forever, even
    // after the DB is reachable again.
    p.catch((e) => {
      console.error("[vigorDb] connect failed:", e?.message || e);
      if (connPromise === p) connPromise = null;
    });
    connPromise = p;
  }
  return connPromise;
}

// The scraper's natural key is {materialNumber, configHash}, not articleNumber — the
// same article exists once per config path it was reached through. Keep the freshest
// doc that actually carries a positive netPrice (same freshest-wins rule
// scripts/syncVigourNames.js uses for stock). A missing/zero/NaN price is treated as
// "no data", never as a real 0 — a bad scrape must not zero a price in a quote.
export function pickFreshestNetPrices(docs) {
  const best = new Map();
  for (const d of docs || []) {
    const net = Number(d?.netPrice);
    if (!(net > 0)) continue;
    const seen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() || 0 : 0;
    const prev = best.get(d.articleNumber);
    if (!prev || seen >= prev.seen) best.set(d.articleNumber, { net, seen });
  }
  return new Map([...best].map(([id, v]) => [id, v.net]));
}

// Current net prices for the given article numbers, as Map<articleNumber, net>.
// Articles with no usable price are simply absent from the map — callers decide
// what to fall back to. Throws when the vigor DB is unreachable.
export async function fetchVigourNetPrices(articleNumbers) {
  const ids = [
    ...new Set(
      (articleNumbers || []).map((a) => String(a || "").trim()).filter(Boolean),
    ),
  ];
  if (!ids.length) return new Map();

  const db = await getVigorDb();
  const docs = await db
    .collection("products")
    .find(
      { articleNumber: { $in: ids } },
      { projection: { articleNumber: 1, netPrice: 1, lastSeenAt: 1 } },
    )
    .toArray();
  return pickFreshestNetPrices(docs);
}

export default getVigorDb;
