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
  var __gyl_db_driver__: Driver | undefined;
}

function isPgUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//.test(url);
}

function init(): Driver {
  if (globalThis.__gyl_db_driver__) return globalThis.__gyl_db_driver__;

  const url = process.env.DATABASE_URL;
  if (isPgUrl(url)) {
    const pool = new Pool({
      connectionString: url,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? "10", 10),
      idleTimeoutMillis: 30_000,
    });
    const instance = drizzlePg(pool, { schema });
    const driver: Driver = { kind: "pg", instance, raw: pool };
    globalThis.__gyl_db_driver__ = driver;
    return driver;
  }

  const dataDir = resolve(process.env.DATABASE_PATH ?? "./.data/pglite");
  mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  const instance = drizzlePglite(pglite, { schema });
  const driver: Driver = { kind: "pglite", instance, raw: pglite };
  globalThis.__gyl_db_driver__ = driver;
  return driver;
}

export function db() {
  if (!_driver) _driver = init();
  return _driver.instance as unknown as Driver["kind"] extends "pg"
    ? ReturnType<typeof drizzlePg<typeof schema>>
    : ReturnType<typeof drizzlePglite<typeof schema>>;
}

export function dbDriver(): "pglite" | "pg" {
  if (!_driver) _driver = init();
  return _driver.kind;
}

async function execDDL(sql: string): Promise<void> {
  if (!_driver) _driver = init();
  if (_driver.kind === "pglite") {
    await _driver.raw.exec(sql);
  } else {
    await _driver.raw.query(sql);
  }
}

/**
 * Apply the v0.1 schema if missing. PGlite has no migration runner, so we inline
 * `CREATE TABLE IF NOT EXISTS` here. For Postgres production, prefer running
 * `npm run db:migrate` (drizzle-kit) — but `ensureSchema()` is still safe to call
 * because every statement is idempotent.
 *
 * Multi-process safety: when running against real Postgres (prod), wrap the
 * entire DDL block in `pg_advisory_xact_lock(0x47594c5f3031)` (= "GYL_01" as
 * a 64-bit int) so two Node processes booting in parallel don't race on
 * `CREATE TYPE`/`ALTER TABLE`. PGlite is single-process by construction so
 * the lock is a no-op there.
 */
