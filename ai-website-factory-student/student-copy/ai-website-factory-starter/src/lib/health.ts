import { accessSync, constants, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { gte, sql } from "drizzle-orm";
import { db, dbDriver, ensureSchema } from "@/db/client";
import { events } from "@/db/schema";

export type Probe = {
  name: string;
  ok: boolean;
  detail?: Record<string, unknown>;
  elapsed_ms: number;
};

async function probe<T>(name: string, fn: () => Promise<T>): Promise<Probe & { value?: T }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { name, ok: true, value, elapsed_ms: Date.now() - start };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: { error: err instanceof Error ? err.message : String(err) },
      elapsed_ms: Date.now() - start,
    };
  }
}

export async function runHealthProbes(): Promise<{ ok: boolean; probes: Probe[]; driver: string }> {
  await ensureSchema();

  const probes: Probe[] = [];

  // 1. DB roundtrip
  const dbProbe = await probe("db_query", async () => {
    const r = (await db().execute(sql`select 1 as ok`)) as unknown as
      | { rows: unknown[] }
      | unknown[];
    const rows = Array.isArray(r) ? r : (r.rows ?? []);
    if (rows.length === 0) throw new Error("no rows returned");
    return rows[0];
  });
  probes.push(dbProbe);

  // 2. Recording storage writable
  const recProbe = await probe("recording_dir_writable", async () => {
    const dir = resolve(process.env.RECORDING_STORAGE_PATH ?? "./.data/recordings");
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return { path: dir };
  });
  probes.push(recProbe);

  // 3. Recent lead-ingest activity. We don't fail if zero — a quiet day is fine.
  //    But we surface the count so external monitors can detect "no ingest in 7 days".
  const ingestProbe = await probe("recent_ingest_24h", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(gte(events.receivedAt, since));
    return { events_last_24h: row?.n ?? 0 };
  });
  probes.push(ingestProbe);

  const ok = probes.every((p) => p.ok);
  return { ok, probes, driver: dbDriver() };
}
