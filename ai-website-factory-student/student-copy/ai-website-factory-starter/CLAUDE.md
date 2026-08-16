# CLAUDE.md — SEO RankPilot

Operational notes for working in this repo. See `README.md` for end-user setup.

## What this project is

Multi-site SEO control plane for a **Dubai-based cleaning & maintenance services** operation. The platform manages a portfolio of WordPress sites in the UAE cleaning vertical (`safaeewala.com`, `spotlesscleaningservices.ae`, and adjacent domains) and provides one console for SEO research, on-page optimisation, content generation, GBP management, indexing tracking, and lead capture.

Operated by AKS with a student labor pool delivering managed SEO services through this console. All content, prompts, keyword research, and competitive intelligence should assume this vertical unless the operator explicitly says otherwise.

## Niche context (READ FIRST — this is what every AI-touched output must respect)

- **Vertical:** house cleaning, villa deep clean, apartment maintenance, move-in/move-out clean, post-construction clean, sofa/carpet/curtain cleaning, office cleaning, pest control-adjacent maintenance.
- **Geography:** Dubai, then rest of UAE. Neighborhoods referenced by SERPs include Palm Jumeirah, Emirates Hills, Dubai Marina, Downtown Dubai, DIFC, JBR, Business Bay, Jumeirah, Al Barsha, Dubai Hills, Arabian Ranches, JVC.
- **Languages:** English primary, Arabic secondary. Bilingual sites use `hreflang="ar-AE"` + `hreflang="en-AE"`. Never assume English-only.
- **Locale defaults:** timezone `Asia/Dubai`, region code `AE`, Semrush country `United Arab Emirates`, currency AED.
- **Never generate content referencing:** limousines, chauffeurs, taxi services, airport transfers, black car service, Toronto, Ontario, Mississauga, GTA, Canada, Pearson Airport. That is the previous vertical's leftover context and must not surface in AI output, seed data, or example copy.

## Hard constraints (do not violate)

- **No SaaS dependencies.** Only allowed third-party services: Stripe + Square (Phase 4), Twilio (Phase 5). All other capabilities are built in-house. Do not introduce Auth0, Hubstaff, ClickUp, Airtable, Sentry-cloud, etc. — even "free tier" SaaS. AKS prefers not to pay recurring SaaS rental fees.
- **Claude Code subscription first, API only when forced.** AKS pays a flat fee for Claude Code; the Anthropic API charges per token. Any new heavy work (long-running reasoning, code generation, deploys) MUST default to `preferWorker: "mac"` on the `claude_jobs` row so the AKS worker (`worker/claude-worker.mjs`) handles it. API is only acceptable for: live chat (`/admin/chat`), vision LLM calls (image inputs), web_search server tool, cheap sub-second Haiku probes. See "Worker routing" below.
- **Local dev uses PGlite, prod uses Postgres on Hostinger VPS.** Schema is identical (Drizzle `pg-core`). Never split into two dialects.
- **WP plugin is the integration touchpoint** for capturing site events. Do not call the WP core REST API directly from the platform except for read-only inventory sync where explicitly documented.
- **HMAC-signed events, no API tokens in URL.** Signature header is `X-GYL-Signature: hex(hmac_sha256(secret, timestamp + "." + body))`. Timestamp skew window is 5 min. (Header name is legacy; do not rename without a coordinated plugin release.)
- **Idempotency at ingest:** `events` table has `unique (site_id, idempotency_key)`. Treat unique-violation as success (duplicate retry).

## Project layout

```
src/app/admin/           Dashboard pages (~100 admin routes)
src/app/api/             Server endpoints (events ingest, integrations, worker claim/complete)
src/db/                  PGlite + Drizzle. ensureSchema() runs once per process.
src/lib/hmac.ts          HMAC sign/verify — used by both server and (ported to PHP in) the WP plugin
src/lib/seo-skills/      Prompt building blocks tuned for the cleaning vertical
src/scripts/             CLI crons (sync:gsc, sync:ga4, health:sweep, ranks:sweep, ai:audit, etc.)
worker/                  AKS worker (claude-worker.mjs) — runs Claude Code locally
```

## Conventions

