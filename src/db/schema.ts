import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
  index,
  pgEnum,
  numeric,
  date,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "head_of_department", "editor", "viewer"]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);

export interface KbServiceItem {
  id: string;
  name: string;
  category?: string;
  description?: string;
  priceAed?: string;
  turnaround?: string;
  keywords?: string[];
  features?: string[];
}

export interface KbFaqItem {
  id: string;
  category?: string;
  question: string;
  answer: string;
}

export interface KbPolicyItem {
  id: string;
  title: string;
  description: string;
}

export interface KbCompetitorItem {
  id: string;
  name: string;
  domain?: string;
  counterStrategy?: string;
}

export interface KbBusinessProfile {
  businessName?: string;
  niche?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  workingHours?: string;
  tradeLicense?: string;
  establishedYear?: string;
}

export interface KbBrandTone {
  tone?: string;
  usps?: string[];
  rulesDos?: string[];
  rulesDonts?: string[];
  targetPersonas?: string[];
}

// Real social profile URLs discovered by scraping the business's GBP
// listing page or website (src/lib/social-scraper.ts) -- never guessed or
// synthesized from the business name.
export interface KbSocialLinks {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  snapchat?: string;
  x?: string;
  pinterest?: string;
  linkedin?: string;
  youtube?: string;
  scrapedFrom?: string; // the GBP or website URL this was extracted from
  scrapedAt?: string; // ISO timestamp
}

export interface StructuredKnowledgeBase {
  businessProfile?: KbBusinessProfile;
  services?: KbServiceItem[];
  brandTone?: KbBrandTone;
  faqs?: KbFaqItem[];
  policies?: KbPolicyItem[];
  competitors?: KbCompetitorItem[];
  socialLinks?: KbSocialLinks;
}

export const siteHealthEnum = pgEnum("site_health", ["healthy", "attention", "onboarding"]);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    city: text("city"),
    region: text("region"),
    knowledgeBase: text("knowledge_base"),
    structuredKb: jsonb("structured_kb")
      .$type<StructuredKnowledgeBase>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Operational/connection fields consumed by the dashboard, connected-sites,
    // and agency-health screens. Metrics themselves (KPIs, trends, top queries,
    // etc.) are always fetched live from Google APIs, never stored here.
    health: siteHealthEnum("health").notNull().default("onboarding"),
    pagesTotal: integer("pages_total").notNull().default(0),
    pagesIndexed: integer("pages_indexed").notNull().default(0),
    openFixes: integer("open_fixes").notNull().default(0),
    gaConnected: boolean("ga_connected").notNull().default(false),
    gaPropertyId: text("ga_property_id"),
    gaPropertyLabel: text("ga_property_label"),
    gscConnected: boolean("gsc_connected").notNull().default(false),
    gscPropertyUrl: text("gsc_property_url"),
    gbpConnected: boolean("gbp_connected").notNull().default(false),
    gbpLocationName: text("gbp_location_name"),
    wpConnected: boolean("wp_connected").notNull().default(false),
    wpDetail: text("wp_detail"),
    // Real WordPress REST API credentials for publishing (src/lib/wordpress.ts).
    // wpDetail above is just a display string; these are what
    // api.tasks.$id.publish.ts actually authenticates with. App password is
    // AES-256-GCM encrypted at rest via src/lib/crypto.ts, same pattern as
    // every other API secret in org_settings.
    wpSiteUrl: text("wp_site_url"),
    wpUsername: text("wp_username"),
    wpAppPasswordCiphertext: text("wp_app_password_ciphertext"),
    // Per-site business vertical, set during onboarding. Free text (not a
    // Postgres enum) matching how automation_flows.category and
    // alerts.severity are modeled -- new verticals can be added in
    // src/lib/business-categories.ts without a schema migration. Steers
    // SEO Suite tool prompts (job-templates.ts) toward vertical-relevant
    // guidance (licensing/insurance for trades, E-E-A-T/YMYL for medical,
    // etc.) instead of hardcoding a separate agent per niche.
    businessCategory: text("business_category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("sites_slug_uq").on(t.slug),
    domainIdx: uniqueIndex("sites_domain_uq").on(t.domain),
  }),
);


