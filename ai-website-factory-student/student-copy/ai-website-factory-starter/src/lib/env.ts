import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Storage — supply DATABASE_URL for prod Postgres; else PGlite uses DATABASE_PATH.
  DATABASE_URL: z.string().optional(),
  DATABASE_PATH: z.string().default("./.data/pglite"),
  DATABASE_POOL_MAX: z.string().regex(/^\d+$/).optional(),

  // Auth
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  SESSION_SECRET: z.string().min(32).optional(),

  // Seeding
  SEED_SITES: z.string().optional(),

  // Deploy-time public URL (used for absolute links in emails later)
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Photo Studio (Nano Banana / Gemini 2.5 Flash Image) — Phase P1+
  // Where generated images live on disk. Defaults under .data so it's
  // sibling-to-recordings and gets backed up by the same rsync.
  PHOTO_STORAGE_PATH: z.string().default("./.data/photos"),
});

let _cache: z.infer<typeof schema> | undefined;

export function env() {
  if (_cache) return _cache;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables — see logs");
  }
  _cache = parsed.data;
  return _cache;
}

export function assertProdEnv(): void {
  const e = env();
  if (e.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!e.DATABASE_URL) missing.push("DATABASE_URL");
  if (!e.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!e.ADMIN_EMAIL) missing.push("ADMIN_EMAIL");

  if (missing.length) {
    throw new Error(`Production env missing required values: ${missing.join(", ")}`);
  }
}