- Server components by default. Add `"use client"` only when needed (form interactivity, charts, drag).
- All DB access goes through `db()` from `src/db/client.ts`. Always `await ensureSchema()` first inside route handlers and server components (schema is inlined until we ship migrations in v0.5).
- Server actions are fine for mutations, but ingest stays as a route handler because the WP plugin posts raw JSON with HMAC headers.
- Tailwind only. No CSS modules, no styled-components.
- Drizzle: prefer `eq`, `and`, `desc` from `drizzle-orm`. Use `sql\`...\`` template only when nothing else works.
- Times are stored as `timestamptz`. Always pass `Date` objects, never strings.
- API errors: return `{ ok: false, error: "kebab-case-reason" }` with an appropriate HTTP status. The plugin treats `4xx` (except 408/429) as permanent.
- **All AI-generated content must be Dubai-cleaning-shaped** unless the caller explicitly overrides the vertical (rare). This includes examples in prompts, seed keyword lists, example H1s, meta descriptions, city references, and neighbourhood mentions.

## Phase boundaries

| Phase | What lands |
|---|---|
| 1 | WP plugin + ingest API + leads UI |
| 2 | Lucia auth + roles + per-site permissions + task management |
| 3 | Electron wrapper + screen recording + WP-admin IP allowlist |
| 4 | Stripe Connect + Square + GSC + GA4 |
| 5 | Twilio call tracking + recording + transcription |
| 6 (now) | SEO agent team + task assignment + Cloud SEO deep-dive + Dubai niche alignment |

If asked to build something from a later phase before finishing the current one, ask first.

## Things deliberately not done

- Magic-link email — admin can paste passwords via /admin/users
- Drizzle migrations (DDL inlined in `ensureSchema()` — `drizzle-kit push` ships in v0.5 prod deploy)

These are deliberate cuts for shipping speed, not oversights. Don't "fix" them out of band.

## Phase 3 (Electron desktop wrapper) — platform side

Companion app lives in `../gyl-desktop/`. Communication is purely HTTP:

| Endpoint | Purpose |
|---|---|
| `POST /api/desktop/login` | Email+password → returns a long-lived bearer token. Token hash stored in `desktop_sessions`. |
| `POST /api/desktop/heartbeat` | Buffered activity events (page focus/blur, idle, WP-admin open, etc.) every 30s. |
| `POST /api/desktop/recording` | Multipart upload of a 60s webm chunk. Stored on disk at `RECORDING_STORAGE_PATH` (default `./.data/recordings`). |
| `POST /api/desktop/wp-grant` | Worker requests a short-lived (10 min) grant to open a site's WP admin inside the wrapper. |
| `GET  /api/desktop/sites` | Returns the worker's visible site list. |
| `POST /api/desktop/logout` | Revokes the desktop session. |

**WP-admin proxy is the unbuilt half of this.** The grant endpoint issues a token, but the matching `/wp-admin-proxy` route that fetches WP server-side and validates the grant doesn't exist yet (planned for Phase 3 v0.2). Until it ships, workers can technically still open WP admin in any browser — the wrapper only enforces sandbox boundaries inside the Electron window. To actually block external access, also IP-allowlist WP admin to the VPS IP at the nginx layer.

Admin UI: `/admin/desktop` for the user grid, `/admin/desktop/[userId]` for per-worker timeline.

## Phase 4 (Payments + Analytics)

Per-site OAuth, all providers route through `src/lib/integrations.ts`.

| Provider | OAuth start | Callback | Webhook | Sync worker |
|---|---|---|---|---|
| Stripe Connect | `/api/integrations/stripe/start?site=<slug>` | `/api/integrations/stripe/callback` | `/api/integrations/stripe/webhook` (verifies `Stripe-Signature`) | webhook-driven (no batch sync) |
| Square | `/api/integrations/square/start?site=<slug>` | `/api/integrations/square/callback` | `/api/integrations/square/webhook` (verifies `X-Square-HmacSHA256-Signature`) | webhook-driven |
| Google (GSC) | `/api/integrations/google/start?site=<slug>` | `/api/integrations/google/callback` | — | `npm run sync:gsc` (daily). Region filter defaults to UAE. |
| Google (GA4) | (shares Google OAuth above) | — | — | `npm run sync:ga4` (daily). Needs `metadata.ga4_property_id` set on the connection. Region filter defaults to UAE. |

Tables: `integrations_accounts` (one row per site×provider, tokens encrypted), `payments` (Stripe + Square unified, attributed to leads by email match → bumps matching lead to 'won'), `traffic_snapshots` (one row per site×source×date), `gsc_query_snapshots` + `gsc_page_snapshots` (per-query/page window buckets for the Ranking & Performance widget).

**OAuth client setup required on user's side**:
- Stripe: Connect platform → register a Connect application → paste client_id (`ca_...`) + the platform's API key as secret.
- Square: developer.squareup.com → create application → paste application_id + secret. Set `SQUARE_ENV=production` to switch from sandbox.
- Google: console.cloud.google.com → enable Search Console API + GA4 API → create OAuth 2.0 client → add redirect URI `<base>/api/integrations/google/callback`.

