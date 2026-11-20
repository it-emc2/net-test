import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // served by v2 under /app (today's UI keeps "/" until every screen has moved)
  base: "/app/",
  server: {
    port: 5180,
    // the photo index of today's UI (src/public/referenz-manifest.js) is imported from the repo root
    fs: { allow: ["../../.."] },
    // API calls go to the v2 server during development
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["./test/setup.ts"],
    // replay tests type whole recorded forms: 3–5 s each on a loaded CI runner, over the default 5 s now and then
    testTimeout: 20000,
  },
});
