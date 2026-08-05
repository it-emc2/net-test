// Boots a throwaway MongoDB, seeds one login user, and starts the real app
// against it. Returns a teardown so Playwright stops both afterwards.
const { spawn } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "../../..");

// Must be an origin in app.js's CORS allowlist (`allowedExact`), otherwise
// same-origin POSTs from the page are rejected before they reach a route.
// 3000/3001/5173 on localhost and 127.0.0.1 are the allowed local ones.
const PORT = Number(process.env.E2E_PORT || 3001);
const DB_NAME = "e2e-offline-sync";

const USER = { email: "e2e@test.local", password: "e2e-password" };
// Non-default on purpose; see the seed call below. Only ever written to a
// throwaway in-memory DB — never to a shared one we did not create.
const LABOR_RATE_OVERRIDE = { key: "LABOR_RATE_KK", value: 71.25 };

// Point the suite at a real database instead of an in-memory one:
//   E2E_ENV_FILE=/path/to/.env E2E_MONGODB_DB=KonfiguratorDB_dev npx playwright test ...
// The env file is read here rather than passed on the command line so the URI
// never lands in shell history or CI logs.
if (process.env.E2E_ENV_FILE) {
  require("dotenv").config({ path: process.env.E2E_ENV_FILE });
}
const EXTERNAL_URI = process.env.E2E_MONGODB_URI || process.env.MONGODB_URI || null;
const EXTERNAL_DB = process.env.E2E_MONGODB_DB || null;
const USE_EXTERNAL = Boolean(EXTERNAL_DB && EXTERNAL_URI);

// Refuse to run against production, whatever is configured: this suite seeds a
// user and creates drafts.
if (USE_EXTERNAL && /^KonfiguratorDB$/i.test(EXTERNAL_DB)) {
  throw new Error("E2E_MONGODB_DB must not be the production database.");
}

// Every draft these tests create is named after one of these surnames.
const TEST_SURNAMES = [
  "Meier", "Muller", "Schmidt", "Fallback", "Offline",
  "Online", "Response", "Graul", "Race",
];

async function waitForHealth(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`app exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`app did not become healthy within ${timeoutMs}ms`);
}

// A leftover app from an interrupted run answers /api/health but points at a
// mongod that is long gone, so every test fails at login with a baffling 401.
// Refuse to start rather than test against someone else's server.
async function assertPortFree(port) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/health`);
  } catch {
    return; // nothing listening — good
  }
  throw new Error(
    `Port ${port} is already serving (/api/health -> ${res.status}). ` +
      `Stop it first: pkill -f "node src/app.js". ` +
      `Or pick another CORS-allowed port via E2E_PORT (3000/3001/5173).`,
  );
}

module.exports = async () => {
  await assertPortFree(PORT);
  let mongod = null;
  let uri;
  if (USE_EXTERNAL) {
    uri = EXTERNAL_URI;
    console.log(`[e2e] using external database "${EXTERNAL_DB}"`);
  } else {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }

  // Seed the login user. The app has no auth bypass, so the browser needs a
  // real session cookie from a real scrypt-hashed user.
  const mongoose = (await import("mongoose")).default;
  const { hashPassword } = await import("../../../src/services/authService.js");
  const User = (await import("../../../src/models/User.js")).default;
  const AppConfig = (await import("../../../src/models/AppConfig.js")).default;

  const dbName = USE_EXTERNAL ? EXTERNAL_DB : DB_NAME;
  await mongoose.connect(uri, { dbName });

  // Idempotent: a shared dev database may already carry the test user from an
  // earlier run, and teardown only removes what this run created.
  const preexistingUser = await User.findOne({ email: USER.email }).lean();
  await User.updateOne(
    { email: USER.email },
    {
      $set: {
        name: "E2E",
        passwordHash: hashPassword(USER.password),
        role: "admin",
        active: true,
      },
    },
    { upsert: true },
  );
  if (!USE_EXTERNAL) {
    // A deliberately non-default rate. Without an override every config value
    // equals pricing-core's hardcoded fallback, so the offline-pricing tests
    // could not tell "used the cached config" from "used the built-in default".
    // Never written to a shared database — it would change a real labour rate.
    await AppConfig.create({ key: LABOR_RATE_OVERRIDE.key, value: LABOR_RATE_OVERRIDE.value });
  }

  const productCount = await mongoose.connection
    .collection("Products")
    .countDocuments()
    .catch(() => 0);
  console.log(`[e2e] ${dbName}: ${productCount} products available for pricing`);

  await mongoose.disconnect();

  const child = spawn("node", ["src/app.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB: dbName,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Surface app crashes; otherwise a failed boot just looks like a timeout.
  child.stderr.on("data", (d) => process.stderr.write(`[app] ${d}`));

  await waitForHealth(`http://127.0.0.1:${PORT}/api/health`, child);

  return async () => {
    child.kill("SIGKILL");

    if (USE_EXTERNAL) {
      // Leave the shared database as we found it.
      await mongoose.connect(uri, { dbName: EXTERNAL_DB });
      const Draft = (await import("../../../src/models/Draft.js")).default;
      const removed = await Draft.deleteMany({
        name: { $regex: `-(${TEST_SURNAMES.join("|")})-`, $options: "i" },
      });
      if (!preexistingUser) await User.deleteOne({ email: USER.email });
      console.log(
        `[e2e] cleanup: removed ${removed.deletedCount} test drafts` +
          (preexistingUser ? "" : " and the test user"),
      );
      await mongoose.disconnect();
    }

    await mongod?.stop();
  };
};

module.exports.PORT = PORT;
module.exports.USER = USER;
module.exports.LABOR_RATE_OVERRIDE = USE_EXTERNAL ? null : LABOR_RATE_OVERRIDE;
