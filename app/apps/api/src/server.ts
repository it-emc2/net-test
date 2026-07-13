import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { config } from "./services/config.js";
import { env } from "./config/env.js";

async function main(): Promise<void> {
  await connectDb();
  await config.init(); // load AppConfig overrides into the pricing rate cache
  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
