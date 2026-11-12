// Tap measurement (ADR 026): same own stack as the parity suite (in-memory MongoDB + real app,
// outbound blocked), iPad-sized viewport. Run: npm run test:perf  (PARITY_TARGET=v2 for v2)
const { defineConfig, devices } = require("@playwright/test");
const { PORT } = require("./tests/e2e/parity/global-setup.cjs");

module.exports = defineConfig({
  testDir: "./tests/e2e/perf",
  testMatch: /.*\.spec\.cjs/,
  timeout: 240000,
  retries: 0,
  workers: 1,
  globalSetup: require.resolve("./tests/e2e/parity/global-setup.cjs"),
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, hasTouch: true } }],
});
