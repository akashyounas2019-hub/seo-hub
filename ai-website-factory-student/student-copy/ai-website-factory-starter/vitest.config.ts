import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Tests share PGlite — must run serially in one fork to avoid the single-process trap.
    // Vitest 4 expects this at the top level (`forks`) but the published types still
    // expect the legacy `poolOptions.forks` shape. Use the legacy shape — vitest 4
    // accepts it at runtime with a deprecation warning, and TypeScript is happy.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
    // Phase 6 added ~30 new tables/columns/indexes to ensureSchema(); the
    // beforeAll hook now takes longer to run all CREATE/ALTER statements on
    // PGlite. Bump to 45s so the schema migration has headroom on slower
    // machines.
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
