// MongoDB access for OC v2.
//  - Same database, same collections as the legacy app (ADR 002) — no migrations here.
//  - autoIndex/autoCreate OFF: Mongoose must never create indexes or collections implicitly
//    (an index build is a write; on prod it would be an unreviewed schema change).
//  - DB_READONLY: a global Mongoose plugin rejects every write before it reaches the server.
import mongoose, { type Schema } from "mongoose";
import type { AppConfig } from "@oc/config";
import { redactUri } from "@oc/config";

export class ReadOnlyDatabaseError extends Error {
  override name = "ReadOnlyDatabaseError";
  readonly statusCode = 503;
  constructor(op: string) {
    super(`Write operation "${op}" blocked: database is in read-only mode (DB_READONLY=1).`);
  }
}

const WRITE_QUERY_OPS = [
  "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany",
  "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete",
] as const;

let readOnlyInstalled = false;

/** Registers the read-only guard on all schemas compiled AFTER this call. */
export function installReadOnlyGuard(): void {
  if (readOnlyInstalled) return;
  readOnlyInstalled = true;
  mongoose.plugin((schema: Schema) => {
    schema.pre("save", function () { throw new ReadOnlyDatabaseError("save"); });
    schema.pre("insertMany", function () { throw new ReadOnlyDatabaseError("insertMany"); });
    for (const op of WRITE_QUERY_OPS) {
      schema.pre(op, function () { throw new ReadOnlyDatabaseError(op); });
    }
  });
  // bulkWrite bypasses middleware → block it on the Model prototype as well
  const proto = mongoose.Model as unknown as { bulkWrite: (...a: unknown[]) => unknown };
  proto.bulkWrite = () => Promise.reject(new ReadOnlyDatabaseError("bulkWrite"));
}

export async function connectDb(cfg: AppConfig, log: { info: (o: object, m: string) => void }) {
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
  mongoose.set("strictQuery", true);
  if (cfg.DB_READONLY) installReadOnlyGuard();
  await mongoose.connect(cfg.MONGODB_URI, {
    dbName: cfg.MONGODB_DB,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
  });
  log.info({ db: cfg.MONGODB_DB, uri: redactUri(cfg.MONGODB_URI), readOnly: cfg.DB_READONLY }, "database connected");
  return mongoose.connection;
}

export function dbState(): "connected" | "connecting" | "disconnected" {
  const s = mongoose.connection.readyState;
  return s === 1 ? "connected" : s === 2 ? "connecting" : "disconnected";
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
