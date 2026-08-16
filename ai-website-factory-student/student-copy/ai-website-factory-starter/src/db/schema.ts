import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  primaryKey,
  uniqueIndex,
  index,
  pgEnum,
  numeric,
  date,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "student"]);
export const siteUserRoleEnum = pgEnum("site_user_role", ["manager", "worker"]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    city: text("city"),
    region: text("region"),
    // Free-form admin-editable knowledge that the AI assistant uses to answer
    // customer questions about service areas, fleet, policies, hours, FAQs.
    // Injected verbatim into the chat system prompt — the LLM treats it as
    // ground truth for this site. Edit at /admin/sites/<slug>.
    knowledgeBase: text("knowledge_base"),
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
    role: userRoleEnum("role").notNull().default("student"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(t.email),
  }),
);

export const siteUsers = pgTable(
  "site_users",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: siteUserRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.siteId, t.userId] }),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    // tokenHash is the lookup key — sha256 of the raw token. We never store the raw token.
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

export const taskTemplates = pgTable(
  "task_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null siteId = template applies to all sites (e.g. "weekly content audit, every site")
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    cadence: text("cadence").notNull(), // free-text for v0.1: 'weekly', 'monthly', 'every 2 weeks'
    defaultAssigneeId: uuid("default_assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    defaultPriority: taskPriorityEnum("default_priority").notNull().default("normal"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  },
  (t) => ({
    siteIdx: index("task_templates_site_idx").on(t.siteId),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => taskTemplates.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("tasks_site_idx").on(t.siteId),
    assigneeIdx: index("tasks_assignee_idx").on(t.assigneeId),
    statusDueIdx: index("tasks_status_due_idx").on(t.status, t.dueAt),
  }),
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_comments_task_idx").on(t.taskId, t.createdAt),
  }),
);

// Org-wide settings. Singleton row, id='singleton'. Holds all third-party credentials.
export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey().default("singleton"),
  anthropicKeyCiphertext: text("anthropic_key_ciphertext"),
  // v0.10: free-tier LLM fallbacks. Gemini Flash gives 1500 free reqs/day;
  // Groq (Llama 3.3 70B) gives 14400/day. Either covers all routine parse-quote
  // calls without paying for Anthropic. Anthropic stays as the heavy-tier
  // option for audit/research where quality matters most.
  geminiKeyCiphertext: text("gemini_key_ciphertext"),
  groqKeyCiphertext: text("groq_key_ciphertext"),
  /** "gemini" | "groq" | "anthropic" — tried in this order, then regex fallback. */
  llmProviderPreference: text("llm_provider_preference").notNull().default("gemini"),
  llmModel: text("llm_model").notNull().default("claude-opus-4-7"),
  auditEnabled: boolean("audit_enabled").notNull().default(true),
  digestEnabled: boolean("digest_enabled").notNull().default(true),
  // Twilio (phase 5)
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthTokenCiphertext: text("twilio_auth_token_ciphertext"),
  twilioWebhookBaseUrl: text("twilio_webhook_base_url"),
  // Stripe OAuth (phase 4)
  stripeOauthClientId: text("stripe_oauth_client_id"),
  stripeOauthSecretCiphertext: text("stripe_oauth_secret_ciphertext"),
  // Square OAuth (phase 4)
  squareOauthClientId: text("square_oauth_client_id"),
  squareOauthSecretCiphertext: text("square_oauth_secret_ciphertext"),
  // Google OAuth (phase 4 — shared for GSC + GA4)
  googleOauthClientId: text("google_oauth_client_id"),
  googleOauthSecretCiphertext: text("google_oauth_secret_ciphertext"),
  // SMTP outbound (v0.2)
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPasswordCiphertext: text("smtp_password_ciphertext"),
  smtpFrom: text("smtp_from"),
  smtpEnabled: boolean("smtp_enabled").notNull().default(false),
  smtpProviderName: text("smtp_provider_name"),
  publicBaseUrl: text("public_base_url"),
  // Network-wide AI knowledge base. Injected into EVERY site's chat / parser
  // system prompt before the site-specific knowledge. Set once at
  // /admin/settings; per-site KB at /admin/sites/<slug> adds city-specific
  // overrides. Seeded with Dubai + UAE-wide service-area defaults on first read.
  networkKnowledgeBase: text("network_knowledge_base"),
  // Telegram bot (phase 6) — for SEO agent notifications + commands.
  // Bot token is encrypted (same key as the Anthropic key). Webhook secret
  // is a random URL-safe string appended to the webhook path so unsigned
  // callers can't poke the endpoint.
  telegramBotTokenCiphertext: text("telegram_bot_token_ciphertext"),
  telegramWebhookSecret: text("telegram_webhook_secret"),
  telegramBotUsername: text("telegram_bot_username"),
  // Phase A — Shared secret the Claude Code worker uses to authenticate
  // against /api/claude-jobs/{claim,complete}. Rotate by writing a fresh
  // value via /admin/agent/jobs (the page surfaces "Rotate worker secret").
  claudeWorkerSecret: text("claude_worker_secret"),
  // The vertical the agent specializes in. All prompts, design templates,
  // and QA conventions are tuned to this industry. Default 'cleaning_services'.
  industry: text("industry").notNull().default("cleaning_services"),
  // Technical Scout (PageSpeed + CrUX) API keys, BYOK same as the above.
  // Configuring these moves PSI off the ~25req/100s unauthenticated tier
  // and lets the CWV cron sync real-user CrUX data instead of 500ing.
  pagespeedApiKeyCiphertext: text("pagespeed_api_key_ciphertext"),
  googleCruxApiKeyCiphertext: text("google_crux_api_key_ciphertext"),
  /** Admin-configurable soft cap on IndexNow submissions/day, network-wide. */
  indexnowDailyQuota: integer("indexnow_daily_quota").notNull().default(200),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("chat_threads_user_idx").on(t.userId, t.lastMessageAt),
  }),
);

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant", "system", "tool"]);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: chatRoleEnum("role").notNull(),
    body: text("body").notNull(),
    toolName: text("tool_name"),
    toolInput: jsonb("tool_input").$type<Record<string, unknown>>(),
    toolOutput: jsonb("tool_output").$type<unknown>(),
    inputTokens: text("input_tokens"),
    outputTokens: text("output_tokens"),
    cacheReadTokens: text("cache_read_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index("chat_messages_thread_idx").on(t.threadId, t.createdAt),
  }),
);

export const taskAuditVerdictEnum = pgEnum("task_audit_verdict", [
  "done",
  "partial",
  "not_started",
  "no_show",
  "ambiguous",
]);

export const taskAudits = pgTable(
  "task_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    verdict: taskAuditVerdictEnum("verdict").notNull(),
    summary: text("summary").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    tokensUsed: text("tokens_used"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_audits_task_idx").on(t.taskId, t.runAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional site scope — used by quote/reservation/booking-related notifications
    // so the admin can filter the inbox by site. System notifications (errors,
    // health alerts, daily digest) leave this null.
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => ({
    recipientIdx: index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
    unreadIdx: index("notifications_unread_idx").on(t.recipientId, t.readAt),
    siteIdx: index("notifications_site_idx").on(t.siteId, t.createdAt),
  }),
);

/**
 * Append-only log of human admin actions for accountability.
 * Captures actor + kind ("user.update", "lead.status_change", "site.delete", ...) +
 * target reference + the before/after diff snapshot.
 *
 * Action kinds follow `<entity>.<verb>` convention. The before/after JSON is
 * truncated (16KB max per side) to avoid bloat on very large rows.
 */
export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"), // denormalized so the log survives user deletion
    kind: text("kind").notNull(),
    targetType: text("target_type").notNull(), // 'user' | 'lead' | 'task' | 'site' | ...
    targetId: text("target_id"), // string so we can log slug or uuid
    summary: text("summary").notNull(),
    before: jsonb("before").$type<unknown>(),
    after: jsonb("after").$type<unknown>(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index("admin_actions_actor_idx").on(t.actorId, t.createdAt),
    targetIdx: index("admin_actions_target_idx").on(t.targetType, t.targetId),
    createdIdx: index("admin_actions_created_idx").on(t.createdAt),
  }),
);

/**
 * Self-service onboarding invites. Single-use, time-boxed.
 * A signed token (`hashed_token` is sha256 of the raw token; the raw token
 * is in the URL the admin sends to the worker) is consumed when the worker
 * sets their initial password.
 */
export const inviteTokens = pgTable(
  "invite_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("invite_tokens_user_idx").on(t.userId),
    expiresIdx: index("invite_tokens_expires_idx").on(t.expiresAt),
  }),
);

/**
 * Append-only contact log per lead: who tried to reach the lead, when, by
 * what channel, and what happened. Replaces the single `lead.notes` textarea
 * for real CRM workflow.
 */
export const leadContactAttempts = pgTable(
  "lead_contact_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: text("channel").notNull(), // 'call' | 'sms' | 'email' | 'in_person' | 'other'
    outcome: text("outcome").notNull(), // 'reached' | 'voicemail' | 'no_answer' | 'bounced' | 'busy' | 'other'
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    leadIdx: index("lead_contact_attempts_lead_idx").on(t.leadId, t.createdAt),
  }),
);

/**
 * Per-user notification & profile preferences. PK is user_id so the row is
 * 1:1 with users. Inserted lazily on first write.
 */
export const userPrefs = pgTable("user_prefs", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone"),
  emailOnTaskAssigned: boolean("email_on_task_assigned").notNull().default(true),
  emailOnTaskComment: boolean("email_on_task_comment").notNull().default(true),
  emailOnLeadAssigned: boolean("email_on_lead_assigned").notNull().default(true),
  emailOnDailyDigest: boolean("email_on_daily_digest").notNull().default(true),
  emailOnAiFlag: boolean("email_on_ai_flag").notNull().default(true),
  digestWebhookUrl: text("digest_webhook_url"),
  // Phase 6 — SEO agent notification channel.
  // telegram_chat_id is the numeric chat ID we send DM messages to. Linked
  // either by the /start auto-link flow (first chat → first admin) or by
  // the user pasting a code from /admin/me/settings.
  telegramChatId: text("telegram_chat_id"),
  telegramOptIn: boolean("telegram_opt_in").notNull().default(true),
  notifySeoFixApplied: boolean("notify_seo_fix_applied").notNull().default(false),
  notifyWeeklyDigest: boolean("notify_weekly_digest").notNull().default(true),
  notifyRankingDrop: boolean("notify_ranking_drop").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ===== Phase 3: Electron desktop wrapper =====

export const desktopSessions = pgTable(
  "desktop_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Long-lived bearer token the Electron app stores in OS keychain.
    tokenHash: text("token_hash").notNull(),
    deviceName: text("device_name"),
    osVersion: text("os_version"),
    appVersion: text("app_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    revoked: boolean("revoked").notNull().default(false),
  },
  (t) => ({
    userIdx: index("desktop_sessions_user_idx").on(t.userId, t.startedAt),
    tokenUq: uniqueIndex("desktop_sessions_token_uq").on(t.tokenHash),
  }),
);

export const screenRecordings = pgTable(
  "screen_recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    desktopSessionId: uuid("desktop_session_id")
      .notNull()
      .references(() => desktopSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    // For v0.1 we store the binary on the VPS filesystem; later we can switch to S3-compatible storage.
    storagePath: text("storage_path").notNull(),
    sizeBytes: text("size_bytes").notNull(),
    durationSec: text("duration_sec"),
    mimeType: text("mime_type").notNull().default("video/webm"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("screen_recordings_session_idx").on(t.desktopSessionId, t.startedAt),
    userIdx: index("screen_recordings_user_idx").on(t.userId, t.startedAt),
  }),
);

export const activityEventKindEnum = pgEnum("activity_event_kind", [
  "session_start",
  "session_end",
  "wp_admin_open",
  "wp_admin_close",
  "page_focus",
  "page_blur",
  "idle_start",
  "idle_end",
  "clipboard_blocked",
  "external_url_blocked",
  "task_marked_done",
  "form_submit",
]);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    desktopSessionId: uuid("desktop_session_id")
      .notNull()
      .references(() => desktopSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    kind: activityEventKindEnum("kind").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    sessionIdx: index("activity_events_session_idx").on(t.desktopSessionId, t.occurredAt),
    userIdx: index("activity_events_user_idx").on(t.userId, t.occurredAt),
  }),
);

// Short-lived signed grants the Electron app exchanges for a wp-admin auth-cookie.
// The platform proxies wp-admin only when accompanied by a valid grant — that's
// how we enforce "WP admin only opens inside our software".
export const wpAdminGrants = pgTable(
  "wp_admin_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    desktopSessionId: uuid("desktop_session_id")
      .notNull()
      .references(() => desktopSessions.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenUq: uniqueIndex("wp_admin_grants_token_uq").on(t.tokenHash),
    expiresIdx: index("wp_admin_grants_expires_idx").on(t.expiresAt),
  }),
);

// ===== Phase 4: payments + analytics =====

export const paymentProviderEnum = pgEnum("payment_provider", ["stripe", "square"]);

export const integrationsAccounts = pgTable(
  "integrations_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // 'stripe' | 'square' | 'google'
    accountIdRemote: text("account_id_remote"), // Stripe acct_..., Square merchant_id, Google project id
    accessTokenCiphertext: text("access_token_ciphertext"),
    refreshTokenCiphertext: text("refresh_token_ciphertext"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // v0.2: per-integration sync health stamping
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"), // 'ok' | 'error'
    lastSyncError: text("last_sync_error"),
  },
  (t) => ({
    siteProviderUq: uniqueIndex("integrations_accounts_site_provider_uq").on(t.siteId, t.provider),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    provider: paymentProviderEnum("provider").notNull(),
    externalId: text("external_id").notNull(), // Stripe pi_..., Square payment.id
    amountCents: text("amount_cents").notNull(),
    currency: text("currency").notNull().default("cad"),
    status: text("status").notNull(), // succeeded | refunded | failed | pending
    customerEmail: text("customer_email"),
    customerName: text("customer_name"),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteReceivedIdx: index("payments_site_received_idx").on(t.siteId, t.receivedAt),
    externalUq: uniqueIndex("payments_external_uq").on(t.provider, t.externalId),
    emailIdx: index("payments_email_idx").on(t.customerEmail),
  }),
);

// Daily SEO/traffic snapshots — one row per site per day per source.
export const trafficSnapshots = pgTable(
  "traffic_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'gsc' | 'ga4'
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    // For GSC: clicks/impressions/ctr/position. For GA4: sessions/users/conversions/source breakdown.
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteSourceDateUq: uniqueIndex("traffic_snapshots_uq").on(t.siteId, t.source, t.snapshotDate),
    dateIdx: index("traffic_snapshots_date_idx").on(t.snapshotDate),
  }),
);

/**
 * Per-query GSC snapshots — one row per (site, query, date) for the last N
 * days. Populated by src/lib/gsc-sync.ts alongside the aggregate daily
 * traffic_snapshots row. Powers the "Keywords ranking up / down" widgets on
 * /admin/gsc.
 *
 * Region filter is baked in at sync time; we still stamp it on `detail` so
 * the reader can prove the filter was applied.
 */
export const gscQuerySnapshots = pgTable(
  "gsc_query_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: doublePrecision("ctr").notNull().default(0),
    position: doublePrecision("position").notNull().default(0),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteQueryDateUq: uniqueIndex("gsc_query_snapshots_uq").on(t.siteId, t.query, t.snapshotDate),
    dateIdx: index("gsc_query_snapshots_date_idx").on(t.snapshotDate),
    siteDateIdx: index("gsc_query_snapshots_site_date_idx").on(t.siteId, t.snapshotDate),
  }),
);
export type GscQuerySnapshot = typeof gscQuerySnapshots.$inferSelect;

/**
 * Per-page GSC snapshots — same shape as the query variant but keyed on the
 * landing URL. Powers the "Pages ranking up / down" widgets.
 */
export const gscPageSnapshots = pgTable(
  "gsc_page_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    page: text("page").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    ctr: doublePrecision("ctr").notNull().default(0),
    position: doublePrecision("position").notNull().default(0),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sitePageDateUq: uniqueIndex("gsc_page_snapshots_uq").on(t.siteId, t.page, t.snapshotDate),
    dateIdx: index("gsc_page_snapshots_date_idx").on(t.snapshotDate),
    siteDateIdx: index("gsc_page_snapshots_site_date_idx").on(t.siteId, t.snapshotDate),
  }),
);
export type GscPageSnapshot = typeof gscPageSnapshots.$inferSelect;

// ===== Phase 5: Twilio call tracking =====

export const phoneNumberStatusEnum = pgEnum("phone_number_status", ["active", "released"]);

