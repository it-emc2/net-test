// Read-only access to the separate "vigor" database (daily scraper, live net prices).
// Port of legacy src/external/vigorDb.js; same freshest-price rule.
import mongoose from "mongoose";

let dbPromise: Promise<mongoose.mongo.Db> | null = null;

export function getVigorDb(uri: string): Promise<mongoose.mongo.Db> {
  if (!dbPromise) {
    const conn = mongoose.createConnection(uri, { dbName: "vigor", autoIndex: false, autoCreate: false });
    const p = conn.asPromise().then((c) => c.db!);
    p.catch(() => { if (dbPromise === p) dbPromise = null; });
    dbPromise = p;
  }
  return dbPromise;
}

export function pickFreshestNetPrices(docs: Array<{ articleNumber?: string; netPrice?: unknown; lastSeenAt?: unknown }>) {
  const best = new Map<string, { net: number; seen: number }>();
  for (const d of docs || []) {
    const net = Number(d?.netPrice);
    if (!(net > 0)) continue;
    const seen = d.lastSeenAt ? new Date(d.lastSeenAt as string).getTime() || 0 : 0;
    const prev = best.get(d.articleNumber as string);
    if (!prev || seen >= prev.seen) best.set(d.articleNumber as string, { net, seen });
  }
  return new Map([...best].map(([id, v]) => [id, v.net]));
}

export function vigorPriceFetcher(uri: string) {
  return async (articleNumbers: string[]) => {
    const ids = [...new Set((articleNumbers || []).map((a) => String(a || "").trim()).filter(Boolean))];
    if (!ids.length) return new Map<string, number>();
    const db = await getVigorDb(uri);
    const docs = await db.collection("products")
      .find({ articleNumber: { $in: ids } }, { projection: { articleNumber: 1, netPrice: 1, lastSeenAt: 1 } })
      .toArray();
    return pickFreshestNetPrices(docs as any);
  };
}
