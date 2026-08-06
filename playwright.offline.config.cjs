// Separate from playwright.config.cjs on purpose: that one drives specs against
// a dev server you start yourself, this one owns its whole stack (throwaway
// MongoDB + the real app). Run with:
//   npx playwright test -c playwright.offline.config.cjs
const { defineConfig, devices } = require("@playwright/test");
const { PORT } = require("./tests/e2e/offline-sync/global-setup.cjs");

module.exports = defineConfig({
  testDir: "./tests/e2e/offline-sync",
  testMatch: /.*\.spec\.cjs/,
  timeout: 60000,
  retries: 0,
  workers: 1, // one app + one DB, shared
  globalSetup: require.resolve("./tests/e2e/offline-sync/global-setup.cjs"),
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // This suite is the one place the offline shell must actually run.
    serviceWorkers: "allow",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
