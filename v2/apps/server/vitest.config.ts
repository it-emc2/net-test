import { defineConfig } from "vitest/config";
// DB-heavy tests (in-memory MongoDB, spawned legacy app): one worker, files in sequence.
// Parallel mongod instances crashed a worker (SIGSEGV) under load on Node 25 locally.
//
// SAFETY (ADR 001/017): some tests import LEGACY modules in-process. Several of them read
// external endpoints from env at import time and fall back to PRODUCTION defaults (legacy
// bitrix.js has a hard-coded webhook, planning.js the production URL). Every such variable is
// pinned here to a dead local port, so an in-process legacy import can never reach a real
// system. Tests that need a stub override these explicitly with 127.0.0.1 addresses.
const DEAD = "http://127.0.0.1:9";
export default defineConfig({
  test: {
    name: "server", include: ["test/**/*.test.ts"], testTimeout: 60000, hookTimeout: 180000, fileParallelism: false, maxWorkers: 1,
    env: {
      BITRIX_WEBHOOK_BASE: `${DEAD}/rest/0/blocked`, PLANNING_API_BASE_URL: DEAD, EXTERNAL_API_BASE: DEAD, OB24_BASE_URL: DEAD,
      SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", IMAP_HOST: "127.0.0.1", IMAP_PORT: "9", ORS_API_KEY: "", PDF_SERVICES_CLIENT_ID: "",
      MONGODB_URI: "mongodb://127.0.0.1:9", OFFER_LINK_BASE: "http://oc.test",
    },
  },
});