export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    keyId: text("key_id").notNull(),
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    keyIdIdx: uniqueIndex("api_keys_key_id_uq").on(t.keyId),
    siteIdx: index("api_keys_site_idx").on(t.siteId),
  }),
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    form: text("form").notNull(),
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    service: text("service"),
    message: text("message"),
    pageUrl: text("page_url"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    status: leadStatusEnum("status").notNull().default("new"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("leads_site_created_idx").on(t.siteId, t.createdAt),
    emailIdx: index("leads_email_idx").on(t.email),
  }),
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idemUq: uniqueIndex("events_site_idem_uq").on(t.siteId, t.idempotencyKey),
    siteReceivedIdx: index("events_site_received_idx").on(t.siteId, t.receivedAt),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(t.email),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey().default("singleton"),
  anthropicKeyCiphertext: text("anthropic_key_ciphertext"),
  geminiKeyCiphertext: text("gemini_key_ciphertext"),
  groqKeyCiphertext: text("groq_key_ciphertext"),
  llmProviderPreference: text("llm_provider_preference").notNull().default("gemini"),
  llmModel: text("llm_model").notNull().default("claude-opus-4-7"),
  auditEnabled: boolean("audit_enabled").notNull().default(true),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthTokenCiphertext: text("twilio_auth_token_ciphertext"),
  twilioWebhookBaseUrl: text("twilio_webhook_base_url"),
  stripeOauthClientId: text("stripe_oauth_client_id"),
  stripeOauthSecretCiphertext: text("stripe_oauth_secret_ciphertext"),
  squareOauthClientId: text("square_oauth_client_id"),
  squareOauthSecretCiphertext: text("square_oauth_secret_ciphertext"),
  googleOauthClientId: text("google_oauth_client_id"),
  googleOauthSecretCiphertext: text("google_oauth_secret_ciphertext"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPasswordCiphertext: text("smtp_password_ciphertext"),
  smtpFrom: text("smtp_from"),
  smtpEnabled: boolean("smtp_enabled").notNull().default(false),
  publicBaseUrl: text("public_base_url"),
  networkKnowledgeBase: text("network_knowledge_base"),
  telegramBotTokenCiphertext: text("telegram_bot_token_ciphertext"),
  telegramWebhookSecret: text("telegram_webhook_secret"),
  telegramBotUsername: text("telegram_bot_username"),
  claudeWorkerSecret: text("claude_worker_secret"),
  industry: text("industry").notNull().default("cleaning_services"),
  pagespeedApiKeyCiphertext: text("pagespeed_api_key_ciphertext"),
  googleCruxApiKeyCiphertext: text("google_crux_api_key_ciphertext"),
  indexnowDailyQuota: integer("indexnow_daily_quota").notNull().default(200),
  openaiKeyCiphertext: text("openai_key_ciphertext"),
  semrushKeyCiphertext: text("semrush_key_ciphertext"),
  // Integration toggles (Settings > Integrations tab). "Google (GSC + GA4)"
  // is intentionally not here — it's genuinely live via Connected Sites,
  // not a settings toggle.
  integrationSmtpEnabled: boolean("integration_smtp_enabled").notNull().default(false),
  integrationSlackEnabled: boolean("integration_slack_enabled").notNull().default(false),
  integrationTelegramEnabled: boolean("integration_telegram_enabled").notNull().default(false),
  integrationRestApiEnabled: boolean("integration_rest_api_enabled").notNull().default(false),
  integrationWordpressEnabled: boolean("integration_wordpress_enabled").notNull().default(false),
  integrationStripeEnabled: boolean("integration_stripe_enabled").notNull().default(false),
  integrationZapierEnabled: boolean("integration_zapier_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const claudeJobs = pgTable(
  "claude_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("pending"),
    priority: text("priority").notNull().default("normal"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    outputMarkdown: text("output_markdown"),
    artifacts: jsonb("artifacts").$type<Array<{ name: string; url?: string; bytes?: number }>>().notNull().default(sql`'[]'::jsonb`),
    workerId: text("worker_id"),
    workerInfo: jsonb("worker_info").$type<Record<string, unknown>>(),
    preferWorker: text("prefer_worker").notNull().default("any"),
    triggerSource: text("trigger_source").notNull().default("system"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("claude_jobs_status_idx").on(t.status, t.priority, t.createdAt),
    siteIdx: index("claude_jobs_site_idx").on(t.siteId, t.createdAt),
    kindIdx: index("claude_jobs_kind_idx").on(t.kind, t.status),
  }),
);

// NOTE: agent_profiles table removed (see migration DROP in client.ts) --
// it was defined, seeded with 8 rows, and never read or written by any
// route in the app. src/lib/agents.ts's EXPERTS is the real, UI-rendered
// agent roster; per-agent execution history now comes from claude_jobs
// (every job's `kind` maps to an agent/category) instead of a separate,
// disconnected identity table.

export const trafficSnapshots = pgTable(
  "traffic_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteSourceDateUq: uniqueIndex("traffic_snapshots_uq").on(t.siteId, t.source, t.snapshotDate),
    dateIdx: index("traffic_snapshots_date_idx").on(t.snapshotDate),
  }),
);

