import { defineConfig } from "vitest/config";
// DB-heavy tests (in-memory MongoDB, spawned legacy app): one worker, files in sequence.
// Parallel mongod instances crashed a worker (SIGSEGV) under load on Node 25 locally.
export default defineConfig({
  test: { name: "server", include: ["test/**/*.test.ts"], testTimeout: 60000, hookTimeout: 180000, fileParallelism: false, maxWorkers: 1 },
});
