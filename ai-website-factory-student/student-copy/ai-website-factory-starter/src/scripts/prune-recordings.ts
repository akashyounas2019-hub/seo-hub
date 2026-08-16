/**
 * Recording disk + DB cleanup. Walks `RECORDING_STORAGE_PATH`, deletes any
 * `*.webm` whose mtime is older than `RECORDING_RETENTION_DAYS` (default 90),
 * and deletes the matching `screen_recordings` rows.
 *
 * Safe to run repeatedly — anything already gone is skipped.
 *
 * Usage: `npm run prune:recordings`
 * Suggested cron: 0 4 * * *
 */
import { readdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inArray } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { screenRecordings } from "../db/schema";

const ROOT = resolve(process.env.RECORDING_STORAGE_PATH ?? "./.data/recordings");
const RETENTION_DAYS = Number.parseInt(process.env.RECORDING_RETENTION_DAYS ?? "90", 10);

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: string[];
  try {
    entries = (await readdir(dir)) as unknown as string[];
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st: Awaited<ReturnType<typeof stat>>;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile() && name.endsWith(".webm")) {
      yield full;
    }
  }
}

async function main() {
  await ensureSchema();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let filesDeleted = 0;
  let rowsDeleted = 0;
  const deletedPaths: string[] = [];

  console.log(`[prune-recordings] root=${ROOT} retention=${RETENTION_DAYS}d cutoff=${new Date(cutoff).toISOString()}`);

  for await (const file of walk(ROOT)) {
    try {
      const st = await stat(file);
      if (st.mtimeMs >= cutoff) continue;
      await unlink(file);
      filesDeleted++;
      deletedPaths.push(file);
    } catch (err) {
      console.warn(`[prune-recordings] failed on ${file}:`, err instanceof Error ? err.message : err);
    }
  }

  if (deletedPaths.length > 0) {
    // Bulk delete the matching DB rows in chunks (Postgres parameter limit ~30k).
    const chunkSize = 500;
    for (let i = 0; i < deletedPaths.length; i += chunkSize) {
      const chunk = deletedPaths.slice(i, i + chunkSize);
      const result = await db()
        .delete(screenRecordings)
        .where(inArray(screenRecordings.storagePath, chunk))
        .returning({ id: screenRecordings.id });
      rowsDeleted += Array.isArray(result) ? result.length : 0;
    }
  }

  console.log(`[prune-recordings] done — files=${filesDeleted} rows=${rowsDeleted}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
