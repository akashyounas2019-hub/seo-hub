import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Driver =
  | { kind: "pglite"; instance: ReturnType<typeof drizzlePglite<typeof schema>>; raw: PGlite }
  | { kind: "pg"; instance: ReturnType<typeof drizzlePg<typeof schema>>; raw: Pool };

let _driver: Driver | undefined;
let _migrated = false;

declare global {
  // eslint-disable-next-line no-var
  var __seo_hub_db_driver__: Driver | undefined;
}

function isPgUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//.test(url);
}

function init(): Driver {
  if (globalThis.__seo_hub_db_driver__) return globalThis.__seo_hub_db_driver__;

  const url = process.env.DATABASE_URL;
  if (isPgUrl(url)) {
    const pool = new Pool({
      connectionString: url,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
      idleTimeoutMillis: 30_000,
    });
    const instance = drizzlePg(pool, { schema });
    const driver: Driver = { kind: "pg", instance, raw: pool };
    globalThis.__seo_hub_db_driver__ = driver;
    return driver;
  }

  const dataDir = resolve(process.env.DATABASE_PATH ?? "./.data/pglite");
  mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  const instance = drizzlePglite(pglite, { schema });
  const driver: Driver = { kind: "pglite", instance, raw: pglite };
  globalThis.__seo_hub_db_driver__ = driver;
  return driver;
}

export function db() {
  if (!_driver) _driver = init();
  return _driver.instance;
}

export function dbDriver(): "pglite" | "pg" {
  if (!_driver) _driver = init();
  return _driver.kind;
}

async function execDDL(sqlStr: string): Promise<void> {
  if (!_driver) _driver = init();
  if (_driver.kind === "pglite") {
    await _driver.raw.exec(sqlStr);
  } else {
    await _driver.raw.query(sqlStr);
  }
}

export async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  const isPg = dbDriver() === "pg";
  if (isPg) {
    await execDDL(`SELECT pg_advisory_lock(0x47594c5f3031::bigint);`);
  }
  try {
    await execDDL(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('admin','manager','student');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE site_user_role AS ENUM ('manager','worker');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE lead_status AS ENUM ('new','contacted','qualified','won','lost');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE task_status AS ENUM ('todo','in_progress','blocked','in_review','done','cancelled');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE task_priority AS ENUM ('low','normal','high','urgent');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text NOT NULL,
        name text NOT NULL,
        domain text NOT NULL,
        city text,
        region text,
        knowledge_base text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sites_slug_uq ON sites(slug);
      CREATE UNIQUE INDEX IF NOT EXISTS sites_domain_uq ON sites(domain);

      CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        key_id text NOT NULL,
        secret text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_used_at timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_id_uq ON api_keys(key_id);

      CREATE TABLE IF NOT EXISTS leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        form text NOT NULL,
        name text,
        email text,
        phone text,
        service text,
        message text,
        page_url text,
        meta jsonb NOT NULL DEFAULT '{}'::jsonb,
        source_ip text,
        user_agent text,
        status lead_status NOT NULL DEFAULT 'new',
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        password_hash text NOT NULL,
        name text,
        role user_role NOT NULL DEFAULT 'student',
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users(email);

      CREATE TABLE IF NOT EXISTS tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        title text NOT NULL,
        description text,
        status task_status NOT NULL DEFAULT 'todo',
        priority task_priority NOT NULL DEFAULT 'normal',
        assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
        creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
        template_id uuid,
        due_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS org_settings (
        id text PRIMARY KEY DEFAULT 'singleton',
        anthropic_key_ciphertext text,
        llm_model text NOT NULL DEFAULT 'claude-opus-4-7',
        audit_enabled boolean NOT NULL DEFAULT true,
        digest_enabled boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL
      );
      INSERT INTO org_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

      CREATE TABLE IF NOT EXISTS claude_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL,
        title text NOT NULL,
        site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
        input jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'pending',
        priority text NOT NULL DEFAULT 'normal',
        output jsonb,
        output_markdown text,
        artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
        worker_id text,
        worker_info jsonb,
        prefer_worker text NOT NULL DEFAULT 'any',
        trigger_source text NOT NULL DEFAULT 'system',
        tokens_input integer,
        tokens_output integer,
        duration_ms integer,
        error text,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        claimed_at timestamptz,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS agent_profiles (
        id text PRIMARY KEY,
        name text NOT NULL,
        title text NOT NULL,
        focus text,
        skill_instructions text,
        is_custom boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id text PRIMARY KEY,
        site_id text DEFAULT 'safaeewala',
        title text NOT NULL,
        "desc" text,
        assignee text NOT NULL,
        priority text NOT NULL DEFAULT 'medium',
        status text NOT NULL DEFAULT 'todo',
        due text,
        template_id text,
        job_id text,
        output_markdown text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS kanban_task_templates (
        id text PRIMARY KEY,
        name text NOT NULL,
        title text NOT NULL,
        "desc" text,
        default_assignee text,
        priority text NOT NULL DEFAULT 'medium',
        built_in boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS automation_flows (
        id text PRIMARY KEY,
        name text NOT NULL,
        "desc" text,
        category text NOT NULL,
        cadence text NOT NULL DEFAULT 'weekly',
        status text NOT NULL DEFAULT 'running',
        icon text,
        accent text,
        last_run text DEFAULT '—',
        success_rate integer NOT NULL DEFAULT 100,
        assigned_agents jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    _migrated = true;
  } finally {
    if (isPg) {
      await execDDL(`SELECT pg_advisory_unlock(0x47594c5f3031::bigint);`);
    }
  }
}
