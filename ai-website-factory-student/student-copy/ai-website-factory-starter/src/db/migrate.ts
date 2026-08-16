/**
 * Production migration runner. Reads SQL files from ./drizzle/ in order and applies
 * them against Postgres. drizzle-kit generates these from schema.ts via:
 *   npm run db:generate
 *
 * Local dev still uses the inline ensureSchema() in client.ts against PGlite. Real
 * Postgres deploys should use this script:
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    console.error("DATABASE_URL is required and must be a postgres:// connection string.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
