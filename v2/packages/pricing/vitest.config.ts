import { defineConfig } from "vitest/config";
export default defineConfig({ test: { name: "pricing", include: ["test/**/*.test.ts"], testTimeout: 60000 } });