export const phoneNumbers = pgTable(
  "phone_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    twilioSid: text("twilio_sid").notNull(),
    e164: text("e164").notNull(), // +14165551234
    friendlyName: text("friendly_name"),
    forwardTo: text("forward_to").notNull(), // E.164 of the real number to ring
    capabilities: jsonb("capabilities").$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
    recordCalls: boolean("record_calls").notNull().default(true),
    transcribeCalls: boolean("transcribe_calls").notNull().default(true),
    status: phoneNumberStatusEnum("status").notNull().default("active"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    areaCode: text("area_code"),
  },
  (t) => ({
    siteIdx: index("phone_numbers_site_idx").on(t.siteId),
    sidUq: uniqueIndex("phone_numbers_sid_uq").on(t.twilioSid),
    e164Uq: uniqueIndex("phone_numbers_e164_uq").on(t.e164),
  }),
);

export const callDirectionEnum = pgEnum("call_direction", ["inbound", "outbound"]);
export const callStatusEnum = pgEnum("call_status", [
  "queued",
  "ringing",
  "in_progress",
  "completed",
  "busy",
  "failed",
  "no_answer",
  "canceled",
]);

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    phoneNumberId: uuid("phone_number_id").references(() => phoneNumbers.id, { onDelete: "set null" }),
    twilioCallSid: text("twilio_call_sid").notNull(),
    direction: callDirectionEnum("direction").notNull(),
    fromE164: text("from_e164").notNull(),
    toE164: text("to_e164").notNull(),
    status: callStatusEnum("status").notNull(),
    durationSec: text("duration_sec"),
    recordingUrl: text("recording_url"),
    recordingSid: text("recording_sid"),
    transcript: text("transcript"),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    notes: text("notes"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStartedIdx: index("calls_site_started_idx").on(t.siteId, t.startedAt),
    sidUq: uniqueIndex("calls_sid_uq").on(t.twilioCallSid),
    fromIdx: index("calls_from_idx").on(t.fromE164),
  }),
);

// ============================================================================
// Booking system (quotes + reservations + public chat sessions + pricing)
// Phase 6 — customer-facing widgets on the WP sites collect quotes and
// reservations, which land here via HMAC-signed events from gyl-bookings.
// ============================================================================

export const tripTypeEnum = pgEnum("trip_type", ["one_way", "two_way", "hourly"]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "pending",   // just arrived, awaiting admin or auto-price
  "priced",    // estimate computed, awaiting customer accept
  "sent",      // sent to customer (email/SMS)
  "accepted",  // customer accepted → typically followed by reservation
  "converted", // a reservation row exists linked to this quote
  "expired",
  "lost",
]);

export const reservationStatusEnum = pgEnum("reservation_status", [
  "pending",         // arrived, not yet confirmed
  "confirmed",       // admin confirmed + (optionally) deposit received
  "driver_assigned", // (legacy — kept for back-compat with rows from before the driver concept was removed)
  "en_route",        // (legacy — same as above)
  "picked_up",       // passenger in car
  "completed",
  "cancelled",
  "no_show",
]);

export const reservationPaymentEnum = pgEnum("reservation_payment", [
  "unpaid",
  "deposit_received",
  "paid_in_full",
  "refunded",
]);

export const chatChannelEnum = pgEnum("chat_channel", ["chat", "voice"]);
export const chatSessionStatusEnum = pgEnum("chat_session_status", ["active", "completed", "abandoned"]);

/**
 * Per-site pricing rules. One row per site (PK = siteId).
 * Used by the quote auto-estimator. Admin can override the estimate
 * before sending the price to the customer.
 *
 * Currency: stored as ISO code (default 'cad'). Money fields are integer
 * cents stored as text (consistent with payments table).
 */
export const pricingRules = pgTable("pricing_rules", {
  siteId: uuid("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("cad"),
  baseFareCents: text("base_fare_cents").notNull().default("5000"),       // CAD 50.00
  perKmCents: text("per_km_cents").notNull().default("250"),               // CAD 2.50
  perMinuteCents: text("per_minute_cents").notNull().default("100"),       // CAD 1.00 (urban traffic component)
  minimumFareCents: text("minimum_fare_cents").notNull().default("8000"),  // CAD 80.00
  hourlyRateCents: text("hourly_rate_cents").notNull().default("11000"),   // CAD 110.00/hour
  twoWayDiscountPct: text("two_way_discount_pct").notNull().default("10"), // 10% off the return leg
  // Vehicle multipliers: 1.0 = base. Stored as text to avoid float drift.
  vehicleMultipliers: jsonb("vehicle_multipliers")
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{"sedan":1.0,"suv":1.3,"stretch":1.8,"sprinter":2.0,"limo_bus":2.5}'::jsonb`),
  // Surge windows: array of { dow: 0-6, fromHour: 0-23, toHour: 0-23, multiplier: number }
  surgeWindows: jsonb("surge_windows").$type<Array<{ dow: number; fromHour: number; toHour: number; multiplier: number }>>().notNull().default(sql`'[]'::jsonb`),
  gratuityPct: text("gratuity_pct").notNull().default("15"),
  taxPct: text("tax_pct").notNull().default("5"), // UAE VAT default; legacy Ontario HST value was 13 — admin overrides per site
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A quote = the customer asked "how much?". Doesn't commit them to anything.
 * Quotes flow: pending → priced → sent → (converted to reservation) | expired | lost.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    // Customer
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    // Trip details
    tripType: tripTypeEnum("trip_type").notNull().default("one_way"),
    pickupLocation: text("pickup_location").notNull(),
    pickupLat: text("pickup_lat"),  // text to avoid float drift
    pickupLng: text("pickup_lng"),
    dropoffLocation: text("dropoff_location"), // null for hourly
    dropoffLat: text("dropoff_lat"),
    dropoffLng: text("dropoff_lng"),
    pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }), // for two_way
    hours: text("hours"), // for hourly (decimal as text)
    passengers: text("passengers"), // int as text for consistency
    luggage: text("luggage"),
    vehicleType: text("vehicle_type"), // 'sedan' | 'suv' | 'stretch' | 'sprinter' | 'limo_bus' | 'any' | null
    flightNumber: text("flight_number"),
    message: text("message"), // free-form customer message / special requests
    // Pricing
    estimatedDistanceKm: text("estimated_distance_km"), // computed at quote time
    estimatedDurationMin: text("estimated_duration_min"),
    estimatedAmountCents: text("estimated_amount_cents"), // auto-estimate from rules
    quotedAmountCents: text("quoted_amount_cents"),       // what the admin actually offered (may override estimate)
    currency: text("currency").notNull().default("cad"),
    priceBreakdown: jsonb("price_breakdown").$type<Record<string, unknown>>(), // line items
    // Lifecycle
    status: quoteStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedReservationId: uuid("converted_reservation_id"), // FK set after reservation insert (no FK constraint to avoid circular)
    // Customer link (added Phase 7)
    customerId: uuid("customer_id"), // FK added later in ensureSchema to dodge circular ref
    // Public sharing token — sha256 in DB, raw token in URL ?token=
    publicTokenHash: text("public_token_hash"),
    // Provenance
    source: text("source").notNull().default("form"), // 'form' | 'chat' | 'voice' | 'admin' | 'phone'
    chatSessionId: uuid("chat_session_id"),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("quotes_site_created_idx").on(t.siteId, t.createdAt),
    statusIdx: index("quotes_status_idx").on(t.status, t.createdAt),
    emailIdx: index("quotes_email_idx").on(t.customerEmail),
    pickupAtIdx: index("quotes_pickup_at_idx").on(t.pickupAt),
    customerIdx: index("quotes_customer_idx").on(t.customerId),
    tokenIdx: uniqueIndex("quotes_public_token_uq").on(t.publicTokenHash).where(sql`${t.publicTokenHash} is not null`),
  }),
);

/**
 * A reservation = the customer committed. May or may not originate from a
 * quote (quoteId nullable). Has a confirmation code we surface to the customer.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    customerId: uuid("customer_id"), // FK added later in ensureSchema
    confirmationCode: text("confirmation_code").notNull(), // short human code like GYL-7H2K9
    // Customer
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone").notNull(),
    // Trip
    tripType: tripTypeEnum("trip_type").notNull().default("one_way"),
    pickupLocation: text("pickup_location").notNull(),
    pickupLat: text("pickup_lat"),
    pickupLng: text("pickup_lng"),
    dropoffLocation: text("dropoff_location"),
    dropoffLat: text("dropoff_lat"),
    dropoffLng: text("dropoff_lng"),
    pickupAt: timestamp("pickup_at", { withTimezone: true }).notNull(),
    returnAt: timestamp("return_at", { withTimezone: true }),
    hours: text("hours"),
    passengers: text("passengers"),
    luggage: text("luggage"),
    vehicleType: text("vehicle_type"),
    flightNumber: text("flight_number"),
    message: text("message"),
    // Pricing (snapshot at confirmation time)
    confirmedAmountCents: text("confirmed_amount_cents"),
    depositAmountCents: text("deposit_amount_cents"),
    currency: text("currency").notNull().default("cad"),
    priceBreakdown: jsonb("price_breakdown").$type<Record<string, unknown>>(),
    // Lifecycle
    status: reservationStatusEnum("status").notNull().default("pending"),
    paymentStatus: reservationPaymentEnum("payment_status").notNull().default("unpaid"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    // Operations notes (admin-only). The driverId / vehicleLabel fields were
    // removed 2026-05-26 — the solo operator manages every booking by hand;
    // there's no driver dispatch in the platform anymore.
    internalNotes: text("internal_notes"),
    // Provenance
    source: text("source").notNull().default("form"),
    chatSessionId: uuid("chat_session_id"),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("reservations_site_created_idx").on(t.siteId, t.createdAt),
    statusIdx: index("reservations_status_idx").on(t.status, t.pickupAt),
    pickupAtIdx: index("reservations_pickup_at_idx").on(t.pickupAt),
    codeUq: uniqueIndex("reservations_code_uq").on(t.confirmationCode),
    emailIdx: index("reservations_email_idx").on(t.customerEmail),
    quoteIdx: index("reservations_quote_idx").on(t.quoteId),
    customerIdx: index("reservations_customer_idx").on(t.customerId),
  }),
);

/**
 * Public-facing chat sessions (customer chatting with the AI booking widget on a WP site).
 * Distinct from the internal admin chat (chat_threads) — these have no logged-in user,
 * just a visitor cookie + an optional derived quote/reservation.
 */
export const publicChatSessions = pgTable(
  "public_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id").notNull(), // browser-cookie UUID
    channel: chatChannelEnum("channel").notNull().default("chat"),
    status: chatSessionStatusEnum("status").notNull().default("active"),
    // Transcript shape: [{ role: 'user'|'assistant'|'tool', content: string, at: ISO, toolName?: string, toolInput?: ..., toolOutput?: ... }]
    transcript: jsonb("transcript").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
    // Working memory the AI has gathered so far (pickup, dropoff, date, etc.)
    gathered: jsonb("gathered").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    derivedQuoteId: uuid("derived_quote_id").references(() => quotes.id, { onDelete: "set null" }),
    derivedReservationId: uuid("derived_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    tokensUsed: text("tokens_used"),
    sourceIp: text("source_ip"),
    userAgent: text("user_agent"),
    pageUrl: text("page_url"),
    // Expires-at — abandoned sessions get deleted by the cleanup cron when
    // this passes. Set on insert to now() + 90 days; bumped on each new turn.
    // Sessions that produce a quote/reservation are kept (FK presence is the
    // signal we want to keep them).
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("public_chat_sessions_site_created_idx").on(t.siteId, t.createdAt),
    visitorIdx: index("public_chat_sessions_visitor_idx").on(t.visitorId),
    expiresIdx: index("public_chat_sessions_expires_idx").on(t.expiresAt),
  }),
);

// ============================================================================
// Voice booking telemetry — fine-grained funnel events from the widget.
// ----------------------------------------------------------------------------
// One row per user interaction in the voice flow. Lets us answer:
//   "What % of customers who tap the mic complete a booking?"
//   "Where in the conversational flow do they drop off?"
//   "How often does the Pearson terminal clarifier resolve to T1 vs T3?"
//   "Does conversational mode beat type-only on conversion?"
//
// Schema is intentionally narrow + indexed for time-series analytics.
// Events are fire-and-forget from the widget — failures must not block UX.
// ============================================================================

export const voiceTelemetryEventKindEnum = pgEnum("voice_telemetry_event_kind", [
  "mic_tapped",
  "first_transcript",
  "parse_complete",
  "parse_error",
  "clarifier_shown",
  "clarifier_resolved",
  "chip_edited",
  "conversation_started",
  "conversation_step",
  "conversation_completed",
  "conversation_abandoned",
  "rerecord_tapped",
  "language_switched",
  "submit_clicked",
]);

export const voiceTelemetryEvents = pgTable(
  "voice_telemetry_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    // Browser-cookie UUID tying events together per visitor (no PII).
    visitorId: text("visitor_id").notNull(),
    // The widget that emitted the event: 'smart_quote' | 'reservation_form' | 'chat'
    widget: text("widget").notNull(),
    kind: voiceTelemetryEventKindEnum("kind").notNull(),
    // Free-form context — language picked, clarifier ID resolved, chip name,
    // duration ms. Schemaless on purpose for fast iteration.
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    sourceIp: text("source_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("voice_telemetry_site_created_idx").on(t.siteId, t.createdAt),
    visitorIdx: index("voice_telemetry_visitor_idx").on(t.visitorId, t.createdAt),
    kindIdx: index("voice_telemetry_kind_idx").on(t.kind, t.createdAt),
  }),
);

export type VoiceTelemetryEvent = typeof voiceTelemetryEvents.$inferSelect;
export type NewVoiceTelemetryEvent = typeof voiceTelemetryEvents.$inferInsert;

// ============================================================================
// Customer record (Phase 7 — data-model unlock for repeat-customer flows)
// One row per unique customer per site, deduped by lowercase email then phone.
// Upserted on every quote/reservation insert; powers LTV, VIP status, repeat
// discounts, fraud signals, dashboard search.
// ============================================================================

export const customerStatusEnum = pgEnum("customer_status", [
  "prospect",       // has a quote, no reservation yet
  "customer",       // 1+ completed reservation
  "vip",            // promoted manually or auto by LTV/count thresholds
  "blacklisted",    // refused service
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    // Identity (at least one of email/phone must be present)
    email: text("email"), // stored as-given (display)
    emailNormalized: text("email_normalized"), // lowercase for dedup lookups
    phone: text("phone"), // E.164 if we can normalize, else as-given
    name: text("name"),
    // Aggregate counters (denormalized; updated by upsert helper)
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    totalQuotes: integer("total_quotes").notNull().default(0),
    totalReservations: integer("total_reservations").notNull().default(0),
    totalCompleted: integer("total_completed").notNull().default(0),
    totalCancelled: integer("total_cancelled").notNull().default(0),
    ltvCents: text("ltv_cents").notNull().default("0"), // bigint-as-text, consistent with payments
    status: customerStatusEnum("status").notNull().default("prospect"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Dedup index — partial so null emails don't collide
    siteEmailUq: uniqueIndex("customers_site_email_uq")
      .on(t.siteId, t.emailNormalized)
      .where(sql`${t.emailNormalized} is not null`),
    sitePhoneIdx: index("customers_site_phone_idx").on(t.siteId, t.phone),
    siteLastSeenIdx: index("customers_site_last_seen_idx").on(t.siteId, t.lastSeenAt),
    siteStatusIdx: index("customers_site_status_idx").on(t.siteId, t.status),
  }),
);

/**
 * Shareable / public-token records. One token = one URL granting limited view
 * or action on a quote without authentication. Used by:
 *   - The customer's quote view (`/p/q/[token]`)
 *   - "Share with my boss" coordinator approval link
 *   - One-click accept buttons in emails
 *
 * tokenHash is sha256 of the raw token; raw token only appears in URLs/emails.
 */
export const quoteShareKindEnum = pgEnum("quote_share_kind", [
  "customer",        // the original customer's view link
  "coordinator",     // shared with a third party for approval
]);

export const quoteShares = pgTable(
  "quote_shares",
  {
    tokenHash: text("token_hash").primaryKey(),
    quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
    kind: quoteShareKindEnum("kind").notNull().default("customer"),
    sharedWithEmail: text("shared_with_email"), // only set for coordinator shares
    sharedByName: text("shared_by_name"),       // who shared (for coordinator emails)
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }), // when approved/rejected/accepted
    viewedAt: timestamp("viewed_at", { withTimezone: true }),     // first time the URL was opened
    actionTaken: text("action_taken"),  // 'accepted' | 'rejected' | 'shared_again' | null
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    quoteIdx: index("quote_shares_quote_idx").on(t.quoteId, t.kind),
  }),
);

/**
 * Log of every customer-facing email we've sent. Powers:
 *   - "We already emailed you a quote 2h ago" dedup
 *   - Open-rate tracking (via a pixel beacon, future)
 *   - Admin debugging ("did the customer get the confirmation?")
 */
export const customerEmails = pgTable(
  "customer_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // 'quote_received'|'quote_priced'|'reservation_confirmed'|'trip_complete'|'coordinator_share'
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull().default("sent"), // 'sent' | 'failed' | 'opened'
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (t) => ({
    siteCreatedIdx: index("customer_emails_site_idx").on(t.siteId, t.sentAt),
    customerIdx: index("customer_emails_customer_idx").on(t.customerId),
    quoteIdx: index("customer_emails_quote_idx").on(t.quoteId),
    reservationIdx: index("customer_emails_reservation_idx").on(t.reservationId),
  }),
);