export const kanbanTasks = pgTable(
  "kanban_tasks",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").default("safaeewala"),
    title: text("title").notNull(),
    desc: text("desc"),
    assignee: text("assignee").notNull(),
    priority: text("priority").notNull().default("medium"),
    status: text("status").notNull().default("todo"),
    due: text("due"),
    templateId: text("template_id"),
    jobId: text("job_id"),
    outputMarkdown: text("output_markdown"),
    // Real attribution for who moved this out of pending_approval -- either
    // an owner's explicit click in /approvals, or an auto-approval decided
    // by evaluateApproval() under a rule with requiresApproval: false
    // ("Head of Department" tier). Previously this was silent: a task could
    // flip straight to "todo" with no record of who or what approved it.
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Real result of publishing this task's output to the live site via the
    // WordPress REST API (src/lib/wordpress.ts) -- set only on an actual
    // successful publish, never synthesized.
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Real operator comment/instruction added from the Approvals "View"
    // modal -- genuinely used, not just stored: when the task is approved
    // and a claude_jobs row is created (api.tasks.$id.ts), this text is
    // appended to the job's input so the AI agent actually sees it, not a
    // silent annotation nobody reads.
    operatorNotes: text("operator_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("kanban_tasks_status_idx").on(t.status),
    assigneeIdx: index("kanban_tasks_assignee_idx").on(t.assignee),
  }),
);

export const kanbanTaskTemplates = pgTable(
  "kanban_task_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    desc: text("desc"),
    defaultAssignee: text("default_assignee"),
    priority: text("priority").notNull().default("medium"),
    builtIn: boolean("built_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

export const automationFlows = pgTable(
  "automation_flows",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    desc: text("desc"),
    category: text("category").notNull(),
    cadence: text("cadence").notNull().default("weekly"),
    status: text("status").notNull().default("running"),
    icon: text("icon"),
    accent: text("accent"),
    lastRun: text("last_run").default("—"),
    successRate: integer("success_rate").notNull().default(100),
    assignedAgents: jsonb("assigned_agents").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("automation_flows_status_idx").on(t.status),
    categoryIdx: index("automation_flows_category_idx").on(t.category),
  }),
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    severity: text("severity").notNull().default("info"), // info | warning | critical
    title: text("title").notNull(),
    message: text("message"),
    source: text("source").notNull().default("system"), // gsc | ga4 | gbp | system | manual
    status: text("status").notNull().default("open"), // open | acknowledged | resolved
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("alerts_status_idx").on(t.status, t.createdAt),
    siteIdx: index("alerts_site_idx").on(t.siteId),
  }),
);

export const webhookSubscribers = pgTable(
  "webhook_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastStatus: text("last_status"),
  },
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull().default("unknown"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  }),
);