**Env vars for webhook verification** (separate from OAuth secrets in DB):
```
STRIPE_WEBHOOK_SECRET=whsec_...
SQUARE_WEBHOOK_KEY=...
SQUARE_WEBHOOK_URL=https://app.../api/integrations/square/webhook  # must match what's in Square dashboard
```

Admin UI: `/admin/payments` (unified inbox), per-site detail page has Integrations + recent payments + SEO traffic sections. Deep-dive at `/admin/gsc` (dark navy + cyan theme, region-locked to UAE).

## Phase 5 (Twilio call tracking)

Thin REST client in `src/lib/twilio.ts` (no Twilio SDK dep). Twilio credentials live in `org_settings` (Account SID + auth token encrypted + public webhook base URL).

| Route | Direction | Purpose |
|---|---|---|
| `POST /api/integrations/twilio/voice?site=<slug>` | Twilio → us | Inbound call. Verifies signature, looks up phone_number row, returns TwiML that dials `forward_to` and records. |
| `POST /api/integrations/twilio/recording?site=<slug>` | Twilio → us | Recording-complete. Stores `RecordingUrl` + duration on the call row. |
| `POST /api/integrations/twilio/status?site=<slug>` | Twilio → us | Call status transitions. |
| `POST /api/integrations/twilio/provision` | UI → us | Admin clicks "+ Provision number" on a site → searches available UAE numbers → buys + auto-wires webhooks. |

Tables: `phone_numbers` (one per site, optionally many), `calls` (one per Twilio CallSid, recording URL points back to Twilio with basic-auth gated playback).

**Transcription**: Twilio's built-in `<Transcribe>` works but is mediocre. v0.2 will pipe the recording through a real STT (Twilio Conversational Intelligence or AssemblyAI). For now `transcript` is null until the admin pastes one manually.

Admin UI: `/admin/calls` (call inbox with audio player), per-site detail page has Call tracking section with provision button.

## AI features (BYOK Anthropic)

Three AI surfaces are built. **All use a single Anthropic API key pasted by the admin** at `/admin/settings`. The key is encrypted (AES-256-GCM, derived from `SESSION_SECRET`) in `org_settings.anthropic_key_ciphertext` and never logged. The platform itself does NOT pay for usage — each org pays Anthropic directly under the admin's key.

