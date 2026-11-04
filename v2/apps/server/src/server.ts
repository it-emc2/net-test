// Process entrypoint: config → app → DB → listen, with graceful shutdown and
// process-level error logging (nothing fails silently).
import { loadConfig } from "@oc/config";
import { buildApp } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";

const cfg = loadConfig(); // throws on invalid config / remote DB outside production
const app = await buildApp(cfg);

process.on("unhandledRejection", (reason) => app.log.error({ err: reason }, "unhandled promise rejection"));
process.on("uncaughtException", (err) => {
  app.log.fatal({ err }, "uncaught exception — exiting");
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  await app.close();
  await disconnectDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await connectDb(cfg, app.log);
await app.listen({ port: cfg.PORT, host: cfg.HOST });
