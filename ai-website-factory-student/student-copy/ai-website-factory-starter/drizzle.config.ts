import type { Config } from "drizzle-kit";

// drizzle-kit is only used in production deployments against real Postgres.
// Local dev uses inline ensureSchema() against PGlite (see src/db/client.ts).
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/gyl_dev",
  },
  strict: true,
  verbose: true,
} satisfies Config;
