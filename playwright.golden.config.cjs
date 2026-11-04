// Golden-master BUILDERS that need the real legacy UI (e.g. AH pricing lives only in the
// browser). Not part of normal test runs. Reuses the parity stack (in-memory DB, real app,
// outbound blocked).  Run: npx playwright test -c playwright.golden.config.cjs
const { defineConfig, devices } = require("@playwright/test");
const { PORT } = require("./tests/e2e/parity/global-setup.cjs");

module.exports = defineConfig({
  testDir: "./scripts/golden",
  testMatch: /.*\.build\.cjs/,
  timeout: 600000,
  workers: 1,
  globalSetup: require.resolve("./tests/e2e/parity/global-setup.cjs"),
  use: { baseURL: `http://localhost:${PORT}`, headless: true, serviceWorkers: "block" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1000 } } }],
});
