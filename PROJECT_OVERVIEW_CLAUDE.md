# AKS SEO Hub & Console — Complete Architecture & Claude Code Onboarding Guide

## 1. Project Overview & Mission
**AKS SEO Console (SEO Hub)** is a multi-tenant SEO Management CRM and Intelligence Platform designed for digital marketing agencies and enterprise SEO operations. It tracks, audits, automates, and optimizes search visibility across multiple clients and digital properties.

- **Primary Live Property**: Safaeewala Cleaning Services (`https://safaeewala.com/`) — Dubai, UAE.
- **Production Host**: Hostinger VPS (Docker) at `http://187.77.116.14:3333/`.
- **Primary Database**: PostgreSQL (`pgvector:pg16`) via Docker Compose.

---

## 2. Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript |
| **Routing & Server Framework** | TanStack Router (File-based routes), TanStack Start / Nitro SSR |
| **Styling & Design System** | Tailwind CSS v4, Lucide React icons, Radix UI primitives, Sonner toasts |
| **State Management** | React Context (`SiteContext`, `AuthContext`), TanStack Query |
| **Database & ORM** | PostgreSQL 16 (pgvector), Drizzle ORM, PGlite (embedded WASM fallback for local dev) |
| **Runtimes & Tooling** | Node.js / Bun, Vite 8, Docker & Docker Compose |
| **External APIs** | Google Search Console API v3, Google Analytics 4 Data API (v1beta), Google Cloud BigQuery API (v2), Google Business Profile API, Cloudflare API |

---

## 3. CRITICAL: API Route Pattern

Every server endpoint under `src/routes/api.*.ts` **must** use TanStack Start's real
server-route convention:

```ts
export const Route = createFileRoute("/api/things")({
  server: {
    handlers: {
      GET: async ({ request }) => Response.json({ ok: true }),
      POST: async ({ request, params }) => Response.json({ ok: true }),
    },
  },
});
```

**Do not** use `loader` + `component: () => null` for API routes — that pattern
renders the SSR page shell for any plain `fetch()` call (it only returns loader
data to requests carrying TanStack Router's internal `x-tsr-serverFn` header,
which ordinary `fetch("/api/...")` never sends). Every API route in this repo
was originally built on that broken pattern and silently returned HTML instead
of JSON to every component's `fetch()` call — this was fixed on 2026-08-25;
see §5. Any new API route must use `server.handlers`, or it will silently fail
the same way.

---

## 4. Project Directory Structure