// Note: drivers / siteDrivers / driver_sessions / driver_trip_events /
// driver_pin_attempts were removed 2026-05-26 — the platform is solo-operator;
// the admin manages every booking by hand. The underlying tables may still
// exist in the database as dormant rows; they're no longer referenced from
// TypeScript or any UI. If you need to physically drop them, do it manually.

/**
 * Build-research screenshots — captures of competitor sites the agent
 * studied during the global_research phase. Stored on disk under
 * SCREENSHOT_STORAGE_PATH/build-research/<projectId>/<hostname>.png and
 * served via /api/build/screenshots/[projectId]/[hostname].
 *
 * One row per (project, hostname). Status: pending | captured | failed.
 * Soft-fails — a capture failure doesn't block the build flow.
 */

// ============================================================================
// Phase 6 — SEO autopilot
// ----------------------------------------------------------------------------
// One AI agent runs scans across every site on a cron. Each scan produces
// `seo_findings` (issues discovered) and `seo_proposals` (concrete fixes the
// agent generated). Low-risk fixes (alt text, schema, OG tags) auto-apply
// and are logged in `seo_actions`. Higher-risk fixes (content rewrites,
// visual design) wait in the inbox for the admin to approve.
//
// Token spend per agent run is tracked in `ai_usage` so we can see real
// monthly cost per site and per audit kind.
// ============================================================================

export const seoAuditKindEnum = pgEnum("seo_audit_kind", [
  "technical",         // robots, sitemap, indexation, redirects, canonical, mixed content
  "on_page",           // titles, descriptions, headings, schema
  "alt_text",          // image alt audit (Phase 1)
  "content_quality",   // thin content, freshness, E-E-A-T (Phase 3)
  "content_gap",       // competitor SERP gap (Phase 3)
  "competitor",        // competitor teardown (Phase 4)
  "backlinks",         // link profile, toxic, gap (Phase 4)
  "accessibility",     // axe-core a11y scan (Phase 5)
  "image_opt",         // size/format/lazy-load (Phase 5)
  "local_seo",         // NAP, GBP, LocalBusiness schema (Phase 6)
  "core_web_vitals",   // CrUX + PSI (Phase 6)
  "security",          // headers, CVE feed (Phase 6)
  "visual_design",     // vision LLM diff vs reference (Phase 7)
  "ui_ux",             // heuristic CRO + form friction (Phase 7)
]);

export const seoAuditStatusEnum = pgEnum("seo_audit_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const seoSeverityEnum = pgEnum("seo_severity", [
  "info",     // FYI only, no fix needed
  "low",      // nice-to-have
  "medium",   // worth fixing soon
  "high",     // affects rankings or UX measurably
  "critical", // breaks the site / blocks indexation
]);

export const seoProposalKindEnum = pgEnum("seo_proposal_kind", [
  "alt_text",
  "meta_title",
  "meta_description",
  "schema_inject",
  "open_graph",
  "internal_link",
  "content_rewrite",
  "image_compress",
  "lazy_load",
  "aria_label",
  "focus_visible",
  "rel_noopener",
  "canonical",
  "redirect",
  "robots_txt",
  "sitemap_ping",
  "visual_css",      // Phase 7 — never auto, always proposal
]);

export const seoProposalStatusEnum = pgEnum("seo_proposal_status", [
  "pending",   // queued in inbox, waiting on admin
  "approved",  // admin clicked apply, about to execute
  "applied",   // successfully written to WP
  "rejected",  // admin clicked reject
  "failed",    // tried to apply, WP plugin returned an error
  "stale",     // superseded by a newer proposal for the same target
]);

export const seoAudits = pgTable(
  "seo_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: seoAuditKindEnum("kind").notNull(),
    status: seoAuditStatusEnum("status").notNull().default("queued"),
    // Trigger source: 'cron', 'manual', 'api'. Lets us see who/what started it.
    trigger: text("trigger").notNull().default("cron"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    // Aggregate counts denormalized for quick dashboard rendering.
    findingsCount: integer("findings_count").notNull().default(0),
    proposalsCount: integer("proposals_count").notNull().default(0),
    autoAppliedCount: integer("auto_applied_count").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteKindIdx: index("seo_audits_site_kind_idx").on(t.siteId, t.kind, t.createdAt),
    statusIdx: index("seo_audits_status_idx").on(t.status, t.createdAt),
  }),
);

export const seoFindings = pgTable(
  "seo_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id").notNull().references(() => seoAudits.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    severity: seoSeverityEnum("severity").notNull().default("medium"),
    // Short rule identifier (e.g. "alt-text-missing", "meta-desc-too-long").
    // Same rule across runs uses the same code so we can dedupe / track fixes.
    code: text("code").notNull(),
    // Human-readable summary the inbox shows ("12 product images missing alt text on /our-fleet/").
    summary: text("summary").notNull(),
    // Where the issue lives — typically a public URL on the site. May be null
    // for site-wide findings (e.g. sitemap problems).
    url: text("url"),
    // WP attachment/post id when applicable, so apply can address it precisely.
    targetType: text("target_type"), // 'page' | 'post' | 'attachment' | 'site'
    targetId: text("target_id"),     // WP integer as text
    // Raw signals the agent gathered, for debugging + future re-evaluation.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditIdx: index("seo_findings_audit_idx").on(t.auditId),
    siteCodeIdx: index("seo_findings_site_code_idx").on(t.siteId, t.code, t.createdAt),
    siteSeverityIdx: index("seo_findings_site_severity_idx").on(t.siteId, t.severity, t.createdAt),
  }),
);

export const seoProposals = pgTable(
  "seo_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    findingId: uuid("finding_id").references(() => seoFindings.id, { onDelete: "set null" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: seoProposalKindEnum("kind").notNull(),
    status: seoProposalStatusEnum("status").notNull().default("pending"),
    // Whether this kind is allowed to auto-apply (computed at insert time from
    // the per-site policy). False here means it sits in the inbox regardless
    // of severity. True means the scan loop will apply it immediately.
    autoApply: boolean("auto_apply").notNull().default(false),
    // What the agent thinks it should change. Shape depends on `kind`:
    //   alt_text:         { attachment_id, alt }
    //   meta_title:       { post_id, before, after }
    //   meta_description: { post_id, before, after }
    //   schema_inject:    { post_id, schema_type, json_ld }
    //   content_rewrite:  { post_id, before, after, diff }
    //   visual_css:       { selector, before, after, screenshot_before, screenshot_after }
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    // One-paragraph "why this change" from the agent — shown in the inbox.
    rationale: text("rationale"),
    // The model that proposed it, so we can A/B which models produce
    // better-accepted suggestions over time.
    model: text("model").notNull(),
    // Token cost for *this proposal alone*, denormalized for cheap
    // per-proposal cost rendering. Detailed line items live in ai_usage.
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedBy: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedBy: uuid("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectReason: text("reject_reason"),
    errorMessage: text("error_message"),
    // V3 critic-LLM score (0-100) — null when critic wasn't run.
    criticConfidence: integer("critic_confidence"),
    criticIssues: jsonb("critic_issues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    // V5 sample-review queue.
    sampleForReview: boolean("sample_for_review").notNull().default(false),
    reviewVerdict: text("review_verdict"),    // 'up' | 'down' | null
    reviewReason: text("review_reason"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStatusIdx: index("seo_proposals_site_status_idx").on(t.siteId, t.status, t.createdAt),
    findingIdx: index("seo_proposals_finding_idx").on(t.findingId),
    inboxIdx: index("seo_proposals_inbox_idx").on(t.status, t.createdAt),
  }),
);

export const seoActions = pgTable(
  "seo_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").notNull().references(() => seoProposals.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: seoProposalKindEnum("kind").notNull(),
    // 'auto' (agent applied without admin) or 'manual' (admin approved).
    appliedVia: text("applied_via").notNull(),
    // What the WP plugin reported back. e.g. { ok: true, post_id: 123 }.
    pluginResponse: jsonb("plugin_response").$type<Record<string, unknown>>(),
    // V6 rollback support — captured before-state so we can reverse the change.
    snapshotBefore: jsonb("snapshot_before").$type<Record<string, unknown>>(),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
    rolledBackBy: uuid("rolled_back_by").references(() => users.id, { onDelete: "set null" }),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("seo_actions_site_idx").on(t.siteId, t.createdAt),
    proposalIdx: index("seo_actions_proposal_idx").on(t.proposalId),
  }),
);

// Per-agent token spend log. One row per Anthropic call across all SEO
// scans (and future agents — chat / audit / digest already live in
// chat_messages, but a unified ai_usage view becomes the source of truth
// for monthly cost dashboards).
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Which agent surface: 'seo_scan', 'seo_apply', 'chat', 'audit', 'digest'.
    agent: text("agent").notNull(),
    // Optional FK to the higher-level work item (e.g. a seo_audits id).
    parentType: text("parent_type"), // 'seo_audit' | 'chat_thread' | 'task_audit' | null
    parentId: uuid("parent_id"),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    // Cost denormalized at insert time using current pricing — lets us bill
    // a historical run accurately even if Anthropic changes its prices.
    // Stored as integer micro-dollars (USD × 1_000_000) for precision.
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentDateIdx: index("ai_usage_agent_date_idx").on(t.agent, t.createdAt),
    siteDateIdx: index("ai_usage_site_date_idx").on(t.siteId, t.createdAt),
    parentIdx: index("ai_usage_parent_idx").on(t.parentType, t.parentId),
  }),
);

// Per-site SEO autopilot policy. Singleton row per site (created lazily on
// first audit). Lets the admin opt sites in/out of each capability and set
// which proposal kinds auto-apply vs go to the inbox.
export const seoPolicies = pgTable(
  "seo_policies",
  {
    siteId: uuid("site_id")
      .primaryKey()
      .references(() => sites.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    // Per-capability switches. JSON shape: { alt_text: 'auto', meta_title: 'propose', visual_css: 'propose', ... }
    // Values: 'auto' (apply silently), 'propose' (inbox), 'off' (skip).
    capabilities: jsonb("capabilities").$type<Record<string, "auto" | "propose" | "off">>().notNull().default(sql`'{}'::jsonb`),
    // Domain-level overrides that the agent reads as ground truth. Free-form
    // text the admin types in /admin/seo/sites/<slug> — "we don't use
    // Italian on this site", "our brand voice is XYZ", etc.
    brandVoice: text("brand_voice"),
    // List of competitor domains used for content-gap + competitor-teardown
    // audits. One per line.
    competitors: text("competitors"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type Event = typeof events.$inferSelect;
export type User = typeof users.$inferSelect;
export type SiteUser = typeof siteUsers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type TaskAudit = typeof taskAudits.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AdminAction = typeof adminActions.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type LeadContactAttempt = typeof leadContactAttempts.$inferSelect;
export type UserPrefs = typeof userPrefs.$inferSelect;

export type DesktopSession = typeof desktopSessions.$inferSelect;
export type ScreenRecording = typeof screenRecordings.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type WpAdminGrant = typeof wpAdminGrants.$inferSelect;
export type IntegrationsAccount = typeof integrationsAccounts.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type TrafficSnapshot = typeof trafficSnapshots.$inferSelect;
export type PhoneNumber = typeof phoneNumbers.$inferSelect;
export type Call = typeof calls.$inferSelect;

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type Reservation = typeof reservations.$inferSelect;
export type NewReservation = typeof reservations.$inferInsert;
export type PricingRules = typeof pricingRules.$inferSelect;
export type PublicChatSession = typeof publicChatSessions.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type QuoteShare = typeof quoteShares.$inferSelect;
export type CustomerEmail = typeof customerEmails.$inferSelect;

export type SeoAudit = typeof seoAudits.$inferSelect;
export type NewSeoAudit = typeof seoAudits.$inferInsert;
export type SeoFinding = typeof seoFindings.$inferSelect;
export type NewSeoFinding = typeof seoFindings.$inferInsert;
export type SeoProposal = typeof seoProposals.$inferSelect;
export type NewSeoProposal = typeof seoProposals.$inferInsert;
export type SeoAction = typeof seoActions.$inferSelect;
export type NewSeoAction = typeof seoActions.$inferInsert;
export type AiUsage = typeof aiUsage.$inferSelect;
export type NewAiUsage = typeof aiUsage.$inferInsert;
export type SeoPolicy = typeof seoPolicies.$inferSelect;
export type NewSeoPolicy = typeof seoPolicies.$inferInsert;

/**
 * Outbound webhook subscribers. Each row = one external endpoint the
 * platform pushes events to (Slack incoming-webhook, Zapier catch hook,
 * n8n, custom). When a tracked event happens, every active subscriber
 * matching the event kind gets a POST with the event payload + an
 * HMAC signature derived from `secret`.
 */
export const webhookSubscribers = pgTable(
  "webhook_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),                  // "Slack #ops", "Zapier — sales"
    url: text("url").notNull(),                       // delivery URL
    secret: text("secret"),                           // optional shared secret for HMAC signing
    active: boolean("active").notNull().default(true),
    // Comma-separated list of event kinds this subscriber wants.
    // Empty / null = all events.
    events: text("events"),
    // Last delivery attempt outcome — used to surface "this hook is broken"
    // on the admin UI.
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index("webhook_subscribers_active_idx").on(t.active),
  }),
);

export type WebhookSubscriber = typeof webhookSubscribers.$inferSelect;
export type NewWebhookSubscriber = typeof webhookSubscribers.$inferInsert;

/**
 * Per-site widget theme — what the GYL Suite plugin renders forms in.
 *
 * One row per site. Agent extracts from the customer's site on connect
 * (and again whenever the brand visibly changes), admin can review and
 * tweak via /admin/sites/<slug>/brand, and the row gets pushed to the
 * plugin via the signed `theme_apply` channel.
 *
 * Six colour slots + two font slots + one radius — the minimum that
 * makes the form blend into most sites without us managing 50
 * theme tokens. Anything finer-grained is a CSS override the admin
 * writes by hand in the plugin's settings page.
 */
export const siteThemes = pgTable(
  "site_themes",
  {
    siteId: uuid("site_id")
      .primaryKey()
      .references(() => sites.id, { onDelete: "cascade" }),
    // Six colour slots, all hex (#RRGGBB) or rgba() strings.
    // `primary` is a Postgres reserved word — store as primary_color.
    primaryColor: text("primary_color").notNull(),
    primaryText: text("primary_text").notNull(),
    surface: text("surface").notNull(),
    surfaceText: text("surface_text").notNull(),
    accent: text("accent").notNull(),
    border: text("border").notNull(),
    // Typography — CSS font-family strings.
    fontFamilyBody: text("font_family_body").notNull(),
    fontFamilyHeading: text("font_family_heading").notNull(),
    borderRadiusPx: integer("border_radius_px").notNull().default(8),
    mode: text("mode").notNull().default("light"),    // light | dark | auto
    /**
     * Where the values came from. Lets the UI show "extracted from
     * homepage" vs "hand-edited by admin" — and lets the agent know
     * not to overwrite a manually-set theme on the next scan.
     */
    source: text("source").notNull().default("fallback_default"),
    /** Has this been pushed to the WP plugin? When and what response. */
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    applyError: text("apply_error"),
    /** Raw extraction payload — debug + future re-evaluation. */
    extractionMeta: jsonb("extraction_meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type SiteTheme = typeof siteThemes.$inferSelect;
export type NewSiteTheme = typeof siteThemes.$inferInsert;

/**
 * Validation pipeline — failures the agent's proposals never reached the
 * inbox because they couldn't make it past format / external / critic
 * checks. One row per failed attempt. Lets us see what mistakes the
 * agent makes most often, prompt-drift, etc.
 */
export const seoValidationFailures = pgTable(
  "seo_validation_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    validator: text("validator").notNull(),
    errors: jsonb("errors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sampleOutput: jsonb("sample_output").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    criticConfidence: integer("critic_confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteKindIdx: index("seo_validation_failures_site_kind_idx").on(t.siteId, t.kind, t.createdAt),
    validatorIdx: index("seo_validation_failures_validator_idx").on(t.validator, t.createdAt),
  }),
);
export type SeoValidationFailure = typeof seoValidationFailures.$inferSelect;

/**
 * Outcome tracking — V4. Periodic GSC snapshots of the affected URL
 * for a proposal, captured at 7 / 14 / 30 days after apply. Lets us
 * answer "did this rewrite actually help?" empirically.
 */
export const seoOutcomeSnapshots = pgTable(
  "seo_outcome_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").notNull().references(() => seoProposals.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    daysAfter: integer("days_after").notNull(),
    url: text("url").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    /** CTR × 1000 stored as int — keeps math integer-only. */
    ctrMilli: integer("ctr_milli").notNull().default(0),
    positionMilli: integer("position_milli").notNull().default(0),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    proposalIdx: index("seo_outcome_snapshots_proposal_idx").on(t.proposalId, t.daysAfter),
    siteIdx: index("seo_outcome_snapshots_site_idx").on(t.siteId, t.capturedAt),
  }),
);
export type SeoOutcomeSnapshot = typeof seoOutcomeSnapshots.$inferSelect;

/**
 * Page catalogue — one row per WP post/page on each customer site.
 * Populated by `npm run sync:inventory` which calls the plugin's
 * /seo-inventory endpoint. Drives the per-page design editor at
 * /admin/sites/[slug]/pages.
 */
export const sitePages = pgTable(
  "site_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** WP post ID — the canonical key on the WP side. */
    wpPostId: integer("wp_post_id").notNull(),
    slug: text("slug").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    postType: text("post_type").notNull(),
    status: text("status").notNull(),
    /** Last-modified timestamp from the WP side. */
    modifiedAt: timestamp("modified_at", { withTimezone: true }),
    wordCount: integer("word_count").notNull().default(0),
    hasDesignOverride: boolean("has_design_override").notNull().default(false),
    parentId: integer("parent_id").notNull().default(0),
    /** Sync metadata. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sitePostUq: uniqueIndex("site_pages_site_post_uq").on(t.siteId, t.wpPostId),
    siteSlugIdx: index("site_pages_site_slug_idx").on(t.siteId, t.slug),
    siteTypeIdx: index("site_pages_site_type_idx").on(t.siteId, t.postType, t.status),
  }),
);
export type SitePage = typeof sitePages.$inferSelect;

/**
 * P1 — Composite scoring system. One row per site per day per score.
 * Computed daily by `npm run scoring:compute`. Drives every dashboard
 * widget that says "78/100 trending down 4."
 *
 * Six scores: site_health, seo, design_freshness, competitor_pressure,
 *             content_decay, local_seo_completeness.
 */
export const siteScores = pgTable(
  "site_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    scoreKey: text("score_key").notNull(),
    /** Score 0-100. */
    value: integer("value").notNull(),
    /** What inputs went into this score, for explainability. JSON blob. */
    inputs: jsonb("inputs").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    /** ISO date string YYYY-MM-DD — one snapshot per site/key/day. */
    snapshotDate: text("snapshot_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteKeyDateUq: uniqueIndex("site_scores_site_key_date_uq").on(t.siteId, t.scoreKey, t.snapshotDate),
    siteKeyIdx: index("site_scores_site_key_idx").on(t.siteId, t.scoreKey, t.snapshotDate),
  }),
);
export type SiteScore = typeof siteScores.$inferSelect;

// ===== P2: Cross-site patterns + agent-generated tasks =====

/**
 * Patterns detected across the entire site network — e.g. "12 sites have
 * thin-content findings", "8 sites missing LocalBusiness schema", "5 sites
 * have no fixes applied in the last 30 days". Generated by the nightly
 * pattern-detect script.
 *
 * Each pattern has a kind, a severity, and a list of affected site IDs.
 * The agent may also create an associated `agent_task` row to give the
 * admin a one-click "do it everywhere" actionable item.
 */
export const sitePatterns = pgTable(
  "site_patterns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. 'finding_spike', 'no_fixes_applied', 'low_brand_coverage',
     *  'stuck_pages', 'score_decline', 'design_stale_network'.
     */
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("info"), // 'info'|'warning'|'critical'
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    /** Affected site IDs (array of uuid strings). */
    sitesAffected: jsonb("sites_affected").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Evidence — code, counts, percentiles. Tunable per kind. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("open"), // 'open'|'dismissed'|'resolved'
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedBy: uuid("dismissed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    kindStatusIdx: index("site_patterns_kind_status_idx").on(t.kind, t.status),
    detectedIdx: index("site_patterns_detected_idx").on(t.detectedAt),
  }),
);
export type SitePattern = typeof sitePatterns.$inferSelect;

/**
 * Agent-generated tasks — different from the human `tasks` table. These
 * are higher-level prompts the agent writes for the admin ("apply the
 * fix to these 12 sites", "review brand themes on these 5 sites", "look
 * at this pattern"). Surfaced on /admin/today + /admin/patterns.
 */
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Optional link back to the pattern that spawned the task. */
    patternId: uuid("pattern_id").references(() => sitePatterns.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // 'apply_fix_bulk', 'review_pattern', 'brand_refresh', 'opportunity'
    priority: text("priority").notNull().default("normal"), // 'high'|'normal'|'low'
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** Suggested CTA — JSON blob with action + params (e.g. {action: 'open', href: '/admin/seo'}). */
    cta: jsonb("cta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("proposed"), // 'proposed'|'in_progress'|'done'|'dismissed'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    statusIdx: index("agent_tasks_status_idx").on(t.status, t.priority),
    patternIdx: index("agent_tasks_pattern_idx").on(t.patternId),
  }),
);
export type AgentTask = typeof agentTasks.$inferSelect;

