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

module.exports = async () => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Seed the login user. The app has no auth bypass, so the browser needs a
  // real session cookie from a real scrypt-hashed user.
  const mongoose = (await import("mongoose")).default;
  const { hashPassword } = await import("../../../src/services/authService.js");
  const User = (await import("../../../src/models/User.js")).default;

  await mongoose.connect(uri, { dbName: DB_NAME });
  await User.create({
    email: USER.email,
    name: "E2E",
    passwordHash: hashPassword(USER.password),
    role: "admin",
    active: true,
  });
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
