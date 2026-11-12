// Cut-over CLI (CUTOVER.md). Dry run by default — prints what WOULD change; `--apply` writes.
//   node apps/server/dist/cli/migrate.js                 # dry run of 001 + 002
//   node apps/server/dist/cli/migrate.js --apply         # run 001 + 002 (owner OK, after backup)
//   node apps/server/dist/cli/migrate.js rollback-export [--apply]
// Uses the normal config (MONGODB_URI …): outside NODE_ENV=production only a local DB is accepted.
import { loadConfig } from "@oc/config";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../platform/db.js";
import { MIGRATIONS, exportDealDraftsToLegacy } from "../migrations/index.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const cfg = loadConfig();
if (cfg.DB_READONLY && apply) throw new Error("DB_READONLY is set — refusing --apply");
await connectDb(cfg, { info: (_o: object, m: string) => process.stderr.write(`${m}\n`) });
try {
  const db = mongoose.connection.db!;
  const steps = args.includes("rollback-export") ? [exportDealDraftsToLegacy] : MIGRATIONS;
  for (const step of steps) {
    const r = await step(db, !apply);
    process.stdout.write(`${JSON.stringify(r)}\n`);
  }
  if (!apply) process.stderr.write("dry run — nothing was written. Re-run with --apply to execute.\n");
} finally {
  await disconnectDb();
}