// ===== P3: Screenshot history + visual regression =====

/**
 * Visual snapshot of a site's key URL captured by the headless-browser
 * cron. Stored as a relative path under `SCREENSHOT_STORAGE_PATH` (default
 * `.data/screenshots`) so we don't bloat the DB.
 *
 * The capture script also computes a perceptual hash + per-row diff
 * percentage against the previous snapshot of the same (site, url). When
 * the diff exceeds the configured threshold we flag it on the site
 * detail page so the admin can review whether the visual change was
 * intentional.
 */
export const siteScreenshots = pgTable(
  "site_screenshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** 'home' | 'booking' | 'service' | custom. */
    label: text("label").notNull().default("home"),
    /** 'desktop' | 'mobile' | 'tablet'. */
    viewport: text("viewport").notNull().default("desktop"),
    /** Relative path to the PNG on disk. */
    pngPath: text("png_path").notNull(),
    /** Pixel width × height of the captured viewport. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** SHA-256 of the PNG bytes for dedup. */
    sha256: text("sha256").notNull(),
    /** Difference vs previous capture of same (site, url, viewport), 0-100. */
    diffPct: integer("diff_pct"),
    /** 'ok' | 'changed' | 'major_change' — driven by diffPct thresholds. */
    status: text("status").notNull().default("ok"),
    /** Optional admin verdict on a flagged change. */
    reviewed: boolean("reviewed").notNull().default(false),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCapturedIdx: index("site_screenshots_site_captured_idx").on(t.siteId, t.capturedAt),
    siteUrlIdx: index("site_screenshots_site_url_idx").on(t.siteId, t.url, t.viewport),
    statusIdx: index("site_screenshots_status_idx").on(t.status, t.capturedAt),
  }),
);
export type SiteScreenshot = typeof siteScreenshots.$inferSelect;

// ===== P4: Content pipeline state machine =====

/**
 * Editorial workflow for a piece of content. Each row walks through:
 *
 *   brief → drafting → review → approved → published
 *                                ↑           ↓
 *                                └─ archived ┘
 *
 * Transitions are validated by the server actions in
 * `src/app/actions/content-pipeline.ts`. The `transitions` jsonb is an
 * append-only log of who-moved-it-when for accountability.
 */
export const contentBriefs = pgTable(
  "content_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** SEO target — primary keyword + page type tag. */
    title: text("title").notNull(),
    targetKeyword: text("target_keyword"),
    contentType: text("content_type").notNull().default("post"), // 'post' | 'page'
    /** Markdown brief written by admin or generated by agent. */
    briefMarkdown: text("brief_markdown").notNull().default(""),
    /** Draft body — Markdown — produced by agent or written by hand. */
    draftMarkdown: text("draft_markdown").notNull().default(""),
    /** Editor's review notes — visible alongside the draft. */
    reviewNotes: text("review_notes").notNull().default(""),
    /** Pipeline state. */
    status: text("status").notNull().default("brief"),
    // ----- Brief-first content engine (Phase 1) plan fields -----
    // Populated by proposeBriefAction; the structured BRIEF object that a
    // Phase-2 generate-from-brief job expands into a publish-ready page.
    /** Page-type: home|service|area|blog|about|contact|pricing|faq. */
    pageType: text("page_type"),
    /** Resolved search intent for the target keyword. */
    intent: text("intent"),
    /** Defensible word-count band {min,max}. */
    wordCountTarget: jsonb("word_count_target").$type<{ min: number; max: number }>(),
    /** 3 headline options. */
    headlineOptions: jsonb("headline_options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Meta-title options. */
    metaTitleOptions: jsonb("meta_title_options").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Ordered H2/H3 outline with purpose + pillars covered. */
    outline: jsonb("outline").$type<Array<{ h2: string; h3: string[]; purpose: string; pillarsCovered: string[] }>>().notNull().default(sql`'[]'::jsonb`),
    /** Modern schema plan {types, notes, avoid}. */
    schemaPlan: jsonb("schema_plan").$type<{ types: string[]; notes: string[]; avoid: string[] }>(),
    /** Answer-first block engineered for AI-Overview citation. */
    aiOverviewBlock: text("ai_overview_block"),
    /** Grounded geo entities (real neighborhoods/landmarks only). */
    geoEntities: jsonb("geo_entities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Internal-link targets. */
    internalLinkTargets: jsonb("internal_link_targets").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** AI-Overview readiness score (0-100) — structuring score, not a guarantee. */
    aiOverviewScore: integer("ai_overview_score"),
    /** Pillar checklist (7 local-SEO pillars) + per-pillar satisfaction note. */
    pillarChecklist: jsonb("pillar_checklist").$type<Array<{ pillar: string; label: string; satisfied: boolean; note: string }>>().notNull().default(sql`'[]'::jsonb`),
    /** Harvested keywords grouped by head/long-tail/question/near-me/AIO. */
    keywordHarvest: jsonb("keyword_harvest").$type<Record<string, unknown>>(),
    /** Business vertical the brief was built for. */
    vertical: text("vertical"),
    /** Facts the brief WANTED but the site lacks — never invented. */
    needsBusinessFacts: jsonb("needs_business_facts").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** V3 critic-LLM verdict (0-100). Null when the critic hasn't been run yet. */
    criticConfidence: integer("critic_confidence"),
    /** Specific issues the critic flagged in the brief markdown. */
    criticIssues: jsonb("critic_issues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** When the critic last ran. Used to block stale verdicts. */
    criticReviewedAt: timestamp("critic_reviewed_at", { withTimezone: true }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** When published, the WP post ID returned by the plugin. */
    wpPostId: integer("wp_post_id"),
    /** Append-only transition log — newest entries at the end. */
    transitions: jsonb("transitions").$type<Array<{
      from: string;
      to: string;
      at: string;
      by: string | null;
      note?: string;
    }>>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStatusIdx: index("content_briefs_site_status_idx").on(t.siteId, t.status),
    assigneeIdx: index("content_briefs_assignee_idx").on(t.assigneeId, t.status),
    statusIdx: index("content_briefs_status_idx").on(t.status, t.dueAt),
  }),
);
export type ContentBrief = typeof contentBriefs.$inferSelect;
export type NewContentBrief = typeof contentBriefs.$inferInsert;

// ===== P5: Local SEO / GBP center =====

/**
 * Google Business Profile (formerly Google My Business) fields for each
 * site. We store these locally because the official GBP API requires
 * Google review of the app — instead the admin pastes / edits the fields
 * here and we use them as ground-truth for citations + NAP consistency
 * checks across the WP site, schema.org LD-JSON, and external listings.
 */
export const siteGbp = pgTable("site_gbp", {
  siteId: uuid("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
  /** Canonical business name — used in citations + LocalBusiness schema. */
  businessName: text("business_name"),
  /** NAP — Name / Address / Phone, the heart of local SEO. */
  street: text("street"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  country: text("country").default("CA"),
  phone: text("phone"),
  altPhone: text("alt_phone"),
  /** Public-facing email + website. */
  publicEmail: text("public_email"),
  website: text("website"),
  /** GBP profile URL — what Google shows in maps + the knowledge panel. */
  gbpProfileUrl: text("gbp_profile_url"),
  /** Service areas — JSON array of city/region strings. */
  serviceAreas: jsonb("service_areas").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Categories — primary + secondary (GBP allows up to 9). */
  categories: jsonb("categories").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** Hours of operation — JSON {mon: "9-17", ...}. */
  hours: jsonb("hours").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
  /** Lat/long — for geo-based queries + LocalBusiness schema. */
  latitude: text("latitude"),
  longitude: text("longitude"),
  /** Last review count + rating snapshot — admin pastes after checking GBP. */
  ratingCount: integer("rating_count"),
  ratingValue: text("rating_value"), // "4.7"
  /** Admin notes — anything the agent should know about this listing. */
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SiteGbp = typeof siteGbp.$inferSelect;

/**
 * Citation tracker — the 50-ish directories where the business should be
 * listed (Yelp, Bing Places, Apple Maps, etc.). Each row is one
 * (site, directory) pair with the listing URL + last-verified date.
 */
export const siteCitations = pgTable(
  "site_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    directory: text("directory").notNull(), // 'yelp' | 'bing_places' | 'apple_maps' | 'yellowpages_ca' | ...
    status: text("status").notNull().default("not_started"), // 'not_started'|'claimed'|'verified'|'inconsistent'|'rejected'
    listingUrl: text("listing_url"),
    napMatch: boolean("nap_match"),
    notes: text("notes"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteDirUq: uniqueIndex("site_citations_site_dir_uq").on(t.siteId, t.directory),
    statusIdx: index("site_citations_status_idx").on(t.status),
  }),
);
export type SiteCitation = typeof siteCitations.$inferSelect;

// ===== P6: Prompt library + SOPs =====

/**
 * Versioned prompts the agent uses. Each "slot" (e.g. 'seo_meta_title',
 * 'content_brief_draft') has many versions; one is marked active at a
 * time. Inactive versions stick around so the admin can roll back or
 * see the diff.
 */
export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable slot key — code references this. */
    slot: text("slot").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    /** Markdown body — the actual prompt. May contain `{{placeholder}}` tokens. */
    body: text("body").notNull(),
    /** Active version for this slot. */
    isActive: boolean("is_active").notNull().default(false),
    /** Monotonic version per slot. */
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slotIdx: index("prompt_templates_slot_idx").on(t.slot, t.isActive),
    slotVersionUq: uniqueIndex("prompt_templates_slot_version_uq").on(t.slot, t.version),
  }),
);
export type PromptTemplate = typeof promptTemplates.$inferSelect;

/**
 * Standard operating procedures — short markdown documents that the team
 * (and the AI assistant when chatting) can reference. Searchable.
 */
export const sops = pgTable(
  "sops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("general"), // 'seo' | 'content' | 'ops' | 'support' | 'general'
    body: text("body").notNull().default(""),
    /** Optional tags — searchable array. */
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Pinned SOPs appear at the top. */
    pinned: boolean("pinned").notNull().default(false),
    /** Make available to scoped (non-admin) users. */
    visibleToTeam: boolean("visible_to_team").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUq: uniqueIndex("sops_slug_uq").on(t.slug),
    categoryIdx: index("sops_category_idx").on(t.category),
    pinnedIdx: index("sops_pinned_idx").on(t.pinned, t.updatedAt),
  }),
);
export type Sop = typeof sops.$inferSelect;
export type NewSop = typeof sops.$inferInsert;

// ===== Phase A: Claude Code subagent jobs queue =====

/**
 * Long-running jobs dispatched to a Claude Code worker (CLI running on the
 * admin's Mac on their Claude subscription, or eventually on the VPS).
 *
 * The portal enqueues a job; the worker polls /api/claude-jobs/claim,
 * runs `claude --print` with a structured prompt, and posts results
 * back via /api/claude-jobs/<id>/complete.
 *
 * Heavy / research-intensive work goes here instead of the per-token
 * Anthropic API path:
 *   - Site audits with deep page-by-page reads
 *   - Competitor teardowns with live URL browsing
 *   - Long-form content drafts
 *   - Per-site Design DNA research
 *   - Generation of 3-5 distinct design variants
 */
/**
 * Where this job is allowed to run.
 *   - 'mac' = Claude Code worker on operator's Mac (uses subscription, $0 cost)
 *   - 'server' = server-side Anthropic API executor (paid)
 *   - 'any' = whichever picks it up first (legacy default, mostly for chat ops)
 *
 * Default for build:*, static_site:*, and seo-audit cron jobs is 'mac' so they
 * route to the subscription. Server executor only claims 'mac' jobs after they
 * sit unclaimed for >5 minutes (stale fallback so jobs never stall).
 */