export async function ensureSchema(): Promise<void> {
  if (_migrated) return;
  // Postgres-only advisory lock to serialize concurrent DDL across processes.
  // Lock id = hex("GYL_01") cast to int8. Released in `finally` below.
  // PGlite is single-writer so the lock is a no-op there.
  const isPg = dbDriver() === "pg";
  if (isPg) {
    // pg_advisory_lock is session-scoped; we must release explicitly.
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
    CREATE INDEX IF NOT EXISTS api_keys_site_idx ON api_keys(site_id);

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
    CREATE INDEX IF NOT EXISTS leads_site_created_idx ON leads(site_id, created_at);
    CREATE INDEX IF NOT EXISTS leads_email_idx ON leads(email);
    DO $$ BEGIN
      ALTER TABLE leads ADD COLUMN notes text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

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

    CREATE TABLE IF NOT EXISTS site_users (
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role site_user_role NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (site_id, user_id)
    );

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

    CREATE TABLE IF NOT EXISTS task_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      cadence text NOT NULL,
      default_assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      default_priority task_priority NOT NULL DEFAULT 'normal',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_run_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS task_templates_site_idx ON task_templates(site_id);

    CREATE TABLE IF NOT EXISTS tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      status task_status NOT NULL DEFAULT 'todo',
      priority task_priority NOT NULL DEFAULT 'normal',
      assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
      template_id uuid REFERENCES task_templates(id) ON DELETE SET NULL,
      due_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS tasks_site_idx ON tasks(site_id);
    CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS tasks_status_due_idx ON tasks(status, due_at);

    CREATE TABLE IF NOT EXISTS task_comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id uuid REFERENCES users(id) ON DELETE SET NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id, created_at);

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

    CREATE TABLE IF NOT EXISTS chat_threads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL DEFAULT 'New chat',
      created_at timestamptz NOT NULL DEFAULT now(),
      last_message_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chat_threads_user_idx ON chat_threads(user_id, last_message_at);

    DO $$ BEGIN
      CREATE TYPE chat_role AS ENUM ('user','assistant','system','tool');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS chat_messages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id uuid NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role chat_role NOT NULL,
      body text NOT NULL,
      tool_name text,
      tool_input jsonb,
      tool_output jsonb,
      input_tokens text,
      output_tokens text,
      cache_read_tokens text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id, created_at);

    DO $$ BEGIN
      CREATE TYPE task_audit_verdict AS ENUM ('done','partial','not_started','no_show','ambiguous');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS task_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      verdict task_audit_verdict NOT NULL,
      summary text NOT NULL,
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      tokens_used text,
      run_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS task_audits_task_idx ON task_audits(task_id, run_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      link text,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, created_at);
    CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(recipient_id, read_at);
    -- v0.3: per-site scoping for booking notifications (filterable in /admin/notifications)
    DO $$ BEGIN
      ALTER TABLE notifications ADD COLUMN site_id uuid REFERENCES sites(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS notifications_site_idx ON notifications(site_id, created_at);

    -- Phase 3
    CREATE TABLE IF NOT EXISTS desktop_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      device_name text,
      os_version text,
      app_version text,
      started_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      ended_at timestamptz,
      revoked boolean NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS desktop_sessions_user_idx ON desktop_sessions(user_id, started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS desktop_sessions_token_uq ON desktop_sessions(token_hash);

    CREATE TABLE IF NOT EXISTS screen_recordings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      desktop_session_id uuid NOT NULL REFERENCES desktop_sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      storage_path text NOT NULL,
      size_bytes text NOT NULL,
      duration_sec text,
      mime_type text NOT NULL DEFAULT 'video/webm',
      started_at timestamptz NOT NULL,
      ended_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS screen_recordings_session_idx ON screen_recordings(desktop_session_id, started_at);
    CREATE INDEX IF NOT EXISTS screen_recordings_user_idx ON screen_recordings(user_id, started_at);

    DO $$ BEGIN
      CREATE TYPE activity_event_kind AS ENUM (
        'session_start','session_end','wp_admin_open','wp_admin_close',
        'page_focus','page_blur','idle_start','idle_end',
        'clipboard_blocked','external_url_blocked',
        'task_marked_done','form_submit'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS activity_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      desktop_session_id uuid NOT NULL REFERENCES desktop_sessions(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      kind activity_event_kind NOT NULL,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS activity_events_session_idx ON activity_events(desktop_session_id, occurred_at);
    CREATE INDEX IF NOT EXISTS activity_events_user_idx ON activity_events(user_id, occurred_at);

    CREATE TABLE IF NOT EXISTS wp_admin_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      desktop_session_id uuid NOT NULL REFERENCES desktop_sessions(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wp_admin_grants_token_uq ON wp_admin_grants(token_hash);
    CREATE INDEX IF NOT EXISTS wp_admin_grants_expires_idx ON wp_admin_grants(expires_at);

    -- Phase 4
    DO $$ BEGIN
      CREATE TYPE payment_provider AS ENUM ('stripe','square');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS integrations_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      provider text NOT NULL,
      account_id_remote text,
      access_token_ciphertext text,
      refresh_token_ciphertext text,
      expires_at timestamptz,
      scopes text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS integrations_accounts_site_provider_uq ON integrations_accounts(site_id, provider);

    CREATE TABLE IF NOT EXISTS payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
      provider payment_provider NOT NULL,
      external_id text NOT NULL,
      amount_cents text NOT NULL,
      currency text NOT NULL DEFAULT 'cad',
      status text NOT NULL,
      customer_email text,
      customer_name text,
      description text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      received_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS payments_site_received_idx ON payments(site_id, received_at);
    CREATE UNIQUE INDEX IF NOT EXISTS payments_external_uq ON payments(provider, external_id);
    CREATE INDEX IF NOT EXISTS payments_email_idx ON payments(customer_email);

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

    -- GSC per-query & per-page snapshots — powers the gainers/losers widgets
    -- on the /admin/gsc deep-dive page. Aggregate daily totals live in
    -- traffic_snapshots; these are the dimensioned breakdowns.
    CREATE TABLE IF NOT EXISTS gsc_query_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      query text NOT NULL,
      snapshot_date text NOT NULL,
      clicks integer NOT NULL DEFAULT 0,
      impressions integer NOT NULL DEFAULT 0,
      ctr double precision NOT NULL DEFAULT 0,
      position double precision NOT NULL DEFAULT 0,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS gsc_query_snapshots_uq ON gsc_query_snapshots(site_id, query, snapshot_date);
    CREATE INDEX IF NOT EXISTS gsc_query_snapshots_date_idx ON gsc_query_snapshots(snapshot_date);
    CREATE INDEX IF NOT EXISTS gsc_query_snapshots_site_date_idx ON gsc_query_snapshots(site_id, snapshot_date);

    CREATE TABLE IF NOT EXISTS gsc_page_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      page text NOT NULL,
      snapshot_date text NOT NULL,
      clicks integer NOT NULL DEFAULT 0,
      impressions integer NOT NULL DEFAULT 0,
      ctr double precision NOT NULL DEFAULT 0,
      position double precision NOT NULL DEFAULT 0,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS gsc_page_snapshots_uq ON gsc_page_snapshots(site_id, page, snapshot_date);
    CREATE INDEX IF NOT EXISTS gsc_page_snapshots_date_idx ON gsc_page_snapshots(snapshot_date);
    CREATE INDEX IF NOT EXISTS gsc_page_snapshots_site_date_idx ON gsc_page_snapshots(site_id, snapshot_date);

    -- Phase 5
    DO $$ BEGIN
      CREATE TYPE phone_number_status AS ENUM ('active','released');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS phone_numbers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      twilio_sid text NOT NULL,
      e164 text NOT NULL,
      friendly_name text,
      forward_to text NOT NULL,
      capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
      record_calls boolean NOT NULL DEFAULT true,
      transcribe_calls boolean NOT NULL DEFAULT true,
      status phone_number_status NOT NULL DEFAULT 'active',
      purchased_at timestamptz NOT NULL DEFAULT now(),
      released_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS phone_numbers_site_idx ON phone_numbers(site_id);
    CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_sid_uq ON phone_numbers(twilio_sid);
    CREATE UNIQUE INDEX IF NOT EXISTS phone_numbers_e164_uq ON phone_numbers(e164);

    DO $$ BEGIN
      CREATE TYPE call_direction AS ENUM ('inbound','outbound');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE call_status AS ENUM (
        'queued','ringing','in_progress','completed','busy','failed','no_answer','canceled'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS calls (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      phone_number_id uuid REFERENCES phone_numbers(id) ON DELETE SET NULL,
      twilio_call_sid text NOT NULL,
      direction call_direction NOT NULL,
      from_e164 text NOT NULL,
      to_e164 text NOT NULL,
      status call_status NOT NULL,
      duration_sec text,
      recording_url text,
      recording_sid text,
      transcript text,
      lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
      notes text,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS calls_site_started_idx ON calls(site_id, started_at);
    CREATE UNIQUE INDEX IF NOT EXISTS calls_sid_uq ON calls(twilio_call_sid);
    CREATE INDEX IF NOT EXISTS calls_from_idx ON calls(from_e164);

    -- Twilio config rolled into org_settings (one set per platform deployment for now)
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN twilio_account_sid text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN twilio_auth_token_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN twilio_webhook_base_url text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN stripe_oauth_client_id text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN stripe_oauth_secret_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN square_oauth_client_id text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN square_oauth_secret_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN google_oauth_client_id text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN google_oauth_secret_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- ===== v0.2: admin audit log, invites, lead contact attempts =====
    CREATE TABLE IF NOT EXISTS admin_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      actor_email text,
      kind text NOT NULL,
      target_type text NOT NULL,
      target_id text,
      summary text NOT NULL,
      before jsonb,
      after jsonb,
      ip text,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS admin_actions_actor_idx ON admin_actions(actor_id, created_at);
    CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions(target_type, target_id);
    CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON admin_actions(created_at);

    CREATE TABLE IF NOT EXISTS invite_tokens (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS invite_tokens_user_idx ON invite_tokens(user_id);
    CREATE INDEX IF NOT EXISTS invite_tokens_expires_idx ON invite_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS lead_contact_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      channel text NOT NULL,
      outcome text NOT NULL,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS lead_contact_attempts_lead_idx ON lead_contact_attempts(lead_id, created_at);

    -- Per-user notification preferences (in-app default on, email opt-in).
    CREATE TABLE IF NOT EXISTS user_prefs (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      timezone text,
      email_on_task_assigned boolean NOT NULL DEFAULT true,
      email_on_task_comment boolean NOT NULL DEFAULT true,
      email_on_lead_assigned boolean NOT NULL DEFAULT true,
      email_on_daily_digest boolean NOT NULL DEFAULT true,
      email_on_ai_flag boolean NOT NULL DEFAULT true,
      digest_webhook_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- SMTP + outbound delivery config (singleton row in org_settings).
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_host text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_port integer;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_user text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_password_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_from text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN smtp_enabled boolean NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN public_base_url text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- v0.10: Multi-provider LLM support. Gemini + Groq give the org free-tier
    -- fallback so they're not on the hook for Anthropic costs for routine
    -- parse-quote calls. Anthropic stays as the heavy-tier default for
    -- audit/research where quality matters. Provider preference resolves
    -- in order: prefer → next available → regex fallback.
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN gemini_key_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN groq_key_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN llm_provider_preference text NOT NULL DEFAULT 'gemini';
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- v0.10: Per-site overrides for the remote-loaded booking widget.
    -- The widget JS bundle reads this via /api/widget/v1/config/<slug>.
    CREATE TABLE IF NOT EXISTS widget_configs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
      language text NOT NULL DEFAULT 'en',
      chips jsonb,
      copy_overrides jsonb,
      variant text DEFAULT 'default',
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL
    );
    -- Per-site CSS override (e.g. hero background image). Injected by the
    -- widget JS at runtime. Added in v0.10 as a free-form text field so we
    -- can ship visual changes without a plugin reupload or theme edit.
    DO $$ BEGIN
      ALTER TABLE widget_configs ADD COLUMN custom_css text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- v0.2: extended task fields (transcription, etc. left as separate later)
    DO $$ BEGIN
      ALTER TABLE phone_numbers ADD COLUMN area_code text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- v0.2: integration health stamping
    DO $$ BEGIN
      ALTER TABLE integrations_accounts ADD COLUMN last_sync_at timestamptz;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE integrations_accounts ADD COLUMN last_sync_status text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE integrations_accounts ADD COLUMN last_sync_error text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- ===== Phase 6: bookings (quotes + reservations + public chat + pricing) =====
    DO $$ BEGIN
      CREATE TYPE trip_type AS ENUM ('one_way','two_way','hourly');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE quote_status AS ENUM ('pending','priced','sent','accepted','converted','expired','lost');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE reservation_status AS ENUM (
        'pending','confirmed','driver_assigned','en_route','picked_up','completed','cancelled','no_show'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE reservation_payment AS ENUM ('unpaid','deposit_received','paid_in_full','refunded');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE chat_channel AS ENUM ('chat','voice');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE chat_session_status AS ENUM ('active','completed','abandoned');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS pricing_rules (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      currency text NOT NULL DEFAULT 'cad',
      base_fare_cents text NOT NULL DEFAULT '5000',
      per_km_cents text NOT NULL DEFAULT '250',
      per_minute_cents text NOT NULL DEFAULT '100',
      minimum_fare_cents text NOT NULL DEFAULT '8000',
      hourly_rate_cents text NOT NULL DEFAULT '11000',
      two_way_discount_pct text NOT NULL DEFAULT '10',
      vehicle_multipliers jsonb NOT NULL DEFAULT '{"sedan":1.0,"suv":1.3,"stretch":1.8,"sprinter":2.0,"limo_bus":2.5}'::jsonb,
      surge_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
      gratuity_pct text NOT NULL DEFAULT '15',
      tax_pct text NOT NULL DEFAULT '5',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      customer_name text,
      customer_email text,
      customer_phone text,
      trip_type trip_type NOT NULL DEFAULT 'one_way',
      pickup_location text NOT NULL,
      pickup_lat text,
      pickup_lng text,
      dropoff_location text,
      dropoff_lat text,
      dropoff_lng text,
      pickup_at timestamptz NOT NULL,
      return_at timestamptz,
      hours text,
      passengers text,
      luggage text,
      vehicle_type text,
      flight_number text,
      message text,
      estimated_distance_km text,
      estimated_duration_min text,
      estimated_amount_cents text,
      quoted_amount_cents text,
      currency text NOT NULL DEFAULT 'cad',
      price_breakdown jsonb,
      status quote_status NOT NULL DEFAULT 'pending',
      sent_at timestamptz,
      expires_at timestamptz,
      converted_at timestamptz,
      converted_reservation_id uuid,
      source text NOT NULL DEFAULT 'form',
      chat_session_id uuid,
      source_ip text,
      user_agent text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS quotes_site_created_idx ON quotes(site_id, created_at);
    CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes(status, created_at);
    CREATE INDEX IF NOT EXISTS quotes_email_idx ON quotes(customer_email);
    CREATE INDEX IF NOT EXISTS quotes_pickup_at_idx ON quotes(pickup_at);

    CREATE TABLE IF NOT EXISTS reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
      confirmation_code text NOT NULL,
      customer_name text NOT NULL,
      customer_email text,
      customer_phone text NOT NULL,
      trip_type trip_type NOT NULL DEFAULT 'one_way',
      pickup_location text NOT NULL,
      pickup_lat text,
      pickup_lng text,
      dropoff_location text,
      dropoff_lat text,
      dropoff_lng text,
      pickup_at timestamptz NOT NULL,
      return_at timestamptz,
      hours text,
      passengers text,
      luggage text,
      vehicle_type text,
      flight_number text,
      message text,
      confirmed_amount_cents text,
      deposit_amount_cents text,
      currency text NOT NULL DEFAULT 'cad',
      price_breakdown jsonb,
      status reservation_status NOT NULL DEFAULT 'pending',
      payment_status reservation_payment NOT NULL DEFAULT 'unpaid',
      confirmed_at timestamptz,
      picked_up_at timestamptz,
      completed_at timestamptz,
      cancelled_at timestamptz,
      cancellation_reason text,
      -- driver_id / vehicle_label columns: legacy. Kept as dormant DB columns
      -- on existing databases (no DROP) but no longer populated. The CREATE
      -- TABLE here intentionally omits them — fresh DBs won't even have them.
      internal_notes text,
      source text NOT NULL DEFAULT 'form',
      chat_session_id uuid,
      source_ip text,
      user_agent text,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS reservations_site_created_idx ON reservations(site_id, created_at);
    CREATE INDEX IF NOT EXISTS reservations_status_idx ON reservations(status, pickup_at);
    CREATE INDEX IF NOT EXISTS reservations_pickup_at_idx ON reservations(pickup_at);
    CREATE UNIQUE INDEX IF NOT EXISTS reservations_code_uq ON reservations(confirmation_code);
    CREATE INDEX IF NOT EXISTS reservations_email_idx ON reservations(customer_email);
    CREATE INDEX IF NOT EXISTS reservations_quote_idx ON reservations(quote_id);

    CREATE TABLE IF NOT EXISTS public_chat_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      visitor_id text NOT NULL,
      channel chat_channel NOT NULL DEFAULT 'chat',
      status chat_session_status NOT NULL DEFAULT 'active',
      transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
      gathered jsonb NOT NULL DEFAULT '{}'::jsonb,
      derived_quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
      derived_reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
      tokens_used text,
      source_ip text,
      user_agent text,
      page_url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS public_chat_sessions_site_created_idx ON public_chat_sessions(site_id, created_at);
    CREATE INDEX IF NOT EXISTS public_chat_sessions_visitor_idx ON public_chat_sessions(visitor_id);

    -- ===== Phase 7: customer record + sharing + email log =====
    DO $$ BEGIN
      CREATE TYPE customer_status AS ENUM ('prospect','customer','vip','blacklisted');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE quote_share_kind AS ENUM ('customer','coordinator');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS customers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      email text,
      email_normalized text,
      phone text,
      name text,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      total_quotes integer NOT NULL DEFAULT 0,
      total_reservations integer NOT NULL DEFAULT 0,
      total_completed integer NOT NULL DEFAULT 0,
      total_cancelled integer NOT NULL DEFAULT 0,
      ltv_cents text NOT NULL DEFAULT '0',
      status customer_status NOT NULL DEFAULT 'prospect',
      notes text,
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS customers_site_email_uq
      ON customers(site_id, email_normalized)
      WHERE email_normalized IS NOT NULL;
    CREATE INDEX IF NOT EXISTS customers_site_phone_idx ON customers(site_id, phone);
    CREATE INDEX IF NOT EXISTS customers_site_last_seen_idx ON customers(site_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS customers_site_status_idx ON customers(site_id, status);

    -- Add customer_id + public_token columns to existing quotes / reservations.
    DO $$ BEGIN
      ALTER TABLE quotes ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE quotes ADD COLUMN public_token_hash text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS quotes_customer_idx ON quotes(customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_uq
      ON quotes(public_token_hash)
      WHERE public_token_hash IS NOT NULL;

    DO $$ BEGIN
      ALTER TABLE reservations ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations(customer_id);

    CREATE TABLE IF NOT EXISTS quote_shares (
      token_hash text PRIMARY KEY,
      quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      kind quote_share_kind NOT NULL DEFAULT 'customer',
      shared_with_email text,
      shared_by_name text,
      expires_at timestamptz,
      consumed_at timestamptz,
      viewed_at timestamptz,
      action_taken text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS quote_shares_quote_idx ON quote_shares(quote_id, kind);

    CREATE TABLE IF NOT EXISTS customer_emails (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
      quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
      reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
      kind text NOT NULL,
      to_email text NOT NULL,
      subject text NOT NULL,
      status text NOT NULL DEFAULT 'sent',
      error_message text,
      sent_at timestamptz NOT NULL DEFAULT now(),
      opened_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS customer_emails_site_idx ON customer_emails(site_id, sent_at);
    CREATE INDEX IF NOT EXISTS customer_emails_customer_idx ON customer_emails(customer_id);
    CREATE INDEX IF NOT EXISTS customer_emails_quote_idx ON customer_emails(quote_id);
    CREATE INDEX IF NOT EXISTS customer_emails_reservation_idx ON customer_emails(reservation_id);

    -- ===== Drivers / fleet roster REMOVED 2026-05-26 =====
    -- The driver concept was ripped out of the platform per the operator's
    -- request — solo dispatch, no driver app. The drivers / site_drivers /
    -- driver_sessions / driver_trip_events / driver_pin_attempts tables and
    -- the reservations.driver_id column may still exist as dormant rows in
    -- existing databases; nothing in the codebase references them anymore.
    -- We deliberately don't DROP here so historical data is preserved.

    -- ===== Phase 6.2: site knowledge base (AI assistant context) =====
    -- Free-form text that admins paste at /admin/sites/<slug>. Injected
    -- into the chat system prompt so the LLM can answer questions about
    -- service areas, fleet, policies, hours, FAQs. Nullable; AI falls back
    -- to a generic prompt when empty.
    DO $$ BEGIN
      ALTER TABLE sites ADD COLUMN knowledge_base text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- ===== Phase 6.3: network-wide AI knowledge =====
    -- Org-level KB applied to EVERY site (e.g. "we serve Dubai + all UAE emirates,
    -- here are the network-wide policies, here is the AED pricing floor").
    -- Stacked BEFORE site-specific KB in the prompt.
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN network_knowledge_base text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- ===== Phase 6.4: voice booking telemetry + session expiry =====
    -- Per-event funnel analytics for the voice flow. See schema.ts comment.
    DO $$ BEGIN
      CREATE TYPE voice_telemetry_event_kind AS ENUM (
        'mic_tapped','first_transcript','parse_complete','parse_error',
        'clarifier_shown','clarifier_resolved','chip_edited',
        'conversation_started','conversation_step','conversation_completed',
        'conversation_abandoned','rerecord_tapped','language_switched',
        'submit_clicked'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS voice_telemetry_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      visitor_id text NOT NULL,
      widget text NOT NULL,
      kind voice_telemetry_event_kind NOT NULL,
      meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      page_url text,
      user_agent text,
      source_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS voice_telemetry_site_created_idx ON voice_telemetry_events(site_id, created_at);
    CREATE INDEX IF NOT EXISTS voice_telemetry_visitor_idx     ON voice_telemetry_events(visitor_id, created_at);
    CREATE INDEX IF NOT EXISTS voice_telemetry_kind_idx        ON voice_telemetry_events(kind, created_at);

    -- Abandoned session cleanup support — expires_at lets the cleanup cron
    -- delete rows after 90 days unless they produced a derived booking.
    DO $$ BEGIN
      ALTER TABLE public_chat_sessions ADD COLUMN expires_at timestamptz;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS public_chat_sessions_expires_idx
      ON public_chat_sessions(expires_at);

    -- ============================================================
    -- Phase 6: SEO autopilot (audit + auto-fix + proposal queue)
    -- ============================================================

    DO $$ BEGIN
      CREATE TYPE seo_audit_kind AS ENUM (
        'technical','on_page','alt_text','content_quality','content_gap',
        'competitor','backlinks','accessibility','image_opt','local_seo',
        'core_web_vitals','security','visual_design','ui_ux'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE seo_audit_status AS ENUM ('queued','running','completed','failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE seo_severity AS ENUM ('info','low','medium','high','critical');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE seo_proposal_kind AS ENUM (
        'alt_text','meta_title','meta_description','schema_inject','open_graph',
        'internal_link','content_rewrite','image_compress','lazy_load',
        'aria_label','focus_visible','rel_noopener','canonical','redirect',
        'robots_txt','sitemap_ping','visual_css'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE seo_proposal_status AS ENUM (
        'pending','approved','applied','rejected','failed','stale'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS seo_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind seo_audit_kind NOT NULL,
      status seo_audit_status NOT NULL DEFAULT 'queued',
      trigger text NOT NULL DEFAULT 'cron',
      triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
      findings_count integer NOT NULL DEFAULT 0,
      proposals_count integer NOT NULL DEFAULT 0,
      auto_applied_count integer NOT NULL DEFAULT 0,
      error_message text,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_audits_site_kind_idx ON seo_audits(site_id, kind, created_at);
    CREATE INDEX IF NOT EXISTS seo_audits_status_idx ON seo_audits(status, created_at);

    CREATE TABLE IF NOT EXISTS seo_findings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_id uuid NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      severity seo_severity NOT NULL DEFAULT 'medium',
      code text NOT NULL,
      summary text NOT NULL,
      url text,
      target_type text,
      target_id text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_findings_audit_idx ON seo_findings(audit_id);
    CREATE INDEX IF NOT EXISTS seo_findings_site_code_idx ON seo_findings(site_id, code, created_at);
    CREATE INDEX IF NOT EXISTS seo_findings_site_severity_idx ON seo_findings(site_id, severity, created_at);

    CREATE TABLE IF NOT EXISTS seo_proposals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      finding_id uuid REFERENCES seo_findings(id) ON DELETE SET NULL,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind seo_proposal_kind NOT NULL,
      status seo_proposal_status NOT NULL DEFAULT 'pending',
      auto_apply boolean NOT NULL DEFAULT false,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      rationale text,
      model text NOT NULL,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      cache_read_tokens integer NOT NULL DEFAULT 0,
      applied_at timestamptz,
      applied_by uuid REFERENCES users(id) ON DELETE SET NULL,
      rejected_at timestamptz,
      rejected_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reject_reason text,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_proposals_site_status_idx ON seo_proposals(site_id, status, created_at);
    CREATE INDEX IF NOT EXISTS seo_proposals_finding_idx ON seo_proposals(finding_id);
    CREATE INDEX IF NOT EXISTS seo_proposals_inbox_idx ON seo_proposals(status, created_at);

    CREATE TABLE IF NOT EXISTS seo_actions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id uuid NOT NULL REFERENCES seo_proposals(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind seo_proposal_kind NOT NULL,
      applied_via text NOT NULL,
      plugin_response jsonb,
      success boolean NOT NULL,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_actions_site_idx ON seo_actions(site_id, created_at);
    CREATE INDEX IF NOT EXISTS seo_actions_proposal_idx ON seo_actions(proposal_id);

    CREATE TABLE IF NOT EXISTS ai_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent text NOT NULL,
      parent_type text,
      parent_id uuid,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      model text NOT NULL,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      cache_read_tokens integer NOT NULL DEFAULT 0,
      cache_write_tokens integer NOT NULL DEFAULT 0,
      cost_micro_usd integer NOT NULL DEFAULT 0,
      duration_ms integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS ai_usage_agent_date_idx ON ai_usage(agent, created_at);
    CREATE INDEX IF NOT EXISTS ai_usage_site_date_idx ON ai_usage(site_id, created_at);
    CREATE INDEX IF NOT EXISTS ai_usage_parent_idx ON ai_usage(parent_type, parent_id);

    CREATE TABLE IF NOT EXISTS seo_policies (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT true,
      capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
      brand_voice text,
      competitors text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- ============================================================
    -- Phase 1.5: Telegram + notification channel for SEO agent
    -- ============================================================
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN telegram_bot_token_ciphertext text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN telegram_webhook_secret text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE org_settings ADD COLUMN telegram_bot_username text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    DO $$ BEGIN
      ALTER TABLE user_prefs ADD COLUMN telegram_chat_id text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE user_prefs ADD COLUMN telegram_opt_in boolean NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE user_prefs ADD COLUMN notify_seo_fix_applied boolean NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE user_prefs ADD COLUMN notify_weekly_digest boolean NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE user_prefs ADD COLUMN notify_ranking_drop boolean NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS user_prefs_telegram_chat_idx ON user_prefs(telegram_chat_id);

    -- ============================================================
    -- M6 — Outbound webhook subscribers (Slack, Zapier, custom)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS webhook_subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      label text NOT NULL,
      url text NOT NULL,
      secret text,
      active boolean NOT NULL DEFAULT true,
      events text,
      last_delivered_at timestamptz,
      last_status integer,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS webhook_subscribers_active_idx ON webhook_subscribers(active);

    -- ============================================================
    -- Brand-matching: per-site widget theme
    -- ============================================================
    -- ============================================================
    -- Validation pipeline — V1 onwards
    -- ============================================================
    CREATE TABLE IF NOT EXISTS seo_validation_failures (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      kind text NOT NULL,
      validator text NOT NULL,
      errors jsonb NOT NULL DEFAULT '[]'::jsonb,
      warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
      sample_output jsonb NOT NULL DEFAULT '{}'::jsonb,
      critic_confidence integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_validation_failures_site_kind_idx ON seo_validation_failures(site_id, kind, created_at);
    CREATE INDEX IF NOT EXISTS seo_validation_failures_validator_idx ON seo_validation_failures(validator, created_at);

    -- Critic-LLM confidence + reviewer flag on proposals (V3 + V5).
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN critic_confidence integer;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN critic_issues jsonb NOT NULL DEFAULT '[]'::jsonb;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN sample_for_review boolean NOT NULL DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN review_verdict text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN review_reason text;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_proposals ADD COLUMN reviewed_at timestamptz;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    -- V6 rollback support — store before-state and rollback timestamp.
    DO $$ BEGIN
      ALTER TABLE seo_actions ADD COLUMN snapshot_before jsonb;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_actions ADD COLUMN rolled_back_at timestamptz;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE seo_actions ADD COLUMN rolled_back_by uuid REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- V4 outcome tracking — periodic GSC delta snapshots per proposal.
    CREATE TABLE IF NOT EXISTS seo_outcome_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id uuid NOT NULL REFERENCES seo_proposals(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      days_after integer NOT NULL,
      url text NOT NULL,
      clicks integer NOT NULL DEFAULT 0,
      impressions integer NOT NULL DEFAULT 0,
      ctr_milli integer NOT NULL DEFAULT 0,
      position_milli integer NOT NULL DEFAULT 0,
      captured_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS seo_outcome_snapshots_proposal_idx ON seo_outcome_snapshots(proposal_id, days_after);
    CREATE INDEX IF NOT EXISTS seo_outcome_snapshots_site_idx ON seo_outcome_snapshots(site_id, captured_at);

    -- ============================================================
    -- PDO-2 — Per-site page catalogue
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_pages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      wp_post_id integer NOT NULL,
      slug text NOT NULL,
      url text NOT NULL,
      title text NOT NULL,
      post_type text NOT NULL,
      status text NOT NULL,
      modified_at timestamptz,
      word_count integer NOT NULL DEFAULT 0,
      has_design_override boolean NOT NULL DEFAULT false,
      parent_id integer NOT NULL DEFAULT 0,
      last_synced_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_post_uq ON site_pages(site_id, wp_post_id);
    CREATE INDEX IF NOT EXISTS site_pages_site_slug_idx ON site_pages(site_id, slug);
    CREATE INDEX IF NOT EXISTS site_pages_site_type_idx ON site_pages(site_id, post_type, status);

    -- ============================================================
    -- P1 — Composite scoring system
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_scores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      score_key text NOT NULL,
      value integer NOT NULL,
      inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
      snapshot_date text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_scores_site_key_date_uq ON site_scores(site_id, score_key, snapshot_date);
    CREATE INDEX IF NOT EXISTS site_scores_site_key_idx ON site_scores(site_id, score_key, snapshot_date);

    -- ============================================================
    -- P2 — Cross-site patterns + agent-generated tasks
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_patterns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      severity text NOT NULL DEFAULT 'info',
      title text NOT NULL,
      summary text NOT NULL,
      sites_affected jsonb NOT NULL DEFAULT '[]'::jsonb,
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'open',
      detected_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      dismissed_at timestamptz,
      dismissed_by uuid REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS site_patterns_kind_status_idx ON site_patterns(kind, status);
    CREATE INDEX IF NOT EXISTS site_patterns_detected_idx ON site_patterns(detected_at);

    CREATE TABLE IF NOT EXISTS agent_tasks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      pattern_id uuid REFERENCES site_patterns(id) ON DELETE SET NULL,
      kind text NOT NULL,
      priority text NOT NULL DEFAULT 'normal',
      title text NOT NULL,
      description text NOT NULL,
      cta jsonb NOT NULL DEFAULT '{}'::jsonb,
      status text NOT NULL DEFAULT 'proposed',
      created_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      closed_by uuid REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS agent_tasks_status_idx ON agent_tasks(status, priority);
    CREATE INDEX IF NOT EXISTS agent_tasks_pattern_idx ON agent_tasks(pattern_id);

    -- ============================================================
    -- P3 — Screenshot history + visual regression
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_screenshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      url text NOT NULL,
      label text NOT NULL DEFAULT 'home',
      viewport text NOT NULL DEFAULT 'desktop',
      png_path text NOT NULL,
      width integer NOT NULL,
      height integer NOT NULL,
      sha256 text NOT NULL,
      diff_pct integer,
      status text NOT NULL DEFAULT 'ok',
      reviewed boolean NOT NULL DEFAULT false,
      reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at timestamptz,
      captured_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS site_screenshots_site_captured_idx ON site_screenshots(site_id, captured_at);
    CREATE INDEX IF NOT EXISTS site_screenshots_site_url_idx ON site_screenshots(site_id, url, viewport);
    CREATE INDEX IF NOT EXISTS site_screenshots_status_idx ON site_screenshots(status, captured_at);

    -- ============================================================
    -- P4 — Content pipeline state machine
    -- ============================================================
    CREATE TABLE IF NOT EXISTS content_briefs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      title text NOT NULL,
      target_keyword text,
      content_type text NOT NULL DEFAULT 'post',
      brief_markdown text NOT NULL DEFAULT '',
      draft_markdown text NOT NULL DEFAULT '',
      review_notes text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'brief',
      assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      due_at timestamptz,
      published_at timestamptz,
      wp_post_id integer,
      transitions jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS content_briefs_site_status_idx ON content_briefs(site_id, status);
    CREATE INDEX IF NOT EXISTS content_briefs_assignee_idx ON content_briefs(assignee_id, status);
    CREATE INDEX IF NOT EXISTS content_briefs_status_idx ON content_briefs(status, due_at);

    -- Validation gap B (2026-05-26): wire the Haiku critic into the brief
    -- flow so a vague / hallucinated brief gets a confidence score before
    -- it transitions to "drafting".
    DO $$ BEGIN
      ALTER TABLE content_briefs ADD COLUMN critic_confidence integer;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE content_briefs ADD COLUMN critic_issues jsonb NOT NULL DEFAULT '[]'::jsonb;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE content_briefs ADD COLUMN critic_reviewed_at timestamptz;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- Brief-first content engine (Phase 1): structured plan fields.
    -- Status reuses the existing column; the engine adds the values
    -- 'proposed'|'generating'|'drafted' alongside the pipeline's existing set.
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS page_type text;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS intent text;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS word_count_target jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS headline_options jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS meta_title_options jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS outline jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS schema_plan jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS ai_overview_block text;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS geo_entities jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS internal_link_targets jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS ai_overview_score integer;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS pillar_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS keyword_harvest jsonb;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS vertical text;
    ALTER TABLE content_briefs ADD COLUMN IF NOT EXISTS needs_business_facts jsonb NOT NULL DEFAULT '[]'::jsonb;

    -- ============================================================
    -- P5 — Local SEO / GBP center
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_gbp (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      business_name text,
      street text,
      city text,
      region text,
      postal_code text,
      country text DEFAULT 'CA',
      phone text,
      alt_phone text,
      public_email text,
      website text,
      gbp_profile_url text,
      service_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
      categories jsonb NOT NULL DEFAULT '[]'::jsonb,
      hours jsonb NOT NULL DEFAULT '{}'::jsonb,
      latitude text,
      longitude text,
      rating_count integer,
      rating_value text,
      notes text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS site_citations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      directory text NOT NULL,
      status text NOT NULL DEFAULT 'not_started',
      listing_url text,
      nap_match boolean,
      notes text,
      last_verified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_citations_site_dir_uq ON site_citations(site_id, directory);
    CREATE INDEX IF NOT EXISTS site_citations_status_idx ON site_citations(status);

    -- ============================================================
    -- P6 — Prompt library + SOPs
    -- ============================================================
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slot text NOT NULL,
      label text NOT NULL,
      description text,
      body text NOT NULL,
      is_active boolean NOT NULL DEFAULT false,
      version integer NOT NULL DEFAULT 1,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS prompt_templates_slot_idx ON prompt_templates(slot, is_active);
    CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_slot_version_uq ON prompt_templates(slot, version);

    CREATE TABLE IF NOT EXISTS sops (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title text NOT NULL,
      slug text NOT NULL,
      category text NOT NULL DEFAULT 'general',
      body text NOT NULL DEFAULT '',
      tags jsonb NOT NULL DEFAULT '[]'::jsonb,
      pinned boolean NOT NULL DEFAULT false,
      visible_to_team boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sops_slug_uq ON sops(slug);
    CREATE INDEX IF NOT EXISTS sops_category_idx ON sops(category);
    CREATE INDEX IF NOT EXISTS sops_pinned_idx ON sops(pinned, updated_at);

    -- ============================================================
    -- Phase A — Claude Code subagent jobs queue
    -- ============================================================
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
    CREATE INDEX IF NOT EXISTS claude_jobs_status_idx ON claude_jobs(status, priority, created_at);
    CREATE INDEX IF NOT EXISTS claude_jobs_site_idx ON claude_jobs(site_id, created_at);
    CREATE INDEX IF NOT EXISTS claude_jobs_kind_idx ON claude_jobs(kind, status);

    -- Routing preference — 'mac' jobs prefer Claude Code worker; server
    -- executor only claims after 5 min stale (avoids API cost when sub
    -- could have covered it).
    ALTER TABLE claude_jobs ADD COLUMN IF NOT EXISTS prefer_worker text NOT NULL DEFAULT 'any';
    CREATE INDEX IF NOT EXISTS claude_jobs_prefer_worker_idx ON claude_jobs(prefer_worker, status, created_at);

    -- Where the job came from: manual | scheduled | scout | cloud-seo | auto | system.
    -- Used for filtering the Agent Jobs vs Scout Team views and rendering trigger
    -- badges. Backfill defaults to 'system' so old rows show as maintenance jobs.
    DO $$ BEGIN
      ALTER TABLE claude_jobs ADD COLUMN trigger_source text NOT NULL DEFAULT 'system';
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS claude_jobs_trigger_source_idx ON claude_jobs(trigger_source, status, created_at);

    -- ============================================================
    -- Build-a-site workspace
    -- ============================================================
    CREATE TABLE IF NOT EXISTS site_build_projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL,
      business_name text NOT NULL,
      domain text,
      city text,
      region text,
      niche text,
      services jsonb NOT NULL DEFAULT '[]'::jsonb,
      content_source text NOT NULL DEFAULT 'agent_draft',
      content_notes text,
      design_mode text NOT NULL DEFAULT 'global_research',
      inspiration_urls text,
      phase text NOT NULL DEFAULT 'brief',
      published_site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      research jsonb,
      design_dna jsonb,
      sitemap jsonb,
      quality_report jsonb,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_build_projects_slug_uq ON site_build_projects(slug);
    CREATE INDEX IF NOT EXISTS site_build_projects_phase_idx ON site_build_projects(phase, updated_at);

    CREATE TABLE IF NOT EXISTS site_build_pages (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES site_build_projects(id) ON DELETE CASCADE,
      page_slug text NOT NULL,
      page_type text NOT NULL,
      title text NOT NULL,
      h1 text,
      meta_title text,
      meta_description text,
      body_markdown text,
      body_html text,
      schema_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      ai_overview_score integer,
      seo_score integer,
      status text NOT NULL DEFAULT 'pending',
      job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      wp_post_id integer,
      published_at timestamptz,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS site_build_pages_project_idx ON site_build_pages(project_id, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS site_build_pages_project_slug_uq ON site_build_pages(project_id, page_slug);

    -- Build research screenshots — captures of competitor sites the agent studied.
    -- One row per (project, hostname). Files live on disk under SCREENSHOT_STORAGE_PATH/build-research/.
    CREATE TABLE IF NOT EXISTS build_research_screenshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES site_build_projects(id) ON DELETE CASCADE,
      url text NOT NULL,
      hostname text NOT NULL,
      file_path text,
      bytes integer,
      status text NOT NULL DEFAULT 'pending',
      error text,
      captured_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS build_research_screenshots_project_idx ON build_research_screenshots(project_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS build_research_screenshots_project_host_uq ON build_research_screenshots(project_id, hostname);

    -- Business niche / industry the operator typed — drives keyword + content + design.
    ALTER TABLE site_build_projects ADD COLUMN IF NOT EXISTS niche text;

    -- Real-world facts pasted by the operator — baked into page-generate prompts.
    ALTER TABLE site_build_projects ADD COLUMN IF NOT EXISTS business_facts jsonb;

    -- Site Builder Studio — per-page-type locked design template + palette override.
    ALTER TABLE site_build_projects ADD COLUMN IF NOT EXISTS locked_designs jsonb;
    ALTER TABLE site_build_projects ADD COLUMN IF NOT EXISTS studio_palette jsonb;
    ALTER TABLE site_build_projects ADD COLUMN IF NOT EXISTS global_sections jsonb;
    -- Site Builder Studio — ordered, per-page section layout (StudioSection[]).
    ALTER TABLE site_build_pages ADD COLUMN IF NOT EXISTS sections jsonb;

    -- Staged publish queue — enforces a cadence cap (8 pages / 7 days / project)
    -- to avoid Google's "scaled content abuse" classifier.
    CREATE TABLE IF NOT EXISTS publish_schedule (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES site_build_pages(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES site_build_projects(id) ON DELETE CASCADE,
      scheduled_at timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'scheduled',
      gauntlet_report jsonb,
      published_at timestamptz,
      wp_post_id integer,
      error text,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS publish_schedule_status_idx ON publish_schedule(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS publish_schedule_project_idx ON publish_schedule(project_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS publish_schedule_page_uq ON publish_schedule(page_id);

    -- Post-publish performance snapshots — pulled from GSC at 14/30/60/90 days.
    CREATE TABLE IF NOT EXISTS build_page_performance_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      page_id uuid NOT NULL REFERENCES site_build_pages(id) ON DELETE CASCADE,
      days_since_publish integer NOT NULL,
      impressions integer NOT NULL DEFAULT 0,
      clicks integer NOT NULL DEFAULT 0,
      avg_position integer,
      verdict text NOT NULL DEFAULT 'ok',
      notes text,
      captured_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS build_page_perf_page_idx ON build_page_performance_snapshots(page_id, days_since_publish);
    CREATE UNIQUE INDEX IF NOT EXISTS build_page_perf_page_day_uq ON build_page_performance_snapshots(page_id, days_since_publish);

    -- Worker shared secret for /api/claude-jobs auth.
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS claude_worker_secret text;

    -- Industry vertical specialization (defaults to cleaning services).
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT 'cleaning_services';

    -- ============================================================
    -- A2 — Design QA Suite
    -- ============================================================
    CREATE TABLE IF NOT EXISTS qa_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scope text NOT NULL,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      scope_ref text,
      status text NOT NULL DEFAULT 'pending',
      pass_count integer NOT NULL DEFAULT 0,
      warn_count integer NOT NULL DEFAULT 0,
      fail_count integer NOT NULL DEFAULT 0,
      summary text,
      triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
      trigger_kind text NOT NULL DEFAULT 'manual',
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS qa_runs_site_idx ON qa_runs(site_id, created_at);
    CREATE INDEX IF NOT EXISTS qa_runs_status_idx ON qa_runs(status, created_at);

    CREATE TABLE IF NOT EXISTS qa_checks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id uuid NOT NULL REFERENCES qa_runs(id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      url text NOT NULL,
      viewport text NOT NULL,
      check_kind text NOT NULL,
      status text NOT NULL,
      severity text,
      message text,
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      duration_ms integer,
      suppressed boolean NOT NULL DEFAULT false,
      suppressed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS qa_checks_run_idx ON qa_checks(run_id, status);
    CREATE INDEX IF NOT EXISTS qa_checks_site_idx ON qa_checks(site_id, check_kind, created_at);
    CREATE INDEX IF NOT EXISTS qa_checks_kind_status_idx ON qa_checks(check_kind, status, created_at);

    CREATE TABLE IF NOT EXISTS site_themes (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      primary_color text NOT NULL,
      primary_text text NOT NULL,
      surface text NOT NULL,
      surface_text text NOT NULL,
      accent text NOT NULL,
      border text NOT NULL,
      font_family_body text NOT NULL,
      font_family_heading text NOT NULL,
      border_radius_px integer NOT NULL DEFAULT 8,
      mode text NOT NULL DEFAULT 'light',
      source text NOT NULL DEFAULT 'fallback_default',
      applied_at timestamptz,
      apply_error text,
      extraction_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- (driver_sessions / driver_trip_events / driver_pin_attempts /
    -- drivers.pin_hash etc. were removed 2026-05-26 — see comment above
    -- where the drivers DDL used to live.)

    -- ============================================================
    -- P2 — Keyword bank (cannibalization prevention + status tracking)
    -- One row per (project, primary_keyword). Status workflow:
    --   queued → in_progress → covered → (optionally) refresh_needed → in_progress → covered.
    -- Pre-generation lookup: "is this keyword already covered?" prevents
    -- accidental duplicate pages on the same SERP query.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS keyword_bank (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES site_build_projects(id) ON DELETE CASCADE,
      keyword text NOT NULL,
      -- 'queued' | 'in_progress' | 'covered' | 'refresh_needed' | 'dropped'
      status text NOT NULL DEFAULT 'queued',
      -- 'primary' (head term for a page) | 'secondary' (LSI / related)
      role text NOT NULL DEFAULT 'primary',
      -- Once the keyword is targeted by a page, link it. NULL while queued.
      page_id uuid REFERENCES site_build_pages(id) ON DELETE SET NULL,
      -- Validation snapshot (from build:keyword_research)
      volume_tier text,
      volume_estimate text,
      difficulty text,
      intent text,
      has_local_pack boolean,
      top_competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- Fan-out cluster — related H2 questions that should appear AS SECTIONS
      -- inside the page targeting this primary keyword. Prevents the related
      -- subtopics from becoming separate cannibalising pages.
      fan_out_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
      recommendation text,
      rationale text,
      -- Provenance — which build:keyword_research job produced this row.
      source_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      -- Refresh tracking — when GSC says this page is de-indexed or under-ranking.
      refresh_reason text,
      refresh_flagged_at timestamptz,
      last_serp_check_at timestamptz,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS keyword_bank_project_status_idx ON keyword_bank(project_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS keyword_bank_page_idx ON keyword_bank(page_id);
    CREATE UNIQUE INDEX IF NOT EXISTS keyword_bank_project_keyword_uq ON keyword_bank(project_id, lower(keyword));

    -- ============================================================
    -- P4 — Content refresh recommendations
    -- Populated by the weekly refresh recommender that polls GSC for:
    --   - URLs with "Crawled, currently not indexed" status
    --   - URLs with impressions but average position > 10
    --   - URLs older than 12 months with declining click trend
    -- Each row maps a page that needs rewriting + the reason + the priority.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS content_refresh_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid NOT NULL REFERENCES site_build_projects(id) ON DELETE CASCADE,
      page_id uuid NOT NULL REFERENCES site_build_pages(id) ON DELETE CASCADE,
      -- 'deindexed' | 'low_ranking' | 'declining_traffic' | 'outdated_facts' | 'manual'
      reason text NOT NULL,
      -- Priority 1-5 (1 = fix this week, 5 = nice-to-have)
      priority integer NOT NULL DEFAULT 3,
      -- Snapshot of GSC data at time of flag — for the operator + critic to see context.
      gsc_snapshot jsonb,
      -- 'pending' | 'queued' | 'in_progress' | 'completed' | 'skipped'
      status text NOT NULL DEFAULT 'pending',
      refresh_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      flagged_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS content_refresh_project_idx ON content_refresh_queue(project_id, status, priority);
    CREATE INDEX IF NOT EXISTS content_refresh_page_idx ON content_refresh_queue(page_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS content_refresh_pending_page_uq ON content_refresh_queue(page_id) WHERE status IN ('pending', 'queued', 'in_progress');

    -- ============================================================
    -- P9 — Scheduled workflows
    -- Operator-configured recurring jobs per project. The runner cron
    -- (Phase 1.5c) checks this table every minute, fires any due rows
    -- by enqueuing the configured claude_jobs kind with the stored input.
    --
    -- next_fire_at is computed from cron_expr after each successful run.
    -- enabled=false pauses the workflow without deleting it.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS scheduled_workflows (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id uuid REFERENCES site_build_projects(id) ON DELETE CASCADE,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      -- Human label for the dashboard.
      name text NOT NULL,
      -- Which job kind to fire. Must be in JOB_TEMPLATES (claude-job-templates.ts):
      -- 'build:page_generate' | 'build:content_refresh' | 'build:refresh_recommender'
      -- | 'build:keyword_research' | 'site_audit' | etc.
      job_kind text NOT NULL,
      -- Static input payload — merged with runtime context at fire time.
      job_input jsonb NOT NULL DEFAULT '{}'::jsonb,
      -- Cron expression (5-field standard, e.g. '0 9 * * 1' = Monday 9am).
      cron_expr text NOT NULL,
      -- Timezone for cron interpretation. Default Asia/Dubai.
      timezone text NOT NULL DEFAULT 'Asia/Dubai',
      -- Mac or server. Default 'mac' to keep API spend down.
      prefer_worker text NOT NULL DEFAULT 'mac',
      enabled boolean NOT NULL DEFAULT true,
      next_fire_at timestamptz,
      last_fire_at timestamptz,
      last_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      fire_count integer NOT NULL DEFAULT 0,
      failure_count integer NOT NULL DEFAULT 0,
      last_error text,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      -- Constraint: must scope to either project_id OR site_id (or both for cross-context).
      CHECK (project_id IS NOT NULL OR site_id IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS scheduled_workflows_next_fire_idx ON scheduled_workflows(enabled, next_fire_at) WHERE enabled = true;
    CREATE INDEX IF NOT EXISTS scheduled_workflows_project_idx ON scheduled_workflows(project_id, enabled);
    CREATE INDEX IF NOT EXISTS scheduled_workflows_site_idx ON scheduled_workflows(site_id, enabled);

    -- ───────────────────────────────────────────────────────────────
    -- Local SEO Rubric Audits
    --
    -- Per-page audit records against Wali's three-class doctrine:
    --   1. Site structure (homepage/service/location sections)
    --   2. On-page checklist (URL, meta, headings, schema, etc.)
    --   3. Semantic strategy (entity coverage, anti-doorway)
    --
    -- A row can scope to a LIVE page (site_pages) OR a pre-deploy build
    -- page (site_build_pages). The runner script flags which source via
    -- the source column.
    -- ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS local_seo_rubric_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Scope: ONE of (site_id + page_id) OR (project_id + build_page_id)
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      page_id uuid REFERENCES site_pages(id) ON DELETE CASCADE,
      project_id uuid REFERENCES site_build_projects(id) ON DELETE CASCADE,
      build_page_id uuid REFERENCES site_build_pages(id) ON DELETE CASCADE,
      -- Audit identity
      source text NOT NULL CHECK (source IN ('live', 'build')),
      url text NOT NULL,
      page_type text NOT NULL CHECK (page_type IN ('homepage','service','location','blog','about','contact','other')),
      primary_keyword text,
      city text,
      -- Scores (0-100). Overall is the weighted aggregate.
      overall_score integer NOT NULL,
      on_page_score integer NOT NULL DEFAULT 0,
      structure_score integer NOT NULL DEFAULT 0,
      schema_score integer NOT NULL DEFAULT 0,
      internal_linking_score integer NOT NULL DEFAULT 0,
      semantic_score integer NOT NULL DEFAULT 0,
      anti_doorway_score integer NOT NULL DEFAULT 0,
      -- Counts for quick site rollups
      findings_blocking integer NOT NULL DEFAULT 0,
      findings_high integer NOT NULL DEFAULT 0,
      findings_medium integer NOT NULL DEFAULT 0,
      findings_low integer NOT NULL DEFAULT 0,
      -- Full finding list (RubricFinding[])
      findings jsonb NOT NULL DEFAULT '[]'::jsonb,
      -- Structured evidence the checker extracted (headings, schema types, etc.)
      evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
      -- Whether the LLM judge ran (and what verdicts it returned)
      judge_ran boolean NOT NULL DEFAULT false,
      judge_verdicts jsonb NOT NULL DEFAULT '[]'::jsonb,
      judge_tokens_input integer,
      judge_tokens_output integer,
      -- Provenance
      audit_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS local_seo_rubric_audits_site_idx ON local_seo_rubric_audits(site_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS local_seo_rubric_audits_page_idx ON local_seo_rubric_audits(page_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS local_seo_rubric_audits_project_idx ON local_seo_rubric_audits(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS local_seo_rubric_audits_build_page_idx ON local_seo_rubric_audits(build_page_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS local_seo_rubric_audits_score_idx ON local_seo_rubric_audits(site_id, overall_score);

    -- ============================================================
    -- PHOTO STUDIO  (Nano Banana / Gemini 2.5 Flash Image)  P1
    -- ============================================================

    CREATE TABLE IF NOT EXISTS photo_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slot_key text NOT NULL,
      name text NOT NULL,
      description text,
      prompt_skeleton text NOT NULL,
      style_hint text,
      aspect_ratio text NOT NULL DEFAULT '16:9',
      model text NOT NULL DEFAULT 'gemini-2.5-flash-image',
      auto_trigger boolean NOT NULL DEFAULT true,
      default_variants integer NOT NULL DEFAULT 2,
      is_default boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS photo_templates_slot_idx ON photo_templates(slot_key, is_active);
    CREATE INDEX IF NOT EXISTS photo_templates_active_idx ON photo_templates(is_active, auto_trigger);

    CREATE TABLE IF NOT EXISTS generated_images (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      page_id uuid REFERENCES site_pages(id) ON DELETE SET NULL,
      build_page_id uuid,
      slot_key text NOT NULL,
      template_id uuid REFERENCES photo_templates(id) ON DELETE SET NULL,
      prompt text NOT NULL,
      variant_index integer NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'generated',
      storage_path text NOT NULL,
      public_url text NOT NULL,
      width integer,
      height integer,
      bytes integer,
      wp_media_id integer,
      wp_media_url text,
      model text NOT NULL DEFAULT 'gemini-2.5-flash-image',
      cost_usd_micros integer NOT NULL DEFAULT 0,
      reference_image_url text,
      job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
      error text,
      generated_at timestamptz NOT NULL DEFAULT now(),
      approved_at timestamptz,
      published_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS generated_images_site_idx ON generated_images(site_id, generated_at DESC);
    CREATE INDEX IF NOT EXISTS generated_images_site_status_idx ON generated_images(site_id, status, generated_at DESC);
    CREATE INDEX IF NOT EXISTS generated_images_page_idx ON generated_images(page_id, status);
    CREATE INDEX IF NOT EXISTS generated_images_build_page_idx ON generated_images(build_page_id, status);
    CREATE INDEX IF NOT EXISTS generated_images_slot_idx ON generated_images(slot_key, status);
    CREATE UNIQUE INDEX IF NOT EXISTS generated_images_job_variant_uq
      ON generated_images(job_id, variant_index) WHERE job_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS photo_quota_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      day text NOT NULL,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      images_generated integer NOT NULL DEFAULT 0,
      images_failed integer NOT NULL DEFAULT 0,
      credits_used integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    -- (day, site_id) tuple is unique. NULL site_id = global daily counter.
    -- Note: Postgres treats NULLs as distinct in UNIQUE, so global rows would
    -- duplicate. We enforce uniqueness with a partial index for the global row.
    CREATE UNIQUE INDEX IF NOT EXISTS photo_quota_per_site_uq
      ON photo_quota_usage(day, site_id) WHERE site_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS photo_quota_global_uq
      ON photo_quota_usage(day) WHERE site_id IS NULL;
    CREATE INDEX IF NOT EXISTS photo_quota_day_idx ON photo_quota_usage(day);

    CREATE TABLE IF NOT EXISTS photo_style_anchors (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      storage_path text NOT NULL,
      public_url text NOT NULL,
      label text,
      notes text,
      uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS photo_style_anchors_site_uq ON photo_style_anchors(site_id);

    -- G1: Network-health audit persistence (2026-06-11) ─────────────────
    CREATE TABLE IF NOT EXISTS site_health_audits (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      run_date text NOT NULL,
      composite_score integer,
      structure_score integer,
      design_score integer,
      onpage_score integer,
      indexing_score integer,
      raw jsonb,
      status text NOT NULL DEFAULT 'ok',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_health_audits_site_run_uq ON site_health_audits(site_id, run_date);
    CREATE INDEX IF NOT EXISTS site_health_audits_site_recent_idx ON site_health_audits(site_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS page_health_issues (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_id uuid NOT NULL REFERENCES site_health_audits(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      page_url text,
      page_type text,
      dimension text NOT NULL,
      issue_key text NOT NULL,
      severity text NOT NULL DEFAULT 'amber',
      label text NOT NULL,
      detail jsonb,
      fix_proposal_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS page_health_issues_audit_idx ON page_health_issues(audit_id);
    CREATE INDEX IF NOT EXISTS page_health_issues_site_severity_idx ON page_health_issues(site_id, severity, dimension);
    CREATE INDEX IF NOT EXISTS page_health_issues_issue_key_idx ON page_health_issues(issue_key);

    CREATE TABLE IF NOT EXISTS health_dimension_scores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      week_start text NOT NULL,
      composite integer,
      structure integer,
      design integer,
      onpage integer,
      indexing integer,
      red_count integer NOT NULL DEFAULT 0,
      amber_count integer NOT NULL DEFAULT 0,
      composite_delta integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS health_dim_scores_site_week_uq ON health_dimension_scores(site_id, week_start);

    -- G5: Fix queue + auto-approve rules (2026-06-11) ─────────────────
    CREATE TABLE IF NOT EXISTS fix_proposals (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      issue_id uuid REFERENCES page_health_issues(id) ON DELETE SET NULL,
      fix_kind text NOT NULL,
      input jsonb NOT NULL,
      label text NOT NULL,
      preview text,
      priority text NOT NULL DEFAULT 'normal',
      status text NOT NULL DEFAULT 'pending',
      job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
      decided_at timestamptz,
      auto_approved_by_rule text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS fix_proposals_site_status_idx ON fix_proposals(site_id, status);
    CREATE INDEX IF NOT EXISTS fix_proposals_kind_status_idx ON fix_proposals(fix_kind, status);

    CREATE TABLE IF NOT EXISTS fix_auto_approve_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fix_kind text NOT NULL,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      enabled boolean NOT NULL DEFAULT true,
      min_trust integer NOT NULL DEFAULT 0,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS fix_auto_approve_kind_site_uq ON fix_auto_approve_rules(fix_kind, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid));

    -- G7: New-site bootstrap pipeline (2026-06-11) ────────────────────
    CREATE TABLE IF NOT EXISTS new_site_builds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      domain text NOT NULL,
      business_name text NOT NULL,
      city text NOT NULL,
      region text NOT NULL DEFAULT 'United Arab Emirates',
      vertical text NOT NULL,
      slug text NOT NULL,
      state text NOT NULL DEFAULT 'brief',
      blocker text,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      brief jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS new_site_builds_domain_uq ON new_site_builds(domain);
    CREATE INDEX IF NOT EXISTS new_site_builds_state_idx ON new_site_builds(state, created_at);

    -- G8: Weekly keyword rank tracking + refresh loop (2026-06-11) ─────
    CREATE TABLE IF NOT EXISTS tracked_keywords (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      keyword text NOT NULL,
      target_url text,
      location text NOT NULL DEFAULT 'Canada',
      device text NOT NULL DEFAULT 'desktop',
      source text NOT NULL DEFAULT 'auto',  -- 'gsc' | 'scrape' | 'auto'
      added_at timestamptz NOT NULL DEFAULT now(),
      last_checked_at timestamptz,
      last_position numeric,
      weeks_off_p1 int NOT NULL DEFAULT 0,
      weeks_off_p2 int NOT NULL DEFAULT 0,
      weeks_off_p3 int NOT NULL DEFAULT 0,
      refresh_flagged_at timestamptz,
      refresh_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      enabled boolean NOT NULL DEFAULT true
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tracked_keywords_site_kw_loc_dev_uq
      ON tracked_keywords(site_id, lower(keyword), location, device);
    CREATE INDEX IF NOT EXISTS tracked_keywords_site_idx ON tracked_keywords(site_id, enabled);

    CREATE TABLE IF NOT EXISTS keyword_rank_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tracked_keyword_id uuid NOT NULL REFERENCES tracked_keywords(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      captured_at timestamptz NOT NULL DEFAULT now(),
      week_of date NOT NULL,
      position numeric,
      url text,
      source text NOT NULL,    -- 'gsc' | 'scrape'
      raw jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS keyword_rank_snapshots_tk_week_uq
      ON keyword_rank_snapshots(tracked_keyword_id, week_of);
    CREATE INDEX IF NOT EXISTS keyword_rank_snapshots_site_week_idx
      ON keyword_rank_snapshots(site_id, week_of);

    -- G9: GBP + off-site SEO (2026-06-11) ─────────────────────────────
    CREATE TABLE IF NOT EXISTS gbp_posts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind text NOT NULL,                  -- 'update' | 'event' | 'offer'
      title text,
      body text NOT NULL,
      image_url text,
      cta_label text,
      cta_url text,
      scheduled_for timestamptz,
      posted_at timestamptz,
      posted_url text,
      status text NOT NULL DEFAULT 'draft',  -- 'draft' | 'queued' | 'posted' | 'failed' | 'cancelled'
      generated_by text,                    -- 'ai' | 'manual'
      job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS gbp_posts_site_status_idx ON gbp_posts(site_id, status, scheduled_for);

    CREATE TABLE IF NOT EXISTS gbp_qa (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      question text NOT NULL,
      answer text,
      status text NOT NULL DEFAULT 'suggested', -- 'suggested' | 'approved' | 'posted' | 'rejected'
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS gbp_qa_site_status_idx ON gbp_qa(site_id, status);

    CREATE TABLE IF NOT EXISTS citation_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      directory text NOT NULL,   -- 'yelp' | 'yellowpages' | 'bbb' | 'foursquare' | ...
      nap_state text NOT NULL DEFAULT 'unknown', -- 'not_listed' | 'inconsistent' | 'listed' | 'unknown'
      listing_url text,
      notes text,
      action_taken text,
      checked_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS citation_queue_site_dir_uq ON citation_queue(site_id, directory);

    -- WordPress credential vault — one row per (site, kind). Paste once,
    -- agent reuses forever via wp-rest-client.ts. Application Passwords
    -- are the default kind (native WP, revocable from wp-admin without
    -- changing the real account password). FK to sites; on cascade delete
    -- the secret dies with the site.
    CREATE TABLE IF NOT EXISTS site_credentials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      kind text NOT NULL DEFAULT 'wp_app_password',  -- 'wp_app_password' | 'wp_user_pass' | 'cpanel' | 'ssh' | …
      username text NOT NULL,
      secret_ciphertext text NOT NULL,               -- AES-256-GCM via lib/crypto.ts
      verified_at timestamptz,                       -- last successful /wp/v2/users/me
      verify_status text,                            -- 'ok' | 'unauthorized' | 'forbidden' | 'unreachable' | 'error'
      verify_error text,                             -- last error message (truncated)
      revoked_at timestamptz,
      revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS site_credentials_site_kind_uq
      ON site_credentials(site_id, kind)
      WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS site_credentials_site_idx ON site_credentials(site_id);

    -- Composite-drop dismissals — operator silences a site's drop alerts
    -- until the composite recovers above the prior peak or N weeks elapse.
    CREATE TABLE IF NOT EXISTS push_drop_dismissals (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      dismissed_at timestamptz NOT NULL DEFAULT now(),
      dismissed_until_score int,   -- re-fire if composite drops below this
      dismissed_by uuid REFERENCES users(id) ON DELETE SET NULL,
      note text
    );

    -- Phase 3: Push notification dedup log (2026-06-11) ────────────────
    CREATE TABLE IF NOT EXISTS push_sent (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,         -- 'high_fix' | 'stuck_build' | 'stale_lead' | 'composite_drop'
      ref_id text NOT NULL,       -- proposal id, build id, lead id, or site id
      fired_on date NOT NULL,     -- one push per (kind, ref_id, day)
      sent_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS push_sent_kind_ref_day_uq ON push_sent(kind, ref_id, fired_on);

    -- G10: Cost guards + 100-site scale tuning (2026-06-11) ────────────
    CREATE TABLE IF NOT EXISTS site_budgets (
      site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      weekly_fix_cap int NOT NULL DEFAULT 20,
      weekly_gbp_post_cap int NOT NULL DEFAULT 2,
      auto_approve_enabled boolean NOT NULL DEFAULT true,
      priority_lane boolean NOT NULL DEFAULT false,
      composite_low_threshold int NOT NULL DEFAULT 70,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- Monitoring & Alerting — Phase 1 (2026-06-12) ─────────────────────
    DO $$ BEGIN
      CREATE TYPE alert_severity AS ENUM ('info','warn','error','critical');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE alert_status AS ENUM ('open','acknowledged','snoozed','resolved','dismissed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS alerts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      severity alert_severity NOT NULL DEFAULT 'warn',
      status alert_status NOT NULL DEFAULT 'open',
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      fingerprint text NOT NULL,
      title text NOT NULL,
      body text,
      enabled boolean NOT NULL DEFAULT true,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      first_seen_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      occurrences int NOT NULL DEFAULT 1,
      acknowledged_at timestamptz,
      acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
      snoozed_until timestamptz,
      resolved_at timestamptz,
      dismissed_at timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS alerts_fingerprint_uq ON alerts(fingerprint);
    CREATE INDEX IF NOT EXISTS alerts_status_kind_idx ON alerts(status, kind);
    CREATE INDEX IF NOT EXISTS alerts_site_idx ON alerts(site_id);

    -- Per-instance mute switch for the Alert Manager UI toggle.
    DO $$ BEGIN
      ALTER TABLE alerts ADD COLUMN enabled boolean NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN null; END $$;

    -- Analytics dashboard widgets. One row per widget instance on
    -- /admin/analytics. src/lib/analytics-widget-catalog.ts drives the
    -- kind column.
    CREATE TABLE IF NOT EXISTS analytics_widgets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      label text NOT NULL,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      position int NOT NULL DEFAULT 100,
      enabled boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS analytics_widgets_pos_idx ON analytics_widgets(position);

    CREATE TABLE IF NOT EXISTS alert_check_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kinds text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      had_error boolean NOT NULL DEFAULT false,
      summary jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS alert_check_runs_started_idx ON alert_check_runs(started_at DESC);

    -- Admin-configurable alert rules (2026-06-24) ──────────────────────
    CREATE TABLE IF NOT EXISTS alert_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      kind text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      severity_override alert_severity,
      notify_email boolean NOT NULL DEFAULT false,
      notify_in_app boolean NOT NULL DEFAULT true,
      notify_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS alert_rules_kind_idx ON alert_rules(kind);
    CREATE INDEX IF NOT EXISTS alert_rules_site_idx ON alert_rules(site_id);

    -- Audit log — Phase 2 (2026-06-12) ─────────────────────────────────
    CREATE TABLE IF NOT EXISTS audit_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      summary text NOT NULL,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      source text NOT NULL DEFAULT 'admin_ui',
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      before_state jsonb,
      after_state jsonb,
      related_kind text,
      related_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_log_site_created_idx ON audit_log(site_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_log_kind_created_idx ON audit_log(kind, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);

    -- CWV snapshots — Phase 5 (2026-06-12) ─────────────────────────────
    CREATE TABLE IF NOT EXISTS cwv_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      snapshot_date text NOT NULL,
      form_factor text NOT NULL,
      lcp_p75 int,
      inp_p75 int,
      cls_p75_x1000 int,
      fcp_p75 int,
      ttfb_p75 int,
      source text NOT NULL,
      raw jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cwv_snapshots_uq ON cwv_snapshots(site_id, snapshot_date, form_factor);
    CREATE INDEX IF NOT EXISTS cwv_snapshots_site_date_idx ON cwv_snapshots(site_id, snapshot_date);

    -- PSI lab cache (2026-06-25) — stops /admin/cwv + Tech Watchdog from
    -- re-hitting PageSpeed Insights on every page load (root cause of 429s).
    CREATE TABLE IF NOT EXISTS psi_lab_cache (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      url text NOT NULL,
      strategy text NOT NULL,
      lcp_ms int,
      cls_raw_x1000 int,
      tbt_ms int,
      performance int,
      error text,
      fetched_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS psi_lab_cache_uq ON psi_lab_cache(url, strategy);

    -- Phase 3 — SEO outcome tracking (2026-06-12) ──────────────────────
    CREATE TABLE IF NOT EXISTS tracked_keywords_ext (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      keyword text NOT NULL,
      location_code int DEFAULT 2124,
      language_code text DEFAULT 'en',
      device_type text DEFAULT 'desktop',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tracked_keywords_ext_uq ON tracked_keywords_ext(site_id, keyword, location_code, device_type);

    CREATE TABLE IF NOT EXISTS serp_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tracked_keyword_id uuid NOT NULL REFERENCES tracked_keywords_ext(id) ON DELETE CASCADE,
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      snapshot_date text NOT NULL,
      rank int,
      serp_top10 jsonb,
      search_volume int,
      source text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS serp_snapshots_uq ON serp_snapshots(tracked_keyword_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS serp_snapshots_site_date_idx ON serp_snapshots(site_id, snapshot_date DESC);

    CREATE TABLE IF NOT EXISTS keyword_research_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      seed text NOT NULL,
      database text NOT NULL DEFAULT 'ca',
      result_count int NOT NULL DEFAULT 0,
      results jsonb NOT NULL DEFAULT '[]'::jsonb,
      clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS kw_research_sessions_created_idx ON keyword_research_sessions(created_at);

    CREATE TABLE IF NOT EXISTS keyword_lists (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      description text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS kw_lists_name_idx ON keyword_lists(name);

    CREATE TABLE IF NOT EXISTS keyword_list_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      list_id uuid NOT NULL REFERENCES keyword_lists(id) ON DELETE CASCADE,
      keyword text NOT NULL,
      volume int,
      difficulty int,
      cpc text,
      intent text,
      added_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS kw_list_items_list_idx ON keyword_list_items(list_id);

    CREATE TABLE IF NOT EXISTS backlinks_snapshots (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      snapshot_date text NOT NULL,
      total_backlinks int NOT NULL,
      total_ref_domains int NOT NULL,
      new_backlinks int NOT NULL DEFAULT 0,
      lost_backlinks int NOT NULL DEFAULT 0,
      domain_rank int,
      sample jsonb,
      source text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS backlinks_snapshots_uq ON backlinks_snapshots(site_id, snapshot_date);
    CREATE INDEX IF NOT EXISTS backlinks_snapshots_site_idx ON backlinks_snapshots(site_id, snapshot_date DESC);

    CREATE TABLE IF NOT EXISTS competitor_gaps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      snapshot_date text NOT NULL,
      competitor_domain text NOT NULL,
      keyword text NOT NULL,
      our_rank int,
      their_rank int NOT NULL,
      search_volume int,
      est_traffic_potential int,
      source text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS competitor_gaps_site_date_idx ON competitor_gaps(site_id, snapshot_date DESC);
    CREATE INDEX IF NOT EXISTS competitor_gaps_keyword_idx ON competitor_gaps(site_id, keyword);

    -- Indexing automation (2026-06-12) ────────────────────────────────
    CREATE TABLE IF NOT EXISTS indexing_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      url text NOT NULL,
      in_sitemap boolean NOT NULL DEFAULT true,
      index_state text NOT NULL DEFAULT 'unknown',
      coverage_state text,
      verdict text,
      http_status int,
      last_checked_at timestamptz,
      last_crawl_at timestamptz,
      last_submitted_at timestamptz,
      submit_source text,
      detection_source text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS indexing_status_uq ON indexing_status(site_id, url);
    CREATE INDEX IF NOT EXISTS indexing_status_site_state_idx ON indexing_status(site_id, index_state);
    ALTER TABLE indexing_status ADD COLUMN IF NOT EXISTS removal_requested_at timestamptz;
    ALTER TABLE indexing_status ADD COLUMN IF NOT EXISTS removal_note text;

    -- Indexing quota usage (2026-06-25) — daily IndexNow submission counter.
    CREATE TABLE IF NOT EXISTS indexing_quota_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      day text NOT NULL,
      site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
      urls_submitted integer NOT NULL DEFAULT 0,
      requests_made integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS indexing_quota_per_site_uq
      ON indexing_quota_usage(day, site_id) WHERE site_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS indexing_quota_global_uq
      ON indexing_quota_usage(day) WHERE site_id IS NULL;
    CREATE INDEX IF NOT EXISTS indexing_quota_day_idx ON indexing_quota_usage(day);

    -- Research for new design (Phase 1 — backend, 2026-06-14) ───────────
    CREATE TABLE IF NOT EXISTS design_research_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      market text NOT NULL DEFAULT 'anywhere',
      niches jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL DEFAULT 'queued',   -- queued|researching|capturing|ready|failed
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      summary text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS design_research_runs_status_idx ON design_research_runs(status, created_at);

    CREATE TABLE IF NOT EXISTS design_reference_sites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id uuid NOT NULL REFERENCES design_research_runs(id) ON DELETE CASCADE,
      url text NOT NULL,
      name text NOT NULL,
      market text,
      niche text,
      why_high_performing text,
      design_notes text,
      design_dna jsonb,
      semrush_rank int,
      semrush_traffic int,
      full_screenshot_path text,
      status text NOT NULL DEFAULT 'researching', -- researching|capturing|captured|capture_failed
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS design_reference_sites_run_idx ON design_reference_sites(run_id, status);

    CREATE TABLE IF NOT EXISTS design_reference_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id uuid NOT NULL REFERENCES design_reference_sites(id) ON DELETE CASCADE,
      section_type text NOT NULL DEFAULT 'other',
      label text,
      "order" int NOT NULL DEFAULT 0,
      screenshot_path text,
      dom_summary text,
      bounding_box jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS design_reference_sections_site_idx ON design_reference_sections(site_id, "order");
    ALTER TABLE design_reference_sections ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dom';
    ALTER TABLE design_reference_sections ADD COLUMN IF NOT EXISTS y_start_pct double precision;
    ALTER TABLE design_reference_sections ADD COLUMN IF NOT EXISTS y_end_pct double precision;
    ALTER TABLE design_reference_sections ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true;
    ALTER TABLE design_reference_sections ADD COLUMN IF NOT EXISTS validation_note text;

    CREATE TABLE IF NOT EXISTS design_selections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id uuid NOT NULL REFERENCES design_research_runs(id) ON DELETE CASCADE,
      section_id uuid NOT NULL REFERENCES design_reference_sections(id) ON DELETE CASCADE,
      target_project_id uuid REFERENCES site_build_projects(id) ON DELETE SET NULL,
      replication_prompt text,
      build_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'selected', -- selected|building|built
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS design_selections_run_idx ON design_selections(run_id, status);
    CREATE INDEX IF NOT EXISTS design_selections_section_idx ON design_selections(section_id);

    -- Named email-service label shown alongside SMTP config (e.g. "Sender",
    -- "SES", "Postfix") -- cosmetic only, doesn't change delivery behavior.
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS smtp_provider_name text;

    -- Technical Scout API keys + quota config (2026-06-25). All BYOK, same
    -- ciphertext pattern as Stripe/Square/Google/Twilio above.
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS pagespeed_api_key_ciphertext text;
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS google_crux_api_key_ciphertext text;
    ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS indexnow_daily_quota integer NOT NULL DEFAULT 200;

    -- ============================================================
    -- SEO agent roster — user-editable skill instructions per agent
    -- (both built-in agents and custom ones added via UI). Primary key
    -- is the agent id string ('leader', 'onpage', ..., or a slugged
    -- custom id like 'custom-2026-06-25-abc'). Server-side source of
    -- truth for the agent profile page.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id text PRIMARY KEY,
      name text NOT NULL,
      title text NOT NULL,
      focus text,
      skill_instructions text,
      /* built-in agents can't be deleted; user-added ones can. */
      is_custom boolean NOT NULL DEFAULT false,
      /* deactivated agents show as OFF on the hero + do not receive dispatched work. */
      is_active boolean NOT NULL DEFAULT true,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    /* Backfill for dbs that predate is_active — leaves existing rows active. */
    DO $$ BEGIN
      ALTER TABLE agent_profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN null; END $$;
    CREATE INDEX IF NOT EXISTS agent_profiles_custom_idx ON agent_profiles(is_custom, created_at);

    -- ============================================================
    -- Agent-scoped scheduled tasks. Fires enqueue a claude_jobs row.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS agent_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id text NOT NULL REFERENCES agent_profiles(id) ON DELETE CASCADE,
      task_type text NOT NULL,
      title text NOT NULL,
      instructions text,
      site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
      next_fire_at timestamptz NOT NULL,
      recurrence text NOT NULL DEFAULT 'once',
      enabled boolean NOT NULL DEFAULT true,
      last_fire_at timestamptz,
      last_job_id uuid REFERENCES claude_jobs(id) ON DELETE SET NULL,
      fire_count integer NOT NULL DEFAULT 0,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS agent_schedules_agent_idx ON agent_schedules(agent_id, next_fire_at);
    CREATE INDEX IF NOT EXISTS agent_schedules_next_idx ON agent_schedules(enabled, next_fire_at);

    -- ============================================================
    -- File attachments for claude_jobs. Files live on disk under
    -- ATTACHMENT_STORAGE_PATH (default ./.data/agent-task-attachments).
    -- storage_path is relative to that root so the DB is portable
    -- across dev/prod without rewriting rows.
    -- ============================================================
    CREATE TABLE IF NOT EXISTS job_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id uuid NOT NULL REFERENCES claude_jobs(id) ON DELETE CASCADE,
      filename text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      storage_path text NOT NULL,
      uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS job_attachments_job_idx ON job_attachments(job_id, created_at);
  `);
    _migrated = true;
  } finally {
    if (isPg) {
      try {
        await execDDL(`SELECT pg_advisory_unlock(0x47594c5f3031::bigint);`);
      } catch {
        // best effort
      }
    }
  }
}
