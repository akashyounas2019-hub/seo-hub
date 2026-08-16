import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Minimal config for the render-only UI tests — no setupFiles, so it never
// opens PGlite and is safe to run while the dev server is live.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    include: ["tests/ui-render.uitest.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