export const claudeJobs = pgTable(
  "claude_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Template key — drives the prompt + expected output shape. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** Optional site scope. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    /** Input params (template-specific JSON). */
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** Status: pending → claimed → running → done | failed | cancelled. */
    status: text("status").notNull().default("pending"),
    priority: text("priority").notNull().default("normal"), // 'high' | 'normal' | 'low'
    /** Structured result (template-specific JSON). */
    output: jsonb("output").$type<Record<string, unknown>>(),
    /** Human-readable Markdown result (always present on success). */
    outputMarkdown: text("output_markdown"),
    /** Optional artifacts list — relative paths or URLs to files the worker produced. */
    artifacts: jsonb("artifacts").$type<Array<{ name: string; url?: string; bytes?: number }>>().notNull().default(sql`'[]'::jsonb`),
    /** Which worker claimed it (set on claim). */
    workerId: text("worker_id"),
    /** Worker's reported version/host for audit. */
    workerInfo: jsonb("worker_info").$type<Record<string, unknown>>(),
    /**
     * Routing preference — 'mac' | 'server' | 'any'. Mac worker prefers
     * 'mac' jobs first. Server executor skips 'mac' jobs unless they're
     * stale (> 5 min) so they don't burn API tokens that Claude Code
     * subscription could have covered.
     */
    preferWorker: text("prefer_worker").notNull().default("any"),
    /**
     * Where the job came from — 'manual' | 'scheduled' | 'scout' | 'cloud-seo'
     * | 'auto' | 'system'. Manual = an operator clicked assign on the Scout
     * hub. Scheduled = the agent_schedules cron fired. Scout = per-agent
     * dispatch from /admin/scout. Cloud-seo = one of the /admin/cloud-seo
     * tool pages. Auto = platform-wide cron (health sweeps, seo scans). System
     * = internal maintenance. Used for filtering + trigger badges in the UI.
     */
    triggerSource: text("trigger_source").notNull().default("system"),
    /** Token/cost metadata reported by the worker (optional). */
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
export type ClaudeJob = typeof claudeJobs.$inferSelect;
export type NewClaudeJob = typeof claudeJobs.$inferInsert;

/**
 * SEO agent roster — user-editable rows for every agent shown on
 * /admin/agent/jobs. Built-in agents are seeded on first read
 * (see src/lib/agent-roster.ts → ensureBuiltInAgents). Custom
 * agents are inserted through /admin/agent/roster/new.
 */
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    focus: text("focus"),
    skillInstructions: text("skill_instructions"),
    isCustom: boolean("is_custom").notNull().default(false),
    /** Deactivated agents show as OFF on the hero and don't receive dispatched work. */
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    customIdx: index("agent_profiles_custom_idx").on(t.isCustom, t.createdAt),
  }),
);
export type AgentProfile = typeof agentProfiles.$inferSelect;

/**
 * Agent-scoped scheduled tasks. Each row is a one-shot ("run at time T") or
 * a simple recurring ("every N minutes/hours/days") task the operator wants
 * an agent to run without manual clicking. The cron runner reads pending
 * rows and enqueues them as claude_jobs at fire time.
 *
 * Kept separate from the network's generic `scheduled_workflows` (which
 * requires a siteId or projectId) because agent tasks aren't tied to a
 * specific site — they belong to an agent.
 */
export const agentSchedules = pgTable(
  "agent_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agentProfiles.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    /** ISO8601 timestamp; when the next run should fire. */
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }).notNull(),
    /** Optional recurrence — 'once' | 'daily' | 'weekly' | 'monthly'. */
    recurrence: text("recurrence").notNull().default("once"),
    enabled: boolean("enabled").notNull().default(true),
    lastFireAt: timestamp("last_fire_at", { withTimezone: true }),
    lastJobId: uuid("last_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    fireCount: integer("fire_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index("agent_schedules_agent_idx").on(t.agentId, t.nextFireAt),
    nextIdx: index("agent_schedules_next_idx").on(t.enabled, t.nextFireAt),
  }),
);
export type AgentSchedule = typeof agentSchedules.$inferSelect;

/**
 * File attachments for a claude_jobs row. Files live on disk under
 * ATTACHMENT_STORAGE_PATH (default ./.data/agent-task-attachments/).
 * `storagePath` is relative to that root.
 */
export const jobAttachments = pgTable(
  "job_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => claudeJobs.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdx: index("job_attachments_job_idx").on(t.jobId, t.createdAt),
  }),
);
export type JobAttachment = typeof jobAttachments.$inferSelect;

// ===== Build-a-site workspace =====

/**
 * One row per "build me a new website" project. Walks through
 * phases (brief → research → dna → sitemap → pages → review → deploy →
 * live). Each phase backed by one or more claude_jobs.
 */
export const siteBuildProjects = pgTable(
  "site_build_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Slug — what becomes the eventual site slug after deploy. */
    slug: text("slug").notNull(),
    /** Business name + customer-facing branding. */
    businessName: text("business_name").notNull(),
    domain: text("domain"),
    city: text("city"),
    region: text("region"),
    /** Business niche / industry the operator typed (e.g. "dental clinic", "law firm", "HVAC contractor"). Drives keyword + content + design. */
    niche: text("niche"),
    /** Service mix — JSON array: ["airport","wedding","corporate","prom","hourly","bus"]. */
    services: jsonb("services").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 'agent_draft' = let the agent write · 'user_provided' = use my content
     *  · 'hybrid' = my outline, agent expands. */
    contentSource: text("content_source").notNull().default("agent_draft"),
    /** User-pasted content / notes / brand voice / inspiration links. */
    contentNotes: text("content_notes"),
    /** Design preference: 'global_research' (default — survey worldwide) or 'specific_examples' */
    designMode: text("design_mode").notNull().default("global_research"),
    /** User-pasted reference URLs for inspiration (one per line). */
    inspirationUrls: text("inspiration_urls"),
    /** Phase: 'brief'|'research'|'dna'|'sitemap'|'pages'|'review'|'deploy'|'live'|'archived' */
    phase: text("phase").notNull().default("brief"),
    /** When phase=live, link to the live sites.id row. */
    publishedSiteId: uuid("published_site_id").references(() => sites.id, { onDelete: "set null" }),
    /** Phase outputs — populated as jobs complete. */
    research: jsonb("research").$type<Record<string, unknown>>(),
    designDna: jsonb("design_dna").$type<Record<string, unknown>>(),
    sitemap: jsonb("sitemap").$type<Record<string, unknown>>(),
    qualityReport: jsonb("quality_report").$type<Record<string, unknown>>(),
    /**
     * Real-world facts the operator pastes in BEFORE pages get generated.
     * The page-generate template bakes these into every page so the AI
     * writes from actual data (prices, drivers, neighborhoods, fleet)
     * instead of generic limo prose — the #1 lever against Google's
     * "scaled content abuse" classifier.
     *
     * Shape (all optional):
     *   {
     *     hourly_rates: { sedan: 95, suv: 125, stretch_limo: 175, sprinter: 215 },
     *     minimum_hours: 2,
     *     fleet: [{ make, model, year, capacity, photo_url?, notes? }],
     *     drivers: [{ name, years_experience, languages, specialties }],
     *     service_areas: [{ neighborhood, typical_pickup_min, notes }],
     *     licenses: [{ kind, number }],
     *     associations: [{ name, since }],
     *     aggregate_rating: { value, count, source },
     *     real_photos: [{ url, caption, page_hint }],
     *     about_url, contact_phone, contact_email, address
     *   }
     */
    businessFacts: jsonb("business_facts").$type<Record<string, unknown>>(),
    /**
     * Site Builder Studio — per-page-type LOCKED design template. When the
     * operator "locks" a page type in the Studio, the representative page's
     * section layout (and optional palette) is stored here and replicated to
     * every page of that type. Shape: { [pageType]: { sections: StudioSection[], palette?: StudioPalette } }
     */
    lockedDesigns: jsonb("locked_designs").$type<Record<string, unknown>>(),
    /** Studio palette override (derived from designDna by default). StudioPalette shape — see src/lib/site-renderer.ts. */
    studioPalette: jsonb("studio_palette").$type<Record<string, unknown>>(),
    /** Global sections — a design chosen ONCE and applied to that slot on every
     * page type (header, footer, hero, our-services, fleet, areas…). Shape:
     * { [sectionType]: { selectionId: string } }. Overrides per-page choice. */
    globalSections: jsonb("global_sections").$type<Record<string, { selectionId: string }>>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("site_build_projects_slug_uq").on(t.slug),
    phaseIdx: index("site_build_projects_phase_idx").on(t.phase, t.updatedAt),
  }),
);
export type SiteBuildProject = typeof siteBuildProjects.$inferSelect;
export type NewSiteBuildProject = typeof siteBuildProjects.$inferInsert;

/**
 * One page in the build project. Each page is generated by its own
 * `build:page_generate` claude_job. When the project deploys, each page
 * is pushed to WordPress via the GYL Suite plugin.
 */
export const siteBuildPages = pgTable(
  "site_build_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    /** URL slug — e.g. "wedding-limo-toronto" or "/" for home. */
    pageSlug: text("page_slug").notNull(),
    /** 'home'|'service'|'service_area'|'fleet'|'about'|'contact'|'blog'|'faq' */
    pageType: text("page_type").notNull(),
    title: text("title").notNull(),
    h1: text("h1"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    /** Final Markdown body. */
    bodyMarkdown: text("body_markdown"),
    /** Generated HTML body (after MD render — what gets pushed to WP). */
    bodyHtml: text("body_html"),
    /**
     * Site Builder Studio — ordered section layout for this page.
     * Array of StudioSection: { type: string; enabled: boolean; variantSelectionId: string | null; order: number }.
     * NULL until the operator opens the page in the Studio (falls back to the
     * canonical default for its pageType — see src/lib/page-section-specs.ts).
     */
    sections: jsonb("sections").$type<Array<{ type: string; enabled: boolean; variantSelectionId: string | null; order: number }>>(),
    /** JSON-LD schema blocks for the page (LocalBusiness/Service/FAQPage/etc.). */
    schemaJson: jsonb("schema_json").$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
    /** AI-Overview readiness score 0-100. */
    aiOverviewScore: integer("ai_overview_score"),
    /** Technical SEO score 0-100. */
    seoScore: integer("seo_score"),
    /** 'pending'|'generating'|'ready'|'edited'|'published'|'failed' */
    status: text("status").notNull().default("pending"),
    /** The claude_job that produced this page. */
    jobId: uuid("job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    /** After publish, the WP post ID returned by the plugin. */
    wpPostId: integer("wp_post_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("site_build_pages_project_idx").on(t.projectId, t.sortOrder),
    projectSlugUq: uniqueIndex("site_build_pages_project_slug_uq").on(t.projectId, t.pageSlug),
  }),
);
export type SiteBuildPage = typeof siteBuildPages.$inferSelect;
export type NewSiteBuildPage = typeof siteBuildPages.$inferInsert;

/**
 * Build-research screenshots — captures of every competitor site the agent
 * studied during the global_research phase. The chat agent shows them inline
 * via `list_research_competitors` so the operator can visually compare.
 *
 * One row per (project, hostname). Files stored on disk under
 * SCREENSHOT_STORAGE_PATH/build-research/<projectId>/<hostname>.png and
 * served via /api/build/screenshots/[projectId]/[hostname].
 */
export const buildResearchScreenshots = pgTable(
  "build_research_screenshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    /** Path relative to SCREENSHOT_STORAGE_PATH/build-research/. e.g. "<projectId>/<hostname>.png". */
    filePath: text("file_path"),
    bytes: integer("bytes"),
    /** 'pending' | 'captured' | 'failed' */
    status: text("status").notNull().default("pending"),
    error: text("error"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("build_research_screenshots_project_idx").on(t.projectId, t.status),
    projectHostUq: uniqueIndex("build_research_screenshots_project_host_uq").on(t.projectId, t.hostname),
  }),
);
export type BuildResearchScreenshot = typeof buildResearchScreenshots.$inferSelect;
export type NewBuildResearchScreenshot = typeof buildResearchScreenshots.$inferInsert;

/**
 * Staged publish queue. Pages don't publish immediately when marked ready —
 * the operator schedules each one through this table. A cron worker
 * (`src/scripts/publish-scheduled.ts`) wakes up every minute, finds rows
 * whose `scheduled_at` has passed, and runs them through the WP deploy
 * path. Enforces a cadence cap (max 8 publishes per 7-day window per
 * project) to avoid the "scaled content abuse" pattern Google penalizes.
 */
export const publishSchedule = pgTable(
  "publish_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => siteBuildPages.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    /** When to publish. Worker picks up any row where scheduled_at <= now() AND status='scheduled'. */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled' */
    status: text("status").notNull().default("scheduled"),
    /** Output of the qualifying gauntlet, captured at schedule time + re-run at publish time. */
    gauntletReport: jsonb("gauntlet_report").$type<Record<string, unknown>>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** WP post ID returned by the plugin. */
    wpPostId: integer("wp_post_id"),
    /** Last error if publish failed. */
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("publish_schedule_status_idx").on(t.status, t.scheduledAt),
    projectIdx: index("publish_schedule_project_idx").on(t.projectId, t.status),
    pageUq: uniqueIndex("publish_schedule_page_uq").on(t.pageId), // one schedule entry per page
  }),
);
export type PublishScheduleEntry = typeof publishSchedule.$inferSelect;
export type NewPublishScheduleEntry = typeof publishSchedule.$inferInsert;

/**
 * Performance snapshots for every published build page. Cron snapshots
 * impressions / clicks / avg position from Google Search Console at
 * 14, 30, 60, and 90 days after publish. If a snapshot at 30d shows
 * < threshold impressions OR if rank between two snapshots drops by
 * > 50%, the monitor re-queues the page for AI Overview re-audit
 * (creates a chat notification). At 90d if still underperforming,
 * status reverts to 'edited' (effectively pulling it from public
 * indexing on next plugin sync).
 */
export const buildPagePerformanceSnapshots = pgTable(
  "build_page_performance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id").notNull().references(() => siteBuildPages.id, { onDelete: "cascade" }),
    /** Days since publish at snapshot time. Always 14, 30, 60, or 90. */
    daysSincePublish: integer("days_since_publish").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    avgPosition: integer("avg_position"),
    /** 'ok' | 'underperforming' | 'rolled_back' | 'gsc_not_connected' */
    verdict: text("verdict").notNull().default("ok"),
    notes: text("notes"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageIdx: index("build_page_perf_page_idx").on(t.pageId, t.daysSincePublish),
    pageDayUq: uniqueIndex("build_page_perf_page_day_uq").on(t.pageId, t.daysSincePublish),
  }),
);
export type BuildPagePerformanceSnapshot = typeof buildPagePerformanceSnapshots.$inferSelect;
export type NewBuildPagePerformanceSnapshot = typeof buildPagePerformanceSnapshots.$inferInsert;

// ===== A2: Design QA Suite =====

/**
 * One QA run = a batch of checks against one scope (site, page, or variant).
 * Triggered on-demand, before any agent-generated change is published, or
 * nightly via cron for every connected site.
 */
export const qaRuns = pgTable(
  "qa_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'site' = full site · 'page' = single URL · 'variant' = unpublished design. */
    scope: text("scope").notNull(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    /** Optional URL (for 'page' scope) or variant ref (for 'variant' scope). */
    scopeRef: text("scope_ref"),
    status: text("status").notNull().default("pending"), // 'pending' | 'running' | 'done' | 'failed'
    /** Roll-up counts. */
    passCount: integer("pass_count").notNull().default(0),
    warnCount: integer("warn_count").notNull().default(0),
    failCount: integer("fail_count").notNull().default(0),
    summary: text("summary"),
    triggeredBy: uuid("triggered_by").references(() => users.id, { onDelete: "set null" }),
    triggerKind: text("trigger_kind").notNull().default("manual"), // 'manual' | 'cron' | 'pre_publish' | 'design_lab'
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("qa_runs_site_idx").on(t.siteId, t.createdAt),
    statusIdx: index("qa_runs_status_idx").on(t.status, t.createdAt),
  }),
);
export type QaRun = typeof qaRuns.$inferSelect;
export type NewQaRun = typeof qaRuns.$inferInsert;

/**
 * One row per (run × url × viewport × check_kind). The atomic unit of QA.
 */
export const qaChecks = pgTable(
  "qa_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => qaRuns.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** 'mobile' | 'tablet' | 'desktop' | 'wide'. */
    viewport: text("viewport").notNull(),
    /** Check identifier — see QA_CHECKS in src/lib/qa-checks.ts. */
    checkKind: text("check_kind").notNull(),
    /** Pass / warn / fail / skipped. */
    status: text("status").notNull(),
    /** Severity if not pass: 'low' | 'medium' | 'high' | 'critical'. */
    severity: text("severity"),
    /** Human-readable message — one short sentence. */
    message: text("message"),
    /** Evidence blob: element selector, computed values, screenshot path, network trace. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    durationMs: integer("duration_ms"),
    /** Reviewer can mark a known-false-positive. */
    suppressed: boolean("suppressed").notNull().default(false),
    suppressedBy: uuid("suppressed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("qa_checks_run_idx").on(t.runId, t.status),
    siteIdx: index("qa_checks_site_idx").on(t.siteId, t.checkKind, t.createdAt),
    kindStatusIdx: index("qa_checks_kind_status_idx").on(t.checkKind, t.status, t.createdAt),
  }),
);
export type QaCheck = typeof qaChecks.$inferSelect;
export type NewQaCheck = typeof qaChecks.$inferInsert;

