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
    // ALTER TYPE ... ADD VALUE cannot run in the same transaction as a
    // later statement that *uses* the new value (e.g. a column default) --
    // Postgres raises "unsafe use of new value" if you try. Run the enum
    // additions as their own round-trip (own implicit transaction) before
    // the main DDL block that references 'owner'/'editor'/'viewer'.
    await execDDL(`
      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('owner','admin','head_of_department','editor','viewer');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
      -- If user_role already existed with the old admin/manager/student
      -- values (pre-Settings-persistence deploys), add the new ones
      -- additively -- Postgres enums can't drop values, so the old ones
      -- stay defined but unused.
      DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'owner'; EXCEPTION WHEN others THEN null; END $$;
      DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'editor'; EXCEPTION WHEN others THEN null; END $$;
      DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer'; EXCEPTION WHEN others THEN null; END $$;
      -- head_of_department: real role backing the Approvals screen's
      -- "Head of Department can auto-approve independently" policy label,
      -- which previously had no actual identity behind it.
      DO $$ BEGIN ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_of_department'; EXCEPTION WHEN others THEN null; END $$;
    `);

    await execDDL(`
      DO $$ BEGIN
        CREATE TYPE lead_status AS ENUM ('new','contacted','qualified','won','lost');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      DO $$ BEGIN
        CREATE TYPE site_health AS ENUM ('healthy','attention','onboarding');
      EXCEPTION WHEN duplicate_object THEN null; END $$;

      CREATE TABLE IF NOT EXISTS sites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text NOT NULL,
        name text NOT NULL,
        domain text NOT NULL,
        city text,
        region text,
        knowledge_base text,
        structured_kb jsonb NOT NULL DEFAULT '{}'::jsonb,
        health site_health NOT NULL DEFAULT 'onboarding',
        pages_total integer NOT NULL DEFAULT 0,
        pages_indexed integer NOT NULL DEFAULT 0,
        open_fixes integer NOT NULL DEFAULT 0,
        ga_connected boolean NOT NULL DEFAULT false,
        ga_property_id text,
        ga_property_label text,
        gsc_connected boolean NOT NULL DEFAULT false,
        gsc_property_url text,
        gbp_connected boolean NOT NULL DEFAULT false,
        gbp_location_name text,
        wp_connected boolean NOT NULL DEFAULT false,
        wp_detail text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS structured_kb jsonb DEFAULT '{}'::jsonb;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS health site_health NOT NULL DEFAULT 'onboarding';
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS pages_total integer NOT NULL DEFAULT 0;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS pages_indexed integer NOT NULL DEFAULT 0;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS open_fixes integer NOT NULL DEFAULT 0;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS ga_connected boolean NOT NULL DEFAULT false;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS ga_property_id text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS ga_property_label text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS gsc_connected boolean NOT NULL DEFAULT false;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS gsc_property_url text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS gbp_connected boolean NOT NULL DEFAULT false;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS gbp_location_name text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_connected boolean NOT NULL DEFAULT false;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_detail text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_site_url text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_username text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS wp_app_password_ciphertext text;
      ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_category text;
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

      -- Was defined in schema.ts but had no matching DDL here at all, so
      -- the real HMAC-verified inbound webhook (api.events.ingest.ts --
      -- what a connected WordPress site's lead form actually POSTs to)
      -- 500'd on every real call with "relation does not exist", silently
      -- breaking lead capture. Same dual-definition gap already found and
      -- fixed this project for sessions and traffic_snapshots.
      CREATE TABLE IF NOT EXISTS events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        kind text NOT NULL,
        payload jsonb NOT NULL,
        signature_valid boolean NOT NULL,
        idempotency_key text NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS events_site_idem_uq ON events(site_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS events_site_received_idx ON events(site_id, received_at);

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
        role user_role NOT NULL DEFAULT 'viewer',
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz
      );
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users(email);

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        user_agent text,
        ip text
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS org_settings (
        id text PRIMARY KEY DEFAULT 'singleton',
        anthropic_key_ciphertext text,
        llm_model text NOT NULL DEFAULT 'claude-opus-4-7',
        audit_enabled boolean NOT NULL DEFAULT true,
        digest_enabled boolean NOT NULL DEFAULT true,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users(id) ON DELETE SET NULL
      );
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS gemini_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS groq_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS llm_provider_preference text NOT NULL DEFAULT 'gemini';
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS twilio_account_sid text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS twilio_auth_token_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS twilio_webhook_base_url text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS stripe_oauth_client_id text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS stripe_oauth_secret_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS square_oauth_client_id text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS square_oauth_secret_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS google_oauth_client_id text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS google_oauth_secret_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_host text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_port integer;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_user text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_password_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_from text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS public_base_url text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS network_knowledge_base text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS telegram_bot_token_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS telegram_webhook_secret text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS telegram_bot_username text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS claude_worker_secret text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'cleaning_services';
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS pagespeed_api_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS google_crux_api_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS indexnow_daily_quota integer NOT NULL DEFAULT 200;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS openai_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS semrush_key_ciphertext text;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_smtp_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_slack_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_telegram_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_rest_api_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_wordpress_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_stripe_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS integration_zapier_enabled boolean NOT NULL DEFAULT false;
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

      -- agent_profiles was defined, seeded, and never read/written by any
      -- route -- orphaned. Dropped for real on every deploy (idempotent).
      DROP TABLE IF EXISTS agent_profiles;

      CREATE TABLE IF NOT EXISTS kanban_tasks (
        id text PRIMARY KEY,
        site_id text,
        title text NOT NULL,
        "desc" text,
        assignee text NOT NULL,
        priority text NOT NULL DEFAULT 'medium',
        status text NOT NULL DEFAULT 'todo',
        due text,
        template_id text,
        job_id text,
        output_markdown text,
        approved_by text,
        approved_at timestamptz,
        published_url text,
        published_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS approved_by text;
      ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS approved_at timestamptz;
      ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS published_url text;
      ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS published_at timestamptz;
      ALTER TABLE kanban_tasks ADD COLUMN IF NOT EXISTS operator_notes text;
      -- Drops the hardcoded 'safaeewala' default on an already-existing
      -- production table -- every real insert path now explicitly resolves
      -- a real sites.id and refuses to insert without one, so this default
      -- could only ever fire and silently mislabel a task's site.
      ALTER TABLE kanban_tasks ALTER COLUMN site_id DROP DEFAULT;
      -- One-time backfill: confirmed live in production that this default
      -- had already fired for 2 real tasks (site_id = the slug
      -- 'safaeewala' instead of the real sites.id UUID), which silently
      -- broke site-scoped approval-rule matching for them (approval_rules.
      -- site_id is a real UUID FK). Only rewrites rows that still hold the
      -- literal slug string; a no-op once already corrected or on a fresh
      -- database with no such rows.
      UPDATE kanban_tasks SET site_id = (SELECT id::text FROM sites WHERE slug = 'safaeewala' LIMIT 1)
        WHERE site_id = 'safaeewala' AND EXISTS (SELECT 1 FROM sites WHERE slug = 'safaeewala');

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

      CREATE TABLE IF NOT EXISTS alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
        severity text NOT NULL DEFAULT 'info',
        title text NOT NULL,
        message text,
        source text NOT NULL DEFAULT 'system',
        status text NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts(status, created_at);
      CREATE INDEX IF NOT EXISTS alerts_site_idx ON alerts(site_id);

      CREATE TABLE IF NOT EXISTS webhook_subscribers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        label text NOT NULL,
        url text NOT NULL,
        secret text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_delivered_at timestamptz,
        last_status text
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_email text NOT NULL DEFAULT 'unknown',
        action text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at);

      CREATE TABLE IF NOT EXISTS notification_prefs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_key text NOT NULL,
        label text NOT NULL,
        email boolean NOT NULL DEFAULT false,
        slack boolean NOT NULL DEFAULT false,
        push boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS notification_prefs_event_key_uq ON notification_prefs(event_key);
      INSERT INTO notification_prefs (event_key, label, email, slack, push) VALUES
        ('site_health_low', 'Site health drops below 80', true, true, false),
        ('backlink_lost', 'New backlink from DR60+ referrer', true, false, false),
        ('weekly_rank_report', 'Weekly rank report', true, false, false),
        ('job_runner_error', 'Failed cron / job runner error', true, true, true),
        ('client_invoice_paid', 'Client invoice paid', true, false, false)
      ON CONFLICT (event_key) DO NOTHING;

      CREATE TABLE IF NOT EXISTS settings_automation_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        action text NOT NULL,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO settings_automation_rules (name, action, enabled)
      SELECT * FROM (VALUES
        ('Rank drop > 5 positions', 'Notify #seo-alerts + assign to Auditor', true),
        ('Backlink lost from DR60+', 'Create outreach task in Off-Page Expert', true),
        ('New keyword opportunity', 'Draft brief in Content Scout', false),
        ('CWV LCP > 2.5s', 'Assign to Technical Expert', true),
        ('Weekly digest', 'Email owners every Monday 09:00 GST', true)
      ) AS v(name, action, enabled)
      WHERE NOT EXISTS (SELECT 1 FROM settings_automation_rules);

      CREATE TABLE IF NOT EXISTS approval_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        min_priority text,
        category text,
        site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
        requires_approval boolean NOT NULL DEFAULT true,
        enabled boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO approval_rules (name, min_priority, category, site_id, requires_approval, enabled)
      SELECT * FROM (VALUES
        ('Critical priority always needs owner approval', 'critical', NULL::text, NULL::uuid, true, true),
        ('Low/medium priority auto-approved by Head of Department', 'low', NULL::text, NULL::uuid, false, true)
      ) AS v(name, min_priority, category, site_id, requires_approval, enabled)
      WHERE NOT EXISTS (SELECT 1 FROM approval_rules);

      CREATE TABLE IF NOT EXISTS site_pages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        url text NOT NULL,
        lastmod text,
        changefreq text,
        priority text,
        last_crawled_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_url_uq ON site_pages(site_id, url);
      CREATE INDEX IF NOT EXISTS site_pages_site_idx ON site_pages(site_id);

      DO $$ BEGIN
        CREATE TYPE qa_run_status AS ENUM ('queued', 'running', 'passed', 'warning', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS qa_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        scope text NOT NULL DEFAULT 'full',
        target_url text,
        status qa_run_status NOT NULL DEFAULT 'queued',
        job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
        pages_checked integer NOT NULL DEFAULT 0,
        checks_total integer NOT NULL DEFAULT 0,
        checks_passed integer NOT NULL DEFAULT 0,
        checks_failed integer NOT NULL DEFAULT 0,
        duration_ms integer,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS qa_runs_site_created_idx ON qa_runs(site_id, created_at);

      CREATE TABLE IF NOT EXISTS qa_findings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
        suite text NOT NULL,
        page_url text NOT NULL,
        severity text NOT NULL DEFAULT 'info',
        passed boolean NOT NULL,
        message text NOT NULL,
        detail jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS qa_findings_run_idx ON qa_findings(run_id);

      -- Was defined in schema.ts but had no matching DDL here at all, so
      -- every insert from api.analytics.sync.ts (the real endpoint an
      -- external pipeline like n8n posts metrics to) silently failed with
      -- "relation does not exist", caught by an empty catch block -- the
      -- same dual-definition gap already found and fixed once this session
      -- for the sessions table.
      CREATE TABLE IF NOT EXISTS traffic_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        source text NOT NULL,
        snapshot_date text NOT NULL,
        metrics jsonb NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS traffic_snapshots_uq ON traffic_snapshots(site_id, source, snapshot_date);
      CREATE INDEX IF NOT EXISTS traffic_snapshots_date_idx ON traffic_snapshots(snapshot_date);

      -- Caches the Issues tab's PageSpeed Insights + technical-check result
      -- so the dashboard can render the most recent real result instantly
      -- instead of re-running a live 20-60s PSI Lighthouse pass on every
      -- page load (the prior behaviour, which routinely hit its own fetch
      -- timeout and surfaced as "operation was aborted due to timeout").
      CREATE TABLE IF NOT EXISTS site_diagnostics_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        strategy text NOT NULL DEFAULT 'mobile',
        scores jsonb,
        page_speed_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
        page_speed_error text,
        technical_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
        checked_url text,
        source text NOT NULL DEFAULT 'manual',
        checked_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS site_diagnostics_site_strategy_uq ON site_diagnostics_reports(site_id, strategy);
    `);

    // One-time cleanup: task_comments/tasks/task_templates/site_users were
    // an older task-management model fully superseded by kanban_tasks +
    // kanban_task_templates, with zero application code left reading or
    // writing any of them (confirmed via full-codebase audit). Drop order
    // respects the real FK chain (task_comments -> tasks -> task_templates)
    // that existed for the two of these that ever actually had DDL run
    // (tasks, site_users); task_templates/task_comments never had CREATE
    // TABLE statements in this file at all, so IF EXISTS is a no-op for
    // them, kept here only for safety.
    await execDDL(`
      DROP TABLE IF EXISTS task_comments;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS task_templates;
      DROP TABLE IF EXISTS site_users;
      DROP TYPE IF EXISTS task_status;
      DROP TYPE IF EXISTS task_priority;
      DROP TYPE IF EXISTS site_user_role;
    `);

    _migrated = true;
  } finally {
    if (isPg) {
      await execDDL(`SELECT pg_advisory_unlock(0x47594c5f3031::bigint);`);
    }
  }
}
