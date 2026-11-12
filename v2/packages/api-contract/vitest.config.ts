import { defineConfig } from "vitest/config";
export default defineConfig({ test: { name: "api-contract", include: ["test/**/*.test.ts"] } });