// ────────────────────────────────────────────────────────────────────
// Widget configs (v0.10) — per-site overrides for the remote-loaded
// booking widget. Letting the admin tweak copy, chips, language, etc.
// from /admin/widget without re-uploading the WP plugin.
// ────────────────────────────────────────────────────────────────────
export const widgetConfigs = pgTable("widget_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" })
    .unique(),
  /** Default language code for this site. ISO 639-1 or "yue" for Cantonese. */
  language: text("language").notNull().default("en"),
  /** Chip presets — array of { label, pickup, dropoff }. Overrides the global defaults. */
  chips: jsonb("chips").$type<Array<{ label: string; pickup: string; dropoff: string }>>(),
  /**
   * Per-site copy overrides. Shape: same as DEFAULT_COPY[lang] but partial —
   * merged on top of the language default at read time. Lets the admin
   * customize headline/tagline/etc. per site without rewriting full strings.
   */
  copyOverrides: jsonb("copy_overrides").$type<Record<string, unknown>>(),
  /** Optional A/B variant slug. Multiple configs per site enabled later. */
  variant: text("variant").default("default"),
  /**
   * Per-site CSS override delivered with the widget config. Injected as a
   * <style> tag into the host page when the widget mounts. Used for hero
   * background images, layout tweaks, and per-site visual customizations
   * that can't be expressed via the brand-match palette.
   */
  customCss: text("custom_css"),
  /** Toggle widget on/off without deleting config. */
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});
export type WidgetConfig = typeof widgetConfigs.$inferSelect;
export type NewWidgetConfig = typeof widgetConfigs.$inferInsert;

/**
 * P2 — Keyword bank: cannibalization prevention + status tracking.
 *
 * Single source of truth for which keywords are queued, in-progress, covered,
 * or need refresh per build project. Pre-generation lookup prevents accidental
 * duplicate pages on the same SERP query.
 *
 * Populated by:
 *   - `build:keyword_research` (initial validation, status='queued')
 *   - `build:page_generate` (flips to 'in_progress' on claim, 'covered' on done)
 *   - `build:refresh_recommender` (flips 'covered' → 'refresh_needed')
 */
export const keywordBank = pgTable(
  "keyword_bank",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    /** 'queued' | 'in_progress' | 'covered' | 'refresh_needed' | 'dropped' */
    status: text("status").notNull().default("queued"),
    /** 'primary' (head term for a page) | 'secondary' (LSI / related, lives inside a page) */
    role: text("role").notNull().default("primary"),
    /** Page that targets this keyword. NULL while queued. */
    pageId: uuid("page_id").references(() => siteBuildPages.id, { onDelete: "set null" }),
    /** Validation snapshot fields (from build:keyword_research) */
    volumeTier: text("volume_tier"),
    volumeEstimate: text("volume_estimate"),
    difficulty: text("difficulty"),
    intent: text("intent"),
    hasLocalPack: boolean("has_local_pack"),
    topCompetitors: jsonb("top_competitors").$type<Array<{ domain: string; title: string }>>().notNull().default(sql`'[]'::jsonb`),
    /** Fan-out cluster — H2 questions that should appear AS SECTIONS inside the page. */
    fanOutKeywords: jsonb("fan_out_keywords").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 'keep' | 'merge' | 'rename' | 'drop' */
    recommendation: text("recommendation"),
    rationale: text("rationale"),
    sourceJobId: uuid("source_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    /** Refresh flagging */
    refreshReason: text("refresh_reason"),
    refreshFlaggedAt: timestamp("refresh_flagged_at", { withTimezone: true }),
    lastSerpCheckAt: timestamp("last_serp_check_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectStatusIdx: index("keyword_bank_project_status_idx").on(t.projectId, t.status, t.updatedAt),
    pageIdx: index("keyword_bank_page_idx").on(t.pageId),
  }),
);
export type KeywordBank = typeof keywordBank.$inferSelect;
export type NewKeywordBank = typeof keywordBank.$inferInsert;

/**
 * P4 — Content refresh queue: GSC-driven detection of pages that need rewriting.
 *
 * Populated weekly by a cron-fired refresh recommender that polls Google Search
 * Console for:
 *   - URLs with "Crawled, currently not indexed" status
 *   - URLs with impressions but average position > 10
 *   - URLs older than 12 months with declining click trend
 */
export const contentRefreshQueue = pgTable(
  "content_refresh_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").notNull().references(() => siteBuildPages.id, { onDelete: "cascade" }),
    /** 'deindexed' | 'low_ranking' | 'declining_traffic' | 'outdated_facts' | 'manual' */
    reason: text("reason").notNull(),
    /** 1 = fix this week, 5 = nice-to-have */
    priority: integer("priority").notNull().default(3),
    gscSnapshot: jsonb("gsc_snapshot").$type<Record<string, unknown>>(),
    /** 'pending' | 'queued' | 'in_progress' | 'completed' | 'skipped' */
    status: text("status").notNull().default("pending"),
    refreshJobId: uuid("refresh_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    projectIdx: index("content_refresh_project_idx").on(t.projectId, t.status, t.priority),
    pageIdx: index("content_refresh_page_idx").on(t.pageId, t.status),
  }),
);
export type ContentRefreshQueue = typeof contentRefreshQueue.$inferSelect;
export type NewContentRefreshQueue = typeof contentRefreshQueue.$inferInsert;

/**
 * P9 — Scheduled workflows.
 *
 * Operator-configured recurring jobs per project or site. The runner cron
 * (Phase 1.5c) sweeps this table every minute and fires any due rows.
 *
 * Common configurations:
 *   - "Publish next blog Monday 9am" → kind='build:page_generate',
 *     input={pageType:'blog'}, cron='0 9 * * 1'
 *   - "Run refresh recommender weekly" → kind='build:refresh_recommender',
 *     cron='0 8 * * 1'
 *   - "Site audit monthly" → kind='site_audit', cron='0 7 1 * *'
 */
export const scheduledWorkflows = pgTable(
  "scheduled_workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    jobKind: text("job_kind").notNull(),
    jobInput: jsonb("job_input").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** 5-field cron expression. */
    cronExpr: text("cron_expr").notNull(),
    timezone: text("timezone").notNull().default("Asia/Dubai"),
    /** 'mac' | 'server' | 'any' — default 'mac' to minimize API spend. */
    preferWorker: text("prefer_worker").notNull().default("mac"),
    enabled: boolean("enabled").notNull().default(true),
    nextFireAt: timestamp("next_fire_at", { withTimezone: true }),
    lastFireAt: timestamp("last_fire_at", { withTimezone: true }),
    lastJobId: uuid("last_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    fireCount: integer("fire_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nextFireIdx: index("scheduled_workflows_next_fire_idx").on(t.enabled, t.nextFireAt),
    projectIdx: index("scheduled_workflows_project_idx").on(t.projectId, t.enabled),
    siteIdx: index("scheduled_workflows_site_idx").on(t.siteId, t.enabled),
  }),
);
export type ScheduledWorkflow = typeof scheduledWorkflows.$inferSelect;
export type NewScheduledWorkflow = typeof scheduledWorkflows.$inferInsert;

// ════════════════════════════════════════════════════════════════════
// Local SEO Rubric Audits — mirror of the DDL in client.ts
// ════════════════════════════════════════════════════════════════════
export const localSeoRubricAudits = pgTable(
  "local_seo_rubric_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    pageId: uuid("page_id").references(() => sitePages.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => siteBuildProjects.id, { onDelete: "cascade" }),
    buildPageId: uuid("build_page_id").references(() => siteBuildPages.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'live' | 'build'
    url: text("url").notNull(),
    pageType: text("page_type").notNull(),
    primaryKeyword: text("primary_keyword"),
    city: text("city"),
    overallScore: integer("overall_score").notNull(),
    onPageScore: integer("on_page_score").notNull().default(0),
    structureScore: integer("structure_score").notNull().default(0),
    schemaScore: integer("schema_score").notNull().default(0),
    internalLinkingScore: integer("internal_linking_score").notNull().default(0),
    semanticScore: integer("semantic_score").notNull().default(0),
    antiDoorwayScore: integer("anti_doorway_score").notNull().default(0),
    findingsBlocking: integer("findings_blocking").notNull().default(0),
    findingsHigh: integer("findings_high").notNull().default(0),
    findingsMedium: integer("findings_medium").notNull().default(0),
    findingsLow: integer("findings_low").notNull().default(0),
    findings: jsonb("findings").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    judgeRan: boolean("judge_ran").notNull().default(false),
    judgeVerdicts: jsonb("judge_verdicts").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    judgeTokensInput: integer("judge_tokens_input"),
    judgeTokensOutput: integer("judge_tokens_output"),
    auditJobId: uuid("audit_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("local_seo_rubric_audits_site_idx").on(t.siteId, t.createdAt),
    pageIdx: index("local_seo_rubric_audits_page_idx").on(t.pageId, t.createdAt),
    projectIdx: index("local_seo_rubric_audits_project_idx").on(t.projectId, t.createdAt),
    buildPageIdx: index("local_seo_rubric_audits_build_page_idx").on(t.buildPageId, t.createdAt),
    scoreIdx: index("local_seo_rubric_audits_score_idx").on(t.siteId, t.overallScore),
  }),
);
export type LocalSeoRubricAudit = typeof localSeoRubricAudits.$inferSelect;
export type NewLocalSeoRubricAudit = typeof localSeoRubricAudits.$inferInsert;

// ============================================================================
// PHOTO STUDIO — Nano Banana (Gemini 2.5 Flash Image) integration   [PHOTO P1]
// ----------------------------------------------------------------------------
// Three tables + one anchor table:
//   - photo_templates       : prompt library, parametric ({city}, {vehicle}…)
//   - generated_images      : every image generated, with approval state
//   - photo_quota_usage     : per-day quota tracker (Gemini free tier = 500/day)
//   - photo_style_anchors   : per-site reference image for visual-DNA consistency
// ============================================================================

/**
 * Reusable prompt template. One row per slot purpose (hero, fleet-card, mid-1,
 * area-context, cta-bg, etc.). The `promptSkeleton` is interpolated with site
 * variables ({city}, {vehicle}, {landmark}, etc.) at generation time.
 */
export const photoTemplates = pgTable(
  "photo_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotKey: text("slot_key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Prompt body with {placeholders}. Supported tokens:
     *   {city}, {region}, {site_name}, {vehicle}, {vehicle_class},
     *   {landmark}, {airport}, {service}, {time_of_day}
     */
    promptSkeleton: text("prompt_skeleton").notNull(),
    styleHint: text("style_hint"),
    aspectRatio: text("aspect_ratio").notNull().default("16:9"),
    model: text("model").notNull().default("gemini-2.5-flash-image"),
    autoTrigger: boolean("auto_trigger").notNull().default(true),
    defaultVariants: integer("default_variants").notNull().default(2),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // $onUpdate fires on every Drizzle UPDATE so updated_at stays honest.
    // Raw SQL updates would need to set it explicitly.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    slotIdx: index("photo_templates_slot_idx").on(t.slotKey, t.isActive),
    activeIdx: index("photo_templates_active_idx").on(t.isActive, t.autoTrigger),
  }),
);
export type PhotoTemplate = typeof photoTemplates.$inferSelect;
export type NewPhotoTemplate = typeof photoTemplates.$inferInsert;

/**
 * One row per image generated by Nano Banana. Tracks approval state, storage
 * location, and (after publish) the WP media library reference for slot patching.
 */
export const generatedImages = pgTable(
  "generated_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** Optional page scope — null = "site-wide asset" (e.g. logo, brand shot). */
    pageId: uuid("page_id").references(() => sitePages.id, { onDelete: "set null" }),
    /** Loose ref to a build_pages row when triggered by a build job. */
    buildPageId: uuid("build_page_id"),
    slotKey: text("slot_key").notNull(),
    templateId: uuid("template_id").references(() => photoTemplates.id, { onDelete: "set null" }),
    /** Fully-resolved prompt sent to Gemini. */
    prompt: text("prompt").notNull(),
    variantIndex: integer("variant_index").notNull().default(0),
    /** Lifecycle: generated → approved | rejected → published */
    status: text("status").notNull().default("generated"),
    /** Local-relative path under `.data/photos/<siteSlug>/<id>.<ext>` */
    storagePath: text("storage_path").notNull(),
    /** URL served via `/api/photos/file/[id]` (signed by photo-storage.ts). */
    publicUrl: text("public_url").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),
    /** After publish — WP media library reference for slot patching. */
    wpMediaId: integer("wp_media_id"),
    wpMediaUrl: text("wp_media_url"),
    model: text("model").notNull().default("gemini-2.5-flash-image"),
    /** USD micro-cents (1_000_000 = $1.00). Free tier = 0; future-proof for paid usage. */
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    /** Anchor reference image used (visual-DNA consistency, Phase 5). */
    referenceImageUrl: text("reference_image_url"),
    jobId: uuid("job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    error: text("error"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => ({
    siteIdx: index("generated_images_site_idx").on(t.siteId, t.generatedAt),
    siteStatusIdx: index("generated_images_site_status_idx").on(t.siteId, t.status, t.generatedAt),
    pageIdx: index("generated_images_page_idx").on(t.pageId, t.status),
    buildPageIdx: index("generated_images_build_page_idx").on(t.buildPageId, t.status),
    slotIdx: index("generated_images_slot_idx").on(t.slotKey, t.status),
    // Idempotency key for stale-reclaim — same (job, variant) cannot be written twice.
    jobVariantUq: uniqueIndex("generated_images_job_variant_uq")
      .on(t.jobId, t.variantIndex)
      .where(sql`job_id IS NOT NULL`),
  }),
);
export type GeneratedImage = typeof generatedImages.$inferSelect;
export type NewGeneratedImage = typeof generatedImages.$inferInsert;

/**
 * Per-day quota tracker. Gemini AI Studio free tier = 500 image-gen requests
 * per day per project. One row per (day, site_id?) — site_id null = global counter.
 */
export const photoQuotaUsage = pgTable(
  "photo_quota_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** ISO date (YYYY-MM-DD) in UTC. */
    day: text("day").notNull(),
    /** Null = global daily counter. Non-null = per-site sub-counter. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    imagesGenerated: integer("images_generated").notNull().default(0),
    imagesFailed: integer("images_failed").notNull().default(0),
    creditsUsed: integer("credits_used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // Postgres treats NULLs as distinct in plain UNIQUE — so we use TWO partial
    // unique indexes here to enforce singleton rows per (day) and per (day, site_id).
    // Names MUST match the raw DDL in client.ts ensureSchema() so drizzle-kit doesn't
    // think they've drifted and try to recreate them on prod migrate.
    perSiteUq: uniqueIndex("photo_quota_per_site_uq")
      .on(t.day, t.siteId)
      .where(sql`site_id IS NOT NULL`),
    globalUq: uniqueIndex("photo_quota_global_uq")
      .on(t.day)
      .where(sql`site_id IS NULL`),
    dayIdx: index("photo_quota_day_idx").on(t.day),
  }),
);
export type PhotoQuotaUsage = typeof photoQuotaUsage.$inferSelect;
export type NewPhotoQuotaUsage = typeof photoQuotaUsage.$inferInsert;

/**
 * Per-site brand-style anchor for image-to-image continuity (used heavily in Phase 5).
 * Operator uploads ONE reference image per site → every subsequent generation
 * passes it as a referenceImage so the whole 50-photo set for that site looks
 * like one consistent photoshoot.
 */
export const photoStyleAnchors = pgTable(
  "photo_style_anchors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    publicUrl: text("public_url").notNull(),
    label: text("label"),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteUq: uniqueIndex("photo_style_anchors_site_uq").on(t.siteId),
  }),
);
export type PhotoStyleAnchor = typeof photoStyleAnchors.$inferSelect;
export type NewPhotoStyleAnchor = typeof photoStyleAnchors.$inferInsert;

// ─── G1: Network-health audit persistence (2026-06-11) ─────────────────
// Mirrors ~/gyl-sites/_network/health-matrix-<date>.json + per-site JSON
// outputs of the four gyl-* audit skills. One row per (site, run_date) in
// site_health_audits; many findings per audit in page_health_issues.

export const siteHealthAudits = pgTable(
  "site_health_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** YYYY-MM-DD — the run date. Combined with siteId is unique. */
    runDate: text("run_date").notNull(),
    /** Composite 0-100, average of the four dimensions. NULL if any dimension failed. */
    compositeScore: integer("composite_score"),
    structureScore: integer("structure_score"),
    designScore: integer("design_score"),
    onpageScore: integer("onpage_score"),
    indexingScore: integer("indexing_score"),
    /** Raw audit JSON for any future drill-down without re-reading files. */
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    /** "ok" | "partial" (some sub-step failed) | "failed" */
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteRunUq: uniqueIndex("site_health_audits_site_run_uq").on(t.siteId, t.runDate),
    siteRecentIdx: index("site_health_audits_site_recent_idx").on(t.siteId, t.createdAt),
  }),
);
export type SiteHealthAudit = typeof siteHealthAudits.$inferSelect;
export type NewSiteHealthAudit = typeof siteHealthAudits.$inferInsert;

