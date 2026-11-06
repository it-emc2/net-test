// UI parity suite stack: throwaway in-memory MongoDB seeded with the catalog snapshot
// (tests/golden/fixtures/docs) + one admin login, then the REAL app on a CORS-allowed port.
// All outbound integrations point at a dead local port, so no test can ever reach Bitrix,
// SMTP, onlinebrief24, planning, routing or the Magic API.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.PARITY_PORT || 5173); // in app.js CORS allowlist
const DB_NAME = "e2e-parity";
const USER = { email: "parity@test.local", password: "parity-password" };
const DEAD = "http://127.0.0.1:9"; // discard port — connection refused, instantly

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, p), "utf8"));

async function waitForHealth(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`app exited early with code ${child.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not become healthy within ${timeoutMs}ms`);
}

module.exports = async () => {
  try {
    await fetch(`http://127.0.0.1:${PORT}/api/health`);
    throw new Error(`Port ${PORT} already serving — stop it first or set PARITY_PORT (3000/3001/5173).`);
  } catch (e) {
    if (String(e.message).startsWith("Port ")) throw e;
  }

  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  const mongoose = (await import("mongoose")).default;
  const { hashPassword } = await import("../../../src/services/authService.js");
  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  await db.collection("users").insertOne({
    email: USER.email, name: "Parity", passwordHash: hashPassword(USER.password), role: "admin", active: true,
  });
  await db.collection("Products").insertMany(readJson("tests/golden/fixtures/docs/products.json"));
  const config = readJson("tests/golden/fixtures/pricing/config.json");
  await db.collection("appconfigs").insertMany(Object.entries(config).map(([key, value]) => ({ key, value })));
  const vigor = readJson("tests/golden/fixtures/docs/vigor-products.json");
  if (vigor.length) await mongoose.connection.getClient().db("vigor").collection("products").insertMany(vigor);
  await mongoose.disconnect();

  // PARITY_TARGET=v2 runs the very same suite against the rewrite (phase 6a, ADR 021):
  // v2 serves today's UI files and must behave identically. Needs `npm run build` in v2/.
  const target = process.env.PARITY_TARGET === "v2" ? "v2" : "legacy";
  const entry = target === "v2" ? ["v2/apps/server/dist/server.js"] : ["src/app.js"];
  const v2Env = target === "v2" ? {
    HOST: "127.0.0.1", LOG_LEVEL: "warn", SMTP_SEND_PORT: "9", GOTENBERG_URL: DEAD,
    BITRIX_WEBHOOK_BASE: `${DEAD}/rest/0/blocked`, OFFER_LINK_BASE: "http://oc.test",
  } : {};
  const child = spawn("node", entry, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MONGODB_URI: uri,
      MONGODB_DB: DB_NAME,
      VIGOR_MONGODB_URI: uri,
      PORT: String(PORT),
      AUTH_SECRET: "parity-only-secret",
      BITRIX_WEBHOOK_BASE: `${DEAD}/rest/0/blocked/`,
      SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", IMAP_HOST: "127.0.0.1", IMAP_PORT: "9",
      OB24_BASE_URL: DEAD, OB24_MODE: "test",
      PLANNING_API_BASE_URL: DEAD, EXTERNAL_API_BASE: DEAD,
      ORS_API_KEY: "", PDF_SERVICES_CLIENT_ID: "", PDF_SERVICES_CLIENT_SECRET: "",
      ...v2Env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(path.join(REPO_ROOT, `test-results-parity-${target}.log`));
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  await waitForHealth(`http://127.0.0.1:${PORT}/api/health`, child);

  return async () => {
    child.kill("SIGKILL");
    await mongod.stop();
  };
};

module.exports.PORT = PORT;
module.exports.USER = USER;