```
├── .data/                      # Local pglite fallback persistence (dev only)
├── docker-compose.yml          # Container configuration (app on :3333, postgres on :5432)
├── Dockerfile                  # Production container build
├── gmb-service-account.json    # Google Cloud Service Account Credentials
├── package.json                # Dependencies and npm scripts
├── public/                     # Static public assets
├── scratch/                    # Diagnostic and verification test scripts
├── src/
│   ├── components/             # Reusable UI & Feature Drilldowns
│   │   ├── analytics-ai-overview.tsx       # Cloudflare AI Crawl & Bot Shield
│   │   ├── analytics-business-profile.tsx  # GMB / Local Pack Metrics — STILL MOCK, deferred
│   │   ├── analytics-google-analytics.tsx  # Live GA4 traffic, channels, devices, pages
│   │   ├── analytics-search-console.tsx    # Live GSC & BigQuery Search Analytics
│   │   ├── entries-modal-100.tsx           # Full entries modal (Keywords/Pages)
│   │   ├── master-auth-gate.tsx            # Access control and login gates
│   │   └── visuals-ecosystem-pipeline.tsx  # Architecture visualization (animated diagram, not live telemetry)
│   ├── lib/                    # Core Business Logic & API Clients
│   │   ├── auth-context.tsx                # Authentication state
│   │   ├── site-context.tsx                # Real site list from Postgres `sites` table
│   │   ├── jobs-store.ts                   # Postgres-backed AI job queue client (fetch wrapper over /api/jobs/*)
│   │   └── google/                         # Google Cloud & Search API Integrations
│   │       ├── auth.ts                     # JWT OAuth token generator from service account
│   │       ├── bigquery.ts                 # BigQuery REST query runner & status monitor
│   │       ├── analytics-ga4.ts            # GA4 runReport & runRealtimeReport
│   │       ├── business-profile.ts         # GBP accounts/locations fetch (backend ready, UI not wired — deferred)
│   │       └── search-console.ts           # GSC Search Analytics API multi-dimension queries
│   └── routes/                 # TanStack File-Based Routes & Server Endpoints
│       ├── __root.tsx                      # Root layout, navigation sidebar, notifications
│       ├── dashboard.tsx                   # Main multi-tab SEO Command Center — live overview KPIs
│       ├── connected-sites.tsx             # Site management, real Postgres-backed list
│       ├── agency-health.tsx               # Portfolio view, real connection status (no fabricated CWV/score)
│       ├── alerts.tsx                      # Real Postgres-backed alert CRUD (empty until alerts are raised)
│       ├── settings.tsx                    # General tab persists to org_settings; other 8 tabs explicitly labeled not-yet-connected
│       ├── sites.$siteId.tsx               # Per-site settings & Knowledge Studio
│       ├── api.sites.index.ts / .$id.ts    # Sites CRUD (Postgres `sites` table)
│       ├── api.alerts.index.ts / .$id.ts   # Alerts CRUD (Postgres `alerts` table)
│       ├── api.jobs.*.ts                   # AI job queue CRUD (Postgres `claude_jobs` table)
│       ├── api.tasks.*.ts                  # Kanban tasks CRUD (Postgres `kanban_tasks` table)
│       ├── api.automation.flows*.ts        # Automation flows CRUD (Postgres `automation_flows` table)
│       ├── api.settings.general.ts         # General settings persistence (Postgres `org_settings`)
│       ├── api.google.search-console.ts    # Live GSC + BigQuery data
│       ├── api.google.ga4.ts               # Live GA4 overview/trend/pages/channels/devices/countries
│       └── api.google.gbp.ts               # Live GBP accounts/locations — backend ready, no UI consumer yet
```

