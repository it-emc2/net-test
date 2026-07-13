// Dedicated read-only connection to the Vigor product DB (dbName "vigor").
// Kept separate from the main KonfiguratorDB connection. The Vigor user is
// restricted (no listCollections) — we only read the "products" collection.
import mongoose from "mongoose";
import type { Db } from "mongodb";
import { env } from "./env.js";

let connPromise: Promise<Db> | null = null;

export function getVigorDb(): Promise<Db> {
  if (!connPromise) {
    const conn = mongoose.createConnection(env.vigorUri, { dbName: "vigor" });
    connPromise = conn.asPromise().then((c) => c.db as Db);
  }
  return connPromise;
}
