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
// Non-default on purpose; see the seed call below.
const LABOR_RATE_OVERRIDE = { key: "LABOR_RATE_KK", value: 71.25 };

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
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Seed the login user. The app has no auth bypass, so the browser needs a
  // real session cookie from a real scrypt-hashed user.
  const mongoose = (await import("mongoose")).default;
  const { hashPassword } = await import("../../../src/services/authService.js");
  const User = (await import("../../../src/models/User.js")).default;
  const AppConfig = (await import("../../../src/models/AppConfig.js")).default;

  await mongoose.connect(uri, { dbName: DB_NAME });
  await User.create({
    email: USER.email,
    name: "E2E",
    passwordHash: hashPassword(USER.password),
    role: "admin",
    active: true,
  });
  // A deliberately non-default rate. Without an override every config value
  // equals pricing-core's hardcoded fallback, so the offline-pricing tests
  // could not tell "used the cached config" from "used the built-in default".
  await AppConfig.create({ key: LABOR_RATE_OVERRIDE.key, value: LABOR_RATE_OVERRIDE.value });

  await mongoose.disconnect();

  const child = spawn("node", ["src/app.js"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB: DB_NAME,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Surface app crashes; otherwise a failed boot just looks like a timeout.
  child.stderr.on("data", (d) => process.stderr.write(`[app] ${d}`));

  await waitForHealth(`http://127.0.0.1:${PORT}/api/health`, child);

  return async () => {
    child.kill("SIGKILL");
    await mongod.stop();
  };
};

module.exports.PORT = PORT;
module.exports.USER = USER;
module.exports.LABOR_RATE_OVERRIDE = LABOR_RATE_OVERRIDE;