*(No `worker/` directory — the previous `claude-worker.mjs` polled an unrelated
"GYL portal" app and has been removed. A real background worker for this
repo's `claude_jobs` table is future work, not started.)*

---

## 5. Remediation History (2026-08-25)

A full pass converted the app from "compiles cleanly" to "verified working end
to end in a running browser." Key findings and fixes:

1. **Every API route was silently broken.** All `src/routes/api.*.ts` files
   used `loader` + `component: () => null`, which TanStack Start 1.170 only
   serves to requests with an internal RPC header — plain `fetch()` calls (the
   pattern every component used) got the HTML app shell back, not JSON. Fixed
   by converting all ~22 route files to `server: { handlers: { GET, POST, ... } }`.
   Verified with direct `fetch()` calls against the production build returning
   real `application/json`.
2. **`site-context.tsx`** no longer seeds a hardcoded `CONNECTED_SITES` array
   into localStorage. It fetches the real `sites` Postgres table via
   `/api/sites`. Metrics (KPIs, trends, top queries, reviews) are never stored
   on the site record — each tab fetches its own live data.
3. **Dashboard overview KPIs** are computed live from `/api/google/search-console`
   and `/api/google/ga4`, not a mock `api.analytics.sync` in-memory store with
   hardcoded fallback numbers (that store's fabricated defaults were removed).
4. **GA4 tab** (`analytics-google-analytics.tsx`) had a full parallel set of
   mock arrays (KPIs, channels, pages, devices, countries) that rendered
   whenever live data was thin. All removed; the tab now shows real GA4 data
   or an honest empty/not-connected state.
5. **Scout Team / AI Jobs queue** (`jobs-store.ts`) was pure `localStorage`
   with fabricated seed content. Migrated to the `claude_jobs` Postgres table
   via `/api/jobs/*`.
6. **Alerts** were 15 fabricated fictional incidents in `localStorage`. Now a
   real `alerts` Postgres table + CRUD API; starts empty, no automated monitor
   currently populates it (create alerts manually, or wire a real monitor as
   future work).
7. **Settings**: General tab (LLM provider preference, audit/digest toggles)
   persists to `org_settings`. The other 8 tabs (APIs, Integrations, Roles,
   Automation, Webhooks, Audit, Logs, Notifications) are explicitly labeled
   "Not yet connected" in the UI — they render sample data but don't persist.
   Building those out (encrypted secret storage, real user/role management,
   webhook delivery) is a larger follow-up, not part of this pass.
8. **`worker/claude-worker.mjs`** deleted — it polled a different, unrelated
   app ("GYL portal" on port 3030) and never belonged to this repo.

**Explicitly deferred (per instruction):** GBP tab (`analytics-business-profile.tsx`)
remains 100% mock. The backend (`api.google.gbp.ts`, `lib/google/business-profile.ts`)
is real and ready — wiring the UI to it is the next task.

**Known gap found during this deploy — Google credentials never reached the
VPS.** `gmb-service-account.json` is (correctly) gitignored, and no
`GOOGLE_SERVICE_ACCOUNT_JSON` env var is set in `docker-compose.yml` either.
Verified live on the VPS: `/api/sites`, `/api/alerts`, `/api/jobs` all return
real Postgres data; `/api/google/search-console` returns real JSON but with
zero results and a BigQuery auth error, because the container has no
credentials to call Google with. **This means GSC/GA4/GBP/BigQuery have never
actually been live in production** — only in local dev, where the file exists
on disk. To fix: securely copy `gmb-service-account.json` to
`/var/www/seo-hub/` on the VPS (it's already `COPY . .`'d into the Docker
build context if present at build time), or set `GOOGLE_SERVICE_ACCOUNT_JSON`
in `docker-compose.yml`'s `environment:` block for the `seo-hub` service, then
`docker compose up -d --build` again.

---

## 6. Live Integrations & Credentials

### A. Google Cloud Service Account
- **File**: `gmb-service-account.json` (also configurable via `GOOGLE_SERVICE_ACCOUNT_JSON` env var).
- **Service Account Email**: `aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com`
- **Google Cloud Project**: `gmb-safaeewala`

### B. Google Search Console (GSC)
- **Verified Property**: `https://safaeewala.com/` (URL-prefix property).
- **Important Note**: The service account is authorized as **Full User** on `https://safaeewala.com/`. Do NOT use `sc-domain:safaeewala.com` directly unless permissions are added in GSC Domain properties.
- **Backend Service**: `src/lib/google/search-console.ts`.

### C. Google Cloud BigQuery
- **Project ID**: `gmb-safaeewala`
- **Active Datasets**:
  1. `gmb-safaeewala.searchconsole`: Contains `ExportLog`, `searchdata_site_impression`, `searchdata_url_impression`.
  2. `gmb-safaeewala.analytics_377896920`: GA4 event export tables (`events_YYYYMMDD`, `pseudonymous_users_YYYYMMDD`).
- **Backend Service**: `src/lib/google/bigquery.ts`.

### D. Google Analytics 4 (GA4)
- **Property ID**: `377896920` (GA4-Safaeewala-Dubai).
- **Backend Service**: `src/lib/google/analytics-ga4.ts`.

---

## 7. How to Run & Deploy

### Run Locally:
```bash
npm install
npm run dev
# Open in browser: http://localhost:3333/dashboard
```

### Seed the database (first run):
```bash
npm run db:seed
```

### Deploy to VPS:
```bash
git pull
docker compose up -d --build
```

---

## 8. Upcoming Roadmap & Next Tasks for Claude Code

1. **Google Business Profile (GBP) Tab Live Sync** — deferred by design in the
   2026-08-25 pass. Connect `src/components/analytics-business-profile.tsx` to
   the already-working `api.google.gbp.ts` route.
2. **Settings deep-wiring**: encrypted API key storage, real user/role
   management (`users`/`site_users` tables already exist), real webhook
   delivery, real audit logging.
3. **Automated alert generation**: the `alerts` table and CRUD are real, but
   nothing currently monitors rank drops, CWV regressions, or GBP review
   sentiment to create alerts automatically.
4. **Real background worker**: a cron/worker process that actually polls
   `claude_jobs` and executes them — the previous `worker/claude-worker.mjs`
   belonged to a different app and was removed.
5. **Multi-Site Expansion**: onboard additional client properties via
   OAuth / Service Account delegation, using the real `sites` table's
   connection flags (`gaConnected`, `gscConnected`, `gbpConnected`, etc.).
