// UI parity suite: owns its stack (in-memory MongoDB + real app, outbound blocked).
// Snapshots in tests/e2e/parity/*-snapshots/ describe the CURRENT app's UI behaviour;
// the rewrite must reproduce them.  Run: npm run test:parity
const { defineConfig, devices } = require("@playwright/test");
const { PORT } = require("./tests/e2e/parity/global-setup.cjs");

module.exports = defineConfig({
  testDir: "./tests/e2e/parity",
  testMatch: /.*\.spec\.cjs/,
  timeout: 60000,
  retries: 0,
  workers: 1,
  globalSetup: require.resolve("./tests/e2e/parity/global-setup.cjs"),
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1280, height: 1000 },
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  // viewport AFTER the device preset, otherwise the preset (1280×720) wins
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1000 } } }],
});