export const pageHealthIssues = pgTable(
  "page_health_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id").notNull().references(() => siteHealthAudits.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Page URL — full URL or path. */
    pageUrl: text("page_url"),
    /** Page type — home/service/area/fleet/contact/etc. */
    pageType: text("page_type"),
    /** Which dimension flagged this: structure | design | onpage | indexing */
    dimension: text("dimension").notNull(),
    /** Specific check that fired — e.g. "missing_h1", "header_drift", "no_canonical". */
    issueKey: text("issue_key").notNull(),
    /** Severity: red | amber */
    severity: text("severity").notNull().default("amber"),
    /** One-line human label for the dashboard. */
    label: text("label").notNull(),
    /** Detail blob — diff, screenshot path, schema snippet, whatever fits. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** Whether a fix_proposal has been queued yet. Used to avoid double-queueing. */
    fixProposalId: uuid("fix_proposal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    auditIdx: index("page_health_issues_audit_idx").on(t.auditId),
    siteSeverityIdx: index("page_health_issues_site_severity_idx").on(t.siteId, t.severity, t.dimension),
    issueKeyIdx: index("page_health_issues_issue_key_idx").on(t.issueKey),
  }),
);
export type PageHealthIssue = typeof pageHealthIssues.$inferSelect;
export type NewPageHealthIssue = typeof pageHealthIssues.$inferInsert;

/**
 * Denormalized weekly snapshot for fast dashboard queries. One row per
 * (site, week_start_date). Aggregates from siteHealthAudits + counts from
 * pageHealthIssues so a network matrix renders without joining big tables.
 */
export const healthDimensionScores = pgTable(
  "health_dimension_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** Monday of the week — YYYY-MM-DD. */
    weekStart: text("week_start").notNull(),
    composite: integer("composite"),
    structure: integer("structure"),
    design: integer("design"),
    onpage: integer("onpage"),
    indexing: integer("indexing"),
    /** Red findings open at end of week. */
    redCount: integer("red_count").notNull().default(0),
    amberCount: integer("amber_count").notNull().default(0),
    /** Delta vs previous week's composite, signed. */
    compositeDelta: integer("composite_delta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteWeekUq: uniqueIndex("health_dim_scores_site_week_uq").on(t.siteId, t.weekStart),
  }),
);
export type HealthDimensionScore = typeof healthDimensionScores.$inferSelect;
export type NewHealthDimensionScore = typeof healthDimensionScores.$inferInsert;

// ─── G5: Fix queue + auto-approve rules (2026-06-11) ──────────────────
// fix_proposals: one row per audit-issue → fix-job proposal. Status
// machine: pending → approved → running (claudeJobs.id set) → done | failed.
// Auto-approve rules let the operator opt into "always approve this
// category" so safe fixes ship without weekly clicks.

export const fixProposals = pgTable(
  "fix_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    /** The audit issue that surfaced this proposal. */
    issueId: uuid("issue_id").references(() => pageHealthIssues.id, { onDelete: "set null" }),
    /** Job kind we'll queue when approved — fix:retighten_meta etc. */
    fixKind: text("fix_kind").notNull(),
    /** Resolved job.input for the Mac worker. */
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    /** One-line human label for the queue UI. */
    label: text("label").notNull(),
    /** Long description / before-after preview for the operator. */
    preview: text("preview"),
    /** "low" | "normal" | "high" — drives queue ordering when batched. */
    priority: text("priority").notNull().default("normal"),
    /** "pending" | "approved" | "running" | "done" | "failed" | "rejected" */
    status: text("status").notNull().default("pending"),
    /** Set when status = running/done — links to the claudeJobs row. */
    jobId: uuid("job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    /** Operator who approved/rejected. */
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Auto-approve rule that fired, if any. */
    autoApprovedByRule: text("auto_approved_by_rule"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStatusIdx: index("fix_proposals_site_status_idx").on(t.siteId, t.status),
    kindStatusIdx: index("fix_proposals_kind_status_idx").on(t.fixKind, t.status),
  }),
);
export type FixProposal = typeof fixProposals.$inferSelect;
export type NewFixProposal = typeof fixProposals.$inferInsert;

/**
 * fix_auto_approve_rules — operator-curated list of (fixKind) categories
 * to auto-approve. Optional minTrust counts how many manual approvals of
 * the same kind must precede auto-approve activating (pattern learning).
 */
export const fixAutoApproveRules = pgTable(
  "fix_auto_approve_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fixKind: text("fix_kind").notNull(),
    /** Optional — restrict to one site. NULL = network-wide. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    /** Min number of manual approvals of this kind before auto fires (gentle ramp). */
    minTrust: integer("min_trust").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindSiteUq: uniqueIndex("fix_auto_approve_kind_site_uq").on(t.fixKind, t.siteId),
  }),
);
export type FixAutoApproveRule = typeof fixAutoApproveRules.$inferSelect;
export type NewFixAutoApproveRule = typeof fixAutoApproveRules.$inferInsert;

// ─── G7: New-site bootstrap pipeline (WP Manager universal) ───────────
// Pipeline states (one per row in new_site_builds):
//   brief        operator filled the form
//   dns_check    operator confirmed DNS points at the host (manual gate)
//   wp_install   WP Manager API installed WP on the host
//   plugin_push  gyl-bookings (+ Sarah + canonical-redirects on) pushed
//   content      new-site skill ran on Mac worker, wrote N pages
//   health_gate  gyl-network-health composite ≥ 85 across the board
//   live         operator flipped DNS / confirmed live

export const newSiteBuilds = pgTable(
  "new_site_builds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Domain operator typed (without protocol). */
    domain: text("domain").notNull(),
    businessName: text("business_name").notNull(),
    city: text("city").notNull(),
    region: text("region").notNull().default("United Arab Emirates"),
    /** "cleaning_services" | "villa_cleaning" | "office_cleaning" | "deep_cleaning" | "hvac" (legacy transport keys like "limo"/"chauffeur"/"taxi" retained for schema compat with older rows). */
    vertical: text("vertical").notNull(),
    /** Slug picked from domain (e.g. spotless-cleaning-dubai). */
    slug: text("slug").notNull(),
    /** Current step. */
    state: text("state").notNull().default("brief"),
    /** What's blocking the next step (operator-facing). */
    blocker: text("blocker"),
    /** Linked site once WP install lands and we have api_keys for it. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    /** Operator who started the build. */
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    /** Free-form brief data: services, fleet, NAP, design notes. */
    brief: jsonb("brief").$type<Record<string, unknown>>(),
  },
  (t) => ({
    domainUq: uniqueIndex("new_site_builds_domain_uq").on(t.domain),
    stateIdx: index("new_site_builds_state_idx").on(t.state, t.createdAt),
  }),
);
export type NewSiteBuild = typeof newSiteBuilds.$inferSelect;
export type NewNewSiteBuild = typeof newSiteBuilds.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// G8 — Weekly keyword rank tracking + content refresh loop.
//
// One trackedKeywords row per (site, keyword, location, device). The Mac
// worker queries GSC where connected, else scrapes Google, and writes a
// keywordRankSnapshots row per week. After N consecutive weeks off page
// 1/2/3, the refresh recommender drops a fix:rewrite_page job.
// ──────────────────────────────────────────────────────────────────────
export const trackedKeywords = pgTable(
  "tracked_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    targetUrl: text("target_url"),
    location: text("location").notNull().default("Canada"),
    device: text("device").notNull().default("desktop"),
    source: text("source").notNull().default("auto"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastPosition: numeric("last_position"),
    weeksOffP1: integer("weeks_off_p1").notNull().default(0),
    weeksOffP2: integer("weeks_off_p2").notNull().default(0),
    weeksOffP3: integer("weeks_off_p3").notNull().default(0),
    refreshFlaggedAt: timestamp("refresh_flagged_at", { withTimezone: true }),
    refreshJobId: uuid("refresh_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => ({
    siteIdx: index("tracked_keywords_site_idx").on(t.siteId, t.enabled),
  }),
);
export type TrackedKeyword = typeof trackedKeywords.$inferSelect;
export type NewTrackedKeyword = typeof trackedKeywords.$inferInsert;

export const keywordRankSnapshots = pgTable(
  "keyword_rank_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackedKeywordId: uuid("tracked_keyword_id").notNull().references(() => trackedKeywords.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    weekOf: date("week_of").notNull(),
    position: numeric("position"),
    url: text("url"),
    source: text("source").notNull(),
    raw: jsonb("raw"),
  },
  (t) => ({
    siteWeekIdx: index("keyword_rank_snapshots_site_week_idx").on(t.siteId, t.weekOf),
  }),
);
export type KeywordRankSnapshot = typeof keywordRankSnapshots.$inferSelect;
export type NewKeywordRankSnapshot = typeof keywordRankSnapshots.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// G9 — Google Business Profile + off-site SEO surface.
//
// GBP API requires OAuth + a verified location; we don't ship that yet.
// For now the platform stages POSTS/QUESTIONS/CITATIONS as actionable
// rows the operator (or student labor) handles, with AI-suggested
// drafts. Citation queue tracks NAP listing state per directory.
// ──────────────────────────────────────────────────────────────────────
export const gbpPosts = pgTable(
  "gbp_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    imageUrl: text("image_url"),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedUrl: text("posted_url"),
    status: text("status").notNull().default("draft"),
    generatedBy: text("generated_by"),
    jobId: uuid("job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStatusIdx: index("gbp_posts_site_status_idx").on(t.siteId, t.status, t.scheduledFor),
  }),
);
export type GbpPost = typeof gbpPosts.$inferSelect;
export type NewGbpPost = typeof gbpPosts.$inferInsert;

export const gbpQa = pgTable(
  "gbp_qa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    status: text("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteStatusIdx: index("gbp_qa_site_status_idx").on(t.siteId, t.status),
  }),
);
export type GbpQa = typeof gbpQa.$inferSelect;
export type NewGbpQa = typeof gbpQa.$inferInsert;

export const citationQueue = pgTable(
  "citation_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    directory: text("directory").notNull(),
    napState: text("nap_state").notNull().default("unknown"),
    listingUrl: text("listing_url"),
    notes: text("notes"),
    actionTaken: text("action_taken"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
export type CitationQueueRow = typeof citationQueue.$inferSelect;
export type NewCitationQueueRow = typeof citationQueue.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// Phase 3 — Push notification dedup log.
//
// One row per (kind, refId, day). Insert is gated by a unique index so
// the same fix proposal can't fire 12 times in 5-minute increments. New
// day → new row → re-fires (covers persistent-blocker situations).
// ──────────────────────────────────────────────────────────────────────
export const pushSent = pgTable("push_sent", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  refId: text("ref_id").notNull(),
  firedOn: date("fired_on").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PushSent = typeof pushSent.$inferSelect;
export type NewPushSent = typeof pushSent.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// WordPress credential vault. One row per (site, kind). The default kind
// is `wp_app_password` (native WP Application Passwords, the right
// primitive: revocable in wp-admin without changing the real account
// password, scoped, and recognized by every WP REST endpoint via Basic
// auth). `secret_ciphertext` holds AES-256-GCM via lib/crypto.ts.
// ──────────────────────────────────────────────────────────────────────
export const siteCredentials = pgTable(
  "site_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("wp_app_password"),
    username: text("username").notNull(),
    secretCiphertext: text("secret_ciphertext").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifyStatus: text("verify_status"),
    verifyError: text("verify_error"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("site_credentials_site_idx").on(t.siteId),
  }),
);
export type SiteCredential = typeof siteCredentials.$inferSelect;
export type NewSiteCredential = typeof siteCredentials.$inferInsert;

export const pushDropDismissals = pgTable("push_drop_dismissals", {
  siteId: uuid("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
  dismissedUntilScore: integer("dismissed_until_score"),
  dismissedBy: uuid("dismissed_by").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
});
export type PushDropDismissal = typeof pushDropDismissals.$inferSelect;
export type NewPushDropDismissal = typeof pushDropDismissals.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// G10 — Per-site cost / scale guards.
//
// Caps how many auto-approved fixes / GBP posts can fire per site per
// week. Priority-lane sites (composite < threshold) get high priority
// on the worker queue. Operator can override per-site from /admin/sites.
// ──────────────────────────────────────────────────────────────────────
export const siteBudgets = pgTable(
  "site_budgets",
  {
    siteId: uuid("site_id").primaryKey().references(() => sites.id, { onDelete: "cascade" }),
    weeklyFixCap: integer("weekly_fix_cap").notNull().default(20),
    weeklyGbpPostCap: integer("weekly_gbp_post_cap").notNull().default(2),
    autoApproveEnabled: boolean("auto_approve_enabled").notNull().default(true),
    priorityLane: boolean("priority_lane").notNull().default(false),
    compositeLowThreshold: integer("composite_low_threshold").notNull().default(70),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);
export type SiteBudget = typeof siteBudgets.$inferSelect;
export type NewSiteBudget = typeof siteBudgets.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// Monitoring & Alerting — Phase 1
//
// Single inbox for "something needs attention". The check-engine cron
// runs every 15 min, each check function returns alert candidates, the
// engine dedupes by fingerprint and updates first_seen / last_seen.
// Operators ack / dismiss / snooze from /admin/alerts.
// ──────────────────────────────────────────────────────────────────────
export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warn", "error", "critical"]);
export const alertStatusEnum = pgEnum("alert_status", ["open", "acknowledged", "snoozed", "resolved", "dismissed"]);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Logical check name — plugin_drift / traffic_drop / sitemap_regression / worker_death / cwv_breach / site_unreachable / cron_stuck */
    kind: text("kind").notNull(),
    severity: alertSeverityEnum("severity").notNull().default("warn"),
    status: alertStatusEnum("status").notNull().default("open"),
    /** Optional site scope; null for platform-wide alerts (e.g., worker death). */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    /** Stable dedup key for this alert instance — (kind + siteId + entity) hashed. */
    fingerprint: text("fingerprint").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /**
     * Per-instance mute switch. When false the alert stays visible on the
     * dashboard but the check engine skips it on subsequent runs and no
     * notifications go out. Independent of `alert_rules.enabled`, which
     * controls the *kind* — this is the per-row user opt-out.
     */
    enabled: boolean("enabled").notNull().default(true),
    /** Free-form context: { observed, expected, url, version, ... }. */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Hit-count for the same fingerprint across check runs. */
    occurrences: integer("occurrences").notNull().default(1),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => ({
    fingerprintIdx: uniqueIndex("alerts_fingerprint_uq").on(t.fingerprint),
    statusKindIdx: index("alerts_status_kind_idx").on(t.status, t.kind),
    siteIdx: index("alerts_site_idx").on(t.siteId),
  })
);
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;

/**
 * Analytics dashboard widgets — the "Add new widget" tile on /admin/analytics
 * writes to this table. One row per widget instance on the shared network-wide
 * dashboard. Widget kinds map to a fixed catalog in
 * `src/lib/analytics-widget-catalog.ts` — the `settings` blob carries the
 * per-widget config (e.g. which site to lock a card to, cadence, etc.).
 */
export const analyticsWidgets = pgTable(
  "analytics_widgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Catalog key. See analytics-widget-catalog.ts for the list. */
    kind: text("kind").notNull(),
    /** Human label — defaults to the catalog entry's name; editable. */
    label: text("label").notNull(),
    /** Free-form config: { siteId?, source?, metric?, window? }. */
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    /** Render order on the grid — smaller = earlier. */
    position: integer("position").notNull().default(100),
    /** Toggle off without deleting. */
    enabled: boolean("enabled").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    posIdx: index("analytics_widgets_pos_idx").on(t.position),
  }),
);
export type AnalyticsWidget = typeof analyticsWidgets.$inferSelect;
export type NewAnalyticsWidget = typeof analyticsWidgets.$inferInsert;

/** One row per check-engine cron run — diagnostics + duration history. */
export const alertCheckRuns = pgTable(
  "alert_check_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Comma-separated kinds that ran. */
    kinds: text("kinds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Whether anything in the run errored — true even if some checks succeeded. */
    hadError: boolean("had_error").notNull().default(false),
    /** Per-check { kind: { duration_ms, candidates, new_alerts, updated_alerts, error? } }. */
    summary: jsonb("summary").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => ({
    startedIdx: index("alert_check_runs_started_idx").on(t.startedAt),
  })
);
export type AlertCheckRun = typeof alertCheckRuns.$inferSelect;
export type NewAlertCheckRun = typeof alertCheckRuns.$inferInsert;

/**
 * Admin-configurable alert rules — one row per "kind" of check the admin has
 * tuned. Each built-in check (plugin_drift, traffic_drop, etc.) reads its
 * thresholds from the matching enabled rule if one exists, falling back to
 * the check's own hardcoded defaults when no rule is configured. `config` is
 * kind-specific (e.g. traffic_drop: { warnPct, errorPct, criticalPct }).
 *
 * `notifyUserIds` + `notifyEmail`/`notifyInApp` drive a notification fired
 * once per NEW alert instance that matches this rule's kind + site scope —
 * separate from the per-user SEO notification prefs in `notify()`, since
 * alert routing is rule-driven rather than user-opt-in-driven.
 */
export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Matches a CheckDef.kind in src/lib/alerts/checks — plugin_drift / traffic_drop / sitemap_regression / worker_death / site_unreachable. */
    kind: text("kind").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    /** Optional site scope; null applies the rule network-wide. */
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    /** Kind-specific thresholds, shape documented per-check in src/lib/alerts/rule-config.ts. */
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    /** Forces every alert instance from this rule to this severity; null = let the check decide. */
    severityOverride: alertSeverityEnum("severity_override"),
    notifyEmail: boolean("notify_email").notNull().default(false),
    notifyInApp: boolean("notify_in_app").notNull().default(true),
    notifyUserIds: jsonb("notify_user_ids").$type<string[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    kindIdx: index("alert_rules_kind_idx").on(t.kind),
    siteIdx: index("alert_rules_site_idx").on(t.siteId),
  })
);
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// Audit log — Phase 2 (2026-06-12)
//
// Generic "system did something" event log. Captures fixes applied, plugin
// deploys, theme pushes, CSS broadcasts, content publishes, manual ops.
// ──────────────────────────────────────────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull().default("admin_ui"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>(),
    relatedKind: text("related_kind"),
    relatedId: uuid("related_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteCreatedIdx: index("audit_log_site_created_idx").on(t.siteId, t.createdAt),
    kindCreatedIdx: index("audit_log_kind_created_idx").on(t.kind, t.createdAt),
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
  })
);
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// CWV snapshots — Phase 5 (2026-06-12)
//
// Daily Core Web Vitals per site, populated from the CrUX History API.
// One row per (site, snapshot_date, form_factor). Source is "crux" for
// the cron-populated rows; manual rows can be backfilled via /admin if
// CrUX has no data for very-low-traffic sites.
// ──────────────────────────────────────────────────────────────────────
export const cwvSnapshots = pgTable(
  "cwv_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD (CrUX week-ending date for that bucket)
    formFactor: text("form_factor").notNull(), // 'phone' | 'desktop' | 'tablet' | 'all'
    /** p75 LCP in ms. */
    lcpP75: integer("lcp_p75"),
    /** p75 INP in ms. */
    inpP75: integer("inp_p75"),
    /** p75 CLS as 0–1 × 1000 (integer-friendly storage; convert /1000 in UI). */
    clsP75x1000: integer("cls_p75_x1000"),
    /** p75 FCP in ms. */
    fcpP75: integer("fcp_p75"),
    /** p75 TTFB in ms. */
    ttfbP75: integer("ttfb_p75"),
    /** "crux" (CrUX History API) | "pagespeed" (PageSpeed Insights synthetic) | "manual" */
    source: text("source").notNull(),
    /** Raw CrUX response stashed for audit. */
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("cwv_snapshots_uq").on(t.siteId, t.snapshotDate, t.formFactor),
    siteDateIdx: index("cwv_snapshots_site_date_idx").on(t.siteId, t.snapshotDate),
  })
);
export type CwvSnapshot = typeof cwvSnapshots.$inferSelect;
export type NewCwvSnapshot = typeof cwvSnapshots.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// PSI lab cache (2026-06-25) — caches fetchCwv() results per (url, strategy)
// so the /admin/cwv lab-INP readout and Tech Watchdog don't re-hit PageSpeed
// Insights on every page load. This is what was causing the 429s: ~50 sites
// x 2 pages x uncached on every render of /admin/cwv.
// ──────────────────────────────────────────────────────────────────────
export const psiLabCache = pgTable(
  "psi_lab_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    strategy: text("strategy").notNull(), // 'mobile' | 'desktop'
    lcpMs: integer("lcp_ms"),
    clsRaw: integer("cls_raw_x1000"), // 0..1 * 1000, integer-friendly
    tbtMs: integer("tbt_ms"),
    performance: integer("performance"), // 0-100
    error: text("error"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("psi_lab_cache_uq").on(t.url, t.strategy),
  })
);
export type PsiLabCache = typeof psiLabCache.$inferSelect;
export type NewPsiLabCache = typeof psiLabCache.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// SEO outcome tracking — Phase 3 (2026-06-12)
//
// Daily SERP rank tracking + weekly backlink snapshots + competitor gap
// mining. Designed to be populated by EITHER an external API (DataForSEO
// — set DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env) OR an off-platform
// scraper that POSTs to the ingest routes with a bearer token.
//
// Schema is API-agnostic — the cron route does the integration, the rest
// of the dashboard reads from these tables.
// ──────────────────────────────────────────────────────────────────────