export const notificationPrefs = pgTable(
  "notification_prefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventKey: text("event_key").notNull(),
    label: text("label").notNull(),
    email: boolean("email").notNull().default(false),
    slack: boolean("slack").notNull().default(false),
    push: boolean("push").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventKeyUq: uniqueIndex("notification_prefs_event_key_uq").on(t.eventKey),
  }),
);

export const settingsAutomationRules = pgTable(
  "settings_automation_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    action: text("action").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Approval rules decide whether an orchestrator/agent-generated task needs
// the account owner's own sign-off (kanban_tasks.status = "pending_approval")
// or can be auto-approved on the owner's behalf (Head of Department tier).
// Evaluated by src/lib/approval-rules.ts using most-specific-match-wins
// across three optional dimensions -- a rule only applies to a task when
// every dimension it sets (non-null) matches; null/empty means "any".
export const approvalRules = pgTable(
  "approval_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    minPriority: text("min_priority"), // "low" | "medium" | "high" | "critical" | null (any)
    category: text("category"), // seo-suite tool category / agent id, or null (any)
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }), // null = all sites
    requiresApproval: boolean("requires_approval").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// Real per-URL inventory from a site's own sitemap.xml (src/lib/sitemap-crawler.ts).
// Replaces the hardcoded pagesTotal/pagesIndexed numbers that used to live in
// a fake per-site fixture -- refreshed on demand from the Knowledge Base
// page's "Site Pages" tab, not on a schedule (no cron in this app; matches
// the orchestrator's manual-trigger-only design).
export const sitePages = pgTable(
  "site_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    lastmod: text("lastmod"),
    changefreq: text("changefreq"),
    priority: text("priority"),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteUrlUq: uniqueIndex("site_pages_site_url_uq").on(t.siteId, t.url),
    siteIdx: index("site_pages_site_idx").on(t.siteId),
  }),
);

// Real QA Suite persistence. Replaces the fully-mocked qa-suite.tsx (hardcoded
// fake sites, hardcoded test-suite numbers that never changed, setTimeout
// fake run states). A qa_run is one real Playwright session against one
// site/scope; qa_findings holds the individual pass/fail checks it produced
// (viewport overflow, broken links, missing schema, axe-core violations,
// Core Web Vitals). Executed by worker/aks-worker.mjs via the same
// claude_jobs queue as every other job kind, just with a "qa:run" branch
// that drives Playwright directly instead of the claude CLI.
export const qaRunStatusEnum = pgEnum("qa_run_status", ["queued", "running", "passed", "warning", "failed"]);

export const qaRuns = pgTable(
  "qa_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("full"), // "full" | "landing" | "blog" | "page"
    targetUrl: text("target_url"), // set when scope = "page"
    status: qaRunStatusEnum("status").notNull().default("queued"),
    jobId: uuid("job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    pagesChecked: integer("pages_checked").notNull().default(0),
    checksTotal: integer("checks_total").notNull().default(0),
    checksPassed: integer("checks_passed").notNull().default(0),
    checksFailed: integer("checks_failed").notNull().default(0),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    siteCreatedIdx: index("qa_runs_site_created_idx").on(t.siteId, t.createdAt),
  }),
);

export const qaFindings = pgTable(
  "qa_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => qaRuns.id, { onDelete: "cascade" }),
    suite: text("suite").notNull(), // "viewport" | "links" | "schema" | "accessibility" | "vitals"
    pageUrl: text("page_url").notNull(),
    severity: text("severity").notNull().default("info"), // "critical" | "warning" | "info"
    passed: boolean("passed").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("qa_findings_run_idx").on(t.runId),
  }),
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type User = typeof users.$inferSelect;
export type ClaudeJob = typeof claudeJobs.$inferSelect;
export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type KanbanTaskTemplate = typeof kanbanTaskTemplates.$inferSelect;
export type AutomationFlow = typeof automationFlows.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type WebhookSubscriber = typeof webhookSubscribers.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NotificationPref = typeof notificationPrefs.$inferSelect;
export type SettingsAutomationRule = typeof settingsAutomationRules.$inferSelect;
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type SitePage = typeof sitePages.$inferSelect;
export type QaRun = typeof qaRuns.$inferSelect;
export type QaFinding = typeof qaFindings.$inferSelect;