| Surface | What | How to run |
|---|---|---|
| **Chat assistant** at `/admin/chat` | Read-only, role-aware. Has 7 tools: `list_sites`, `list_my_tasks`, `list_recent_leads`, `get_team_activity`, `get_overdue_tasks`, `get_recent_audits`, `notify_admin`. System prompt + tool defs are cached via `cache_control: {type: "ephemeral"}` for prefix-cache hits across turns. | Just chat in the UI — model resolves from `org_settings.llm_model` (default `claude-opus-4-7`). |
| **Audit agent** | For each in-progress / due-window task, gathers signals (homepage HTML excerpt, recent task comments, recent leads on the site, assignee last-login) and asks Claude to classify `done` / `partial` / `not_started` / `no_show` / `ambiguous`. Writes `task_audits` row + a 🤖 task comment. | `npm run ai:audit` (or `npm run ai:audit <task-id>` for one task). Stop the dev server first — PGlite is single-process. |
| **Daily digest** | Per-recipient (admin → full network, each manager → their scoped sites). LLM writes 3-section Markdown (Needs attention / Yesterday's activity / Worth a quick look) and drops it as a `notifications` row. | `npm run ai:digest`. Suggested cron: `0 7 * * *` in `Asia/Dubai`. |

**Key implementation rules:**
- Models: always use the IDs in `MODEL_OPTIONS` in `src/app/admin/settings/page.tsx`. Default is `claude-opus-4-7` (Opus 4.7). Use `claude-haiku-4-5` for the validation probe — cheapest model that exists.
- Never use sampling params (`temperature`, `top_p`) — they 400 on Opus 4.7.
- Never use `budget_tokens` — also removed on Opus 4.7. Use `thinking: {type: "adaptive"}` only when you want thinking, otherwise omit.
- Tool definitions must be typed as `Anthropic.Tool[]`. Don't use `as const` (TS `readonly` widens to incompatible types).
- Always check `response.stop_reason === "end_turn"` + iterate when there are `tool_use` blocks (manual loop in `src/app/actions/chat.ts`). Capped at 6 iterations per turn.
- Tool round-trips stored as `chat_messages` rows with `role='tool'` for audit + UI rendering.
- **Any prompt that generates content must include the niche context above** — cleaning services in Dubai, UAE neighbourhoods, English + Arabic support, no limo/taxi vocabulary.

## Agent team (Phase 6)

Six SEO agents represented on `/admin/agent/jobs`:

- **AKS** — SEO Leader. Routes work, audits sign-off, escalates.
- **Kaveh Noor** — On-page Expert. Titles, H1s, schema, meta descriptions.
- **Renner Voss** — Off-page Expert. Backlinks, outreach, anchor mix.
- **Malik Rhodes** — Technical Expert. Crawl, CWV, redirects, canonicals.
- **Silas Iyer** — Blog Writer. Briefs, drafts, edits, voice.
- **Idris Hale** — Technical SEO. Sitemaps, indexation, hreflang (English + Arabic pairs).

Custom agents can be added at `/admin/agent/roster/new`. Each agent has a server-persisted skill instructions field (`agent_profiles.skill_instructions`) that's appended to every job dispatched to them.

## Worker routing — when to use Claude Code vs API

Two engines pick up `claude_jobs` rows:

| Engine | Where | Auth | Cost |
|---|---|---|---|
| AKS worker (`worker/claude-worker.mjs`) | AKS's computer, started via `npm run worker` or `npm run worker:install` (launchd/PowerShell) | `GYL_WORKER_SECRET` bearer | $0 (uses Claude Code subscription) |
| Server executor (`gyl-claude-executor` container) | Hostinger VPS, always-on | Anthropic API key in `org_settings` | Per-token |

Every job has a `prefer_worker` column: `'mac'` | `'server'` | `'any'` (default).

**Routing rules:**
- AKS worker claims `'mac'` and `'any'` jobs first. Falls back to `'server'` jobs that have been pending 10+ minutes (rare — only if API executor dies).
- Server executor claims `'server'` and `'any'` jobs. Falls back to `'mac'` jobs after 5 minutes stale (only when AKS's computer is offline).
- Both use atomic UPDATE-WHERE-status='pending' so no double-claim.

**When dispatching a new job, set `preferWorker`:**
- `'mac'` — DEFAULT for: build:* (research/dna/sitemap/pages/review), static_site:* (code gen, deploy), seo-audit cron jobs, publish gauntlet, agent_task, anything > 30s. These run on the subscription.
- `'server'` — only for jobs that need the API specifically (rare — vision inputs, web_search), or when the operator explicitly wants always-on coverage that can't wait for the AKS worker.
- `'any'` — small one-shot tasks where you don't care who runs them.

**API is still acceptable for these (don't queue):**
- Live `/admin/chat` turns (cached prompt + ≤ 5 tool calls per turn)
- Sub-second Haiku probes (validators, fallbacks)
- Vision LLM calls — `audit_widget_brand_match`, `suggest_ai_overview_improvements` with image inputs
- Anthropic-native `web_search_20250305` server tool

**Setup (one-time, AKS's computer — Windows):**

1. Open PowerShell and navigate to the project folder:
```powershell
cd "C:\Users\11 TRDs\Downloads\ai-website-factory-student\student-copy\ai-website-factory-starter"
```

2. Create the `.env.worker` file in the project root (replace `<paste>` with the secret from `/admin/agent/jobs/secret`):
```powershell
@"
GYL_PORTAL_URL=http://localhost:3001
GYL_WORKER_SECRET=<paste>
GYL_CLAUDE_BIN=claude
GYL_CLAUDE_MAX_TURNS=25
"@ | Out-File -FilePath .env.worker -Encoding utf8
```

3. Run once to verify:
```powershell
npm run worker
```

**Setup (Mac/Linux alternative):**
```bash
cd /path/to/rankpilot
cat > .env.worker <<'EOF'
GYL_PORTAL_URL=http://localhost:3001
GYL_WORKER_SECRET=<paste>
GYL_CLAUDE_BIN=$(command -v claude)
GYL_CLAUDE_MAX_TURNS=25
EOF
npm run worker
```

## PGlite single-process rule (LOCAL DEV ONLY)

PGlite is a single-writer in-process database. **Never run a CLI command (`user:add`, `user:assign`, etc.) while the dev server is running** — concurrent writes corrupt the on-disk file and the next `_pg_initdb` will throw `Aborted()`.

Workflow:
1. Stop the dev server.
2. Run CLI commands (`npm run user:add`, etc.).
3. Start the dev server.

If the DB ever gets corrupted: `npm run db:reset` (nukes `.data/pglite/` and re-seeds — you'll lose lead history but dev data is disposable).

This constraint disappears when we deploy to real Postgres on the Hostinger VPS — Postgres is multi-process by design.
</content>
</invoke>