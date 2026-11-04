import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // API calls go to the v2 server during development
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
  },
});
