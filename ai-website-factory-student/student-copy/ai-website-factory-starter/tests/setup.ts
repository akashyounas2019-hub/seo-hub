import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";

// Each test run gets a brand-new PGlite directory so prior test state can't leak.
const tmp = mkdtempSync(join(tmpdir(), "gyl-test-pglite-"));
process.env.DATABASE_PATH = tmp;
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ??
  "test-session-secret-must-be-at-least-32-chars-long-for-aes-256";
// NODE_ENV is typed read-only in @types/node 22+. Vitest already sets it to
// 'test'; this is just a safety net using a cast.
(process.env as Record<string, string>).NODE_ENV ??= "test";

beforeAll(async () => {
  const { ensureSchema } = await import("@/db/client");
  await ensureSchema();
});

afterAll(() => {
  // Best-effort cleanup; if PGlite has the dir open this may fail and that's fine.
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {}
});