/** Per (site, keyword, geo) tracker config. Populated by the operator. */
export const trackedKeywordsExt = pgTable(
  "tracked_keywords_ext",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").default(2124), // 2124 = Canada (DataForSEO codes)
    languageCode: text("language_code").default("en"),
    deviceType: text("device_type").default("desktop"), // 'desktop' | 'mobile'
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteKeywordUq: uniqueIndex("tracked_keywords_ext_uq").on(t.siteId, t.keyword, t.locationCode, t.deviceType),
  })
);
export type TrackedKeywordExt = typeof trackedKeywordsExt.$inferSelect;

/** Daily SERP snapshot per tracked keyword. */
export const serpSnapshots = pgTable(
  "serp_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackedKeywordId: uuid("tracked_keyword_id").notNull().references(() => trackedKeywordsExt.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD
    /** Rank for the site's own domain. null if not in top 100. */
    rank: integer("rank"),
    /** The full top-10 SERP — JSON array of {position, domain, url, title}. */
    serpTop10: jsonb("serp_top10").$type<Array<{ position: number; domain: string; url: string; title?: string }>>(),
    /** Estimated search volume for the keyword (carried from latest research). */
    searchVolume: integer("search_volume"),
    /** Where the data came from: 'dataforseo' | 'scrape' | 'manual'. */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("serp_snapshots_uq").on(t.trackedKeywordId, t.snapshotDate),
    siteDateIdx: index("serp_snapshots_site_date_idx").on(t.siteId, t.snapshotDate),
  })
);
export type SerpSnapshot = typeof serpSnapshots.$inferSelect;
export type NewSerpSnapshot = typeof serpSnapshots.$inferInsert;

export const keywordResearchSessions = pgTable(
  "keyword_research_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seed: text("seed").notNull(),
    database: text("database").notNull().default("ca"),
    resultCount: integer("result_count").notNull().default(0),
    results: jsonb("results").notNull().default(sql`'[]'::jsonb`),
    clusters: jsonb("clusters").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("kw_research_sessions_created_idx").on(t.createdAt),
  }),
);
export type KeywordResearchSession = typeof keywordResearchSessions.$inferSelect;

export const keywordLists = pgTable(
  "keyword_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index("kw_lists_name_idx").on(t.name),
  }),
);
export type KeywordList = typeof keywordLists.$inferSelect;

export const keywordListItems = pgTable(
  "keyword_list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id").notNull().references(() => keywordLists.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    volume: integer("volume"),
    difficulty: integer("difficulty"),
    cpc: text("cpc"),
    intent: text("intent"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    listIdx: index("kw_list_items_list_idx").on(t.listId),
  }),
);
export type KeywordListItem = typeof keywordListItems.$inferSelect;

/** Weekly backlinks snapshot — totals + new/lost since last snapshot. */
export const backlinksSnapshots = pgTable(
  "backlinks_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(), // YYYY-MM-DD (the Monday of that week)
    totalBacklinks: integer("total_backlinks").notNull(),
    totalRefDomains: integer("total_ref_domains").notNull(),
    newBacklinks: integer("new_backlinks").notNull().default(0),
    lostBacklinks: integer("lost_backlinks").notNull().default(0),
    /** Domain Rating / Authority (0..100). DataForSEO calls this "rank". */
    domainRank: integer("domain_rank"),
    /** Optional sample of the freshest backlinks for the UI to render. */
    sample: jsonb("sample").$type<Array<{ url: string; domain: string; firstSeen?: string; lost?: boolean }>>(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq: uniqueIndex("backlinks_snapshots_uq").on(t.siteId, t.snapshotDate),
    siteIdx: index("backlinks_snapshots_site_idx").on(t.siteId, t.snapshotDate),
  })
);
export type BacklinksSnapshot = typeof backlinksSnapshots.$inferSelect;
export type NewBacklinksSnapshot = typeof backlinksSnapshots.$inferInsert;

/** Keywords where the competitor ranks above the site — gap mining output. */
export const competitorGaps = pgTable(
  "competitor_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(),
    competitorDomain: text("competitor_domain").notNull(),
    keyword: text("keyword").notNull(),
    ourRank: integer("our_rank"),
    theirRank: integer("their_rank").notNull(),
    searchVolume: integer("search_volume"),
    /** Estimated traffic for this keyword if we ranked top-3. */
    estTrafficPotential: integer("est_traffic_potential"),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteDateIdx: index("competitor_gaps_site_date_idx").on(t.siteId, t.snapshotDate),
    keywordIdx: index("competitor_gaps_keyword_idx").on(t.siteId, t.keyword),
  })
);
export type CompetitorGap = typeof competitorGaps.$inferSelect;
export type NewCompetitorGap = typeof competitorGaps.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// Indexing automation (2026-06-12)
//
// Per-URL index status, refreshed daily. detection_source records HOW we
// learned the state: "gsc" (URL Inspection API — authoritative, includes
// the real reason), "site_query" (site: SERP scrape fallback), or "http"
// (only confirms the page is reachable, not indexed). submit_* records the
// last IndexNow / Google-API push so we don't re-spam.
// ──────────────────────────────────────────────────────────────────────
export const indexingStatus = pgTable(
  "indexing_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    inSitemap: boolean("in_sitemap").notNull().default(true),
    /** Normalised: indexed | not_indexed | crawled_not_indexed | discovered | duplicate | excluded | unknown */
    indexState: text("index_state").notNull().default("unknown"),
    /** Raw GSC coverageState string (e.g. "Crawled - currently not indexed"). */
    coverageState: text("coverage_state"),
    /** GSC verdict: PASS | NEUTRAL | FAIL. */
    verdict: text("verdict"),
    httpStatus: integer("http_status"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastCrawlAt: timestamp("last_crawl_at", { withTimezone: true }),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true }),
    submitSource: text("submit_source"), // 'indexnow' | 'google_api'
    detectionSource: text("detection_source"), // 'gsc' | 'site_query' | 'http'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when an admin requests removal from the index. No real Google
     *  de-index API exists for ordinary pages (Indexing API only covers
     *  JobPosting/BroadcastEvent) — this flags the row + drives the
     *  noindex-helper instructions shown in the UI; it does not call Google. */
    removalRequestedAt: timestamp("removal_requested_at", { withTimezone: true }),
    removalNote: text("removal_note"),
  },
  (t) => ({
    uq: uniqueIndex("indexing_status_uq").on(t.siteId, t.url),
    siteStateIdx: index("indexing_status_site_state_idx").on(t.siteId, t.indexState),
  })
);
export type IndexingStatus = typeof indexingStatus.$inferSelect;
export type NewIndexingStatus = typeof indexingStatus.$inferInsert;

// ──────────────────────────────────────────────────────────────────────
// Indexing quota usage (2026-06-25) — daily IndexNow submission counter,
// mirrors photo_quota_usage's pattern. One global row per day (site_id
// null) tracks network-wide submissions against an admin-configurable cap.
// ──────────────────────────────────────────────────────────────────────
export const indexingQuotaUsage = pgTable(
  "indexing_quota_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: text("day").notNull(),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }),
    urlsSubmitted: integer("urls_submitted").notNull().default(0),
    requestsMade: integer("requests_made").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dayIdx: index("indexing_quota_day_idx").on(t.day),
  })
);
export type IndexingQuotaUsage = typeof indexingQuotaUsage.$inferSelect;
export type NewIndexingQuotaUsage = typeof indexingQuotaUsage.$inferInsert;

// ===== Research for new design (Phase 1 — backend) =====
//
// "Find me high-performing limo/transport sites for {market} + {niches},
// break each down into reusable sections, and let me replicate a section
// into a build project." All AI/web-research runs on the Mac worker via
// claude_jobs (preferWorker:'mac'); the section capture is a Playwright
// step; SEMrush enrichment uses the BYOK key. Never the Anthropic API.

/**
 * One "research for new design" run. Created when the operator kicks off a
 * search for a market + niche set. Walks: queued → researching (LLM job
 * finds sites) → capturing (Playwright sections) → ready → failed.
 */
export const designResearchRuns = pgTable(
  "design_research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** e.g. "Miami, FL" or "anywhere" (worldwide inspiration). */
    market: text("market").notNull().default("anywhere"),
    /** JSON array of niche keys: chauffeur/limousine/private_car/airport_taxi/
     *  airport_limo/city_to_city/party_bus/transportation. */
    niches: jsonb("niches").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** 'queued' | 'researching' | 'capturing' | 'ready' | 'failed' */
    status: text("status").notNull().default("queued"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    /** Short human summary written by the postprocess once sites land. */
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("design_research_runs_status_idx").on(t.status, t.createdAt),
  }),
);
export type DesignResearchRun = typeof designResearchRuns.$inferSelect;
export type NewDesignResearchRun = typeof designResearchRuns.$inferInsert;

/**
 * A high-performing reference site found for a run. One row per URL the
 * research job returned; enriched with a SEMrush domain rank/traffic pull
 * (best-effort) and a full-page screenshot captured by the Playwright step.
 */
export const designReferenceSites = pgTable(
  "design_reference_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => designResearchRuns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    market: text("market"),
    niche: text("niche"),
    whyHighPerforming: text("why_high_performing"),
    designNotes: text("design_notes"),
    /** { palette: string[], fonts: string[], layoutStyle: string }. */
    designDna: jsonb("design_dna").$type<Record<string, unknown>>(),
    /** SEMrush type=domain_rank pull — null if no key / not found. */
    semrushRank: integer("semrush_rank"),
    semrushTraffic: integer("semrush_traffic"),
    /** Path relative to SCREENSHOT_STORAGE_PATH/design-research/. */
    fullScreenshotPath: text("full_screenshot_path"),
    /** 'researching' | 'capturing' | 'captured' | 'capture_failed' */
    status: text("status").notNull().default("researching"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("design_reference_sites_run_idx").on(t.runId, t.status),
  }),
);
export type DesignReferenceSite = typeof designReferenceSites.$inferSelect;
export type NewDesignReferenceSite = typeof designReferenceSites.$inferInsert;

/**
 * One top-level section of a reference site, detected + screenshotted by the
 * Playwright capture step. `sectionType` is a best-effort guess from the
 * section's headings / class names.
 */
export const designReferenceSections = pgTable(
  "design_reference_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => designReferenceSites.id, { onDelete: "cascade" }),
    /** hero|services|fleet|testimonials|cta|about|footer|gallery|pricing|other */
    sectionType: text("section_type").notNull().default("other"),
    label: text("label"),
    /** Top-to-bottom order on the page (0-based). */
    order: integer("order").notNull().default(0),
    /** Path relative to SCREENSHOT_STORAGE_PATH/design-research/. */
    screenshotPath: text("screenshot_path"),
    /** Trimmed text/structure summary lifted from the DOM. */
    domSummary: text("dom_summary"),
    /** { x, y, width, height } in CSS px at capture viewport. */
    boundingBox: jsonb("bounding_box").$type<Record<string, number>>(),
    /** How this section was detected: 'vision' (full-page screenshot read by the model) or 'dom'. */
    source: text("source").notNull().default("dom"),
    /** Band as a % of the full-page screenshot height — the gallery CSS-clips the full shot to this. */
    yStartPct: doublePrecision("y_start_pct"),
    yEndPct: doublePrecision("y_end_pct"),
    /** Vision validity verdict — only `true` sections are offered as usable references. */
    isValid: boolean("is_valid").notNull().default(true),
    /** Short reason when isValid is false (e.g. "blank", "cookie banner", "cut off"). */
    validationNote: text("validation_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    siteIdx: index("design_reference_sections_site_idx").on(t.siteId, t.order),
  }),
);
export type DesignReferenceSection = typeof designReferenceSections.$inferSelect;
export type NewDesignReferenceSection = typeof designReferenceSections.$inferInsert;

/**
 * The operator picks a section to replicate into a build project. Queues a
 * `research:build_section` mac job; the postprocess writes the rebuilt
 * section into the target site_build_project as a page row.
 */
export const designSelections = pgTable(
  "design_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => designResearchRuns.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull().references(() => designReferenceSections.id, { onDelete: "cascade" }),
    /** Which build project to drop the rebuilt section into. */
    targetProjectId: uuid("target_project_id").references(() => siteBuildProjects.id, { onDelete: "set null" }),
    replicationPrompt: text("replication_prompt"),
    buildJobId: uuid("build_job_id").references(() => claudeJobs.id, { onDelete: "set null" }),
    /** 'selected' | 'building' | 'built' */
    status: text("status").notNull().default("selected"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("design_selections_run_idx").on(t.runId, t.status),
    sectionIdx: index("design_selections_section_idx").on(t.sectionId),
  }),
);
export type DesignSelection = typeof designSelections.$inferSelect;
export type NewDesignSelection = typeof designSelections.$inferInsert;
