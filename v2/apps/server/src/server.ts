// Process entrypoint: config → DB → app → listen, with graceful shutdown and
// process-level error logging (nothing fails silently).
import { loadConfig } from "@oc/config";
import { buildApp } from "./app.js";
import { connectDb, disconnectDb } from "./platform/db.js";
import { registerApi } from "./compose.js";

const cfg = loadConfig(); // throws on invalid config / remote DB outside production
// DB first: registerApi loads the business settings (prices, rates) at startup — before the fix
// it waited 10 s on an unconnected DB and ran on defaults until the next refresh.
const bootLog = { info: (o: object, m: string) => process.stdout.write(`${JSON.stringify({ level: 30, time: Date.now(), service: "oc-server", msg: m, ...o })}\n`) };
await connectDb(cfg, bootLog);
const app = await buildApp(cfg, { register: (a) => registerApi(a, { cfg }) });

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

await app.listen({ port: cfg.PORT, host: cfg.HOST });
