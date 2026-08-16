# GYL Platform

Multi-site control plane for the AI Website Factory network. Aggregates leads, runs the team console, and (over time) replaces ClickUp / Hubstaff / CallRail with in-house modules.

This repo is the **dashboard + WP plugin**. See `project_gyl_platform.md` in memory for the 5-phase roadmap.

## Status

All five phases of the roadmap have shipped to v0.x. Current capability surface:

- **Phase 1 — Ingest:** WP plugin `gyl-connect` ships HMAC-signed events to `/api/events/ingest`. Dedup by idempotency key. Leads land in `/admin/leads`.
- **Phase 2 — Auth + tasks:** hand-rolled cookie sessions (no SaaS), role-aware (`admin` / `manager` / `student`), per-site `site_users` scoping. Tasks board with comments + status workflow at `/admin/tasks`. Recurring task templates with cron materializer (`npm run materialize:templates`).
- **Phase 3 — Desktop wrapper:** companion Electron app posts heartbeats/recordings via `/api/desktop/*`. Per-user timeline at `/admin/desktop/[userId]`. Short-lived WP-admin grants.
- **Phase 4 — Payments + analytics:** Stripe Connect, Square, and Google (GSC + GA4) OAuth and webhook routes. Unified payments inbox at `/admin/payments`. Per-site SEO dashboard. Auto-attribution by customer email.
- **Phase 5 — Twilio call tracking:** number provisioning, inbound recording, status webhooks. Call inbox at `/admin/calls`.
- **AI surfaces:** chat assistant at `/admin/chat` with 11 tools (7 read, 4 write — task status, task comment, lead status, claim lead). Audit agent (`npm run ai:audit`) + daily digest (`npm run ai:digest`).

All credentials (Anthropic API key, OAuth secrets, SMTP password, Twilio auth token) are AES-256-GCM encrypted at rest with `SESSION_SECRET` as the KDF input.

See `docs/fk-cascade-matrix.md` for the FK / ON DELETE reference, and `CLAUDE.md` for operational notes.

## Stack

- Next.js 15 (App Router)
- PGlite (Postgres-in-WASM) for local dev → real Postgres on VPS in Phase 2
- Drizzle ORM
- Tailwind
- No SaaS dependencies. Only third-party services planned: Stripe + Square (Phase 4), Twilio (Phase 5).

## Local setup

```bash
cd gyl-platform
npm install
cp .env.example .env       # then edit ADMIN_PASSWORD + SESSION_SECRET
npm run db:seed            # creates admin user + 2 pilot sites + 2 API keys
                           # → SAVE the printed GYL_KEY_ID / GYL_SECRET pairs
npm run dev                # http://localhost:3000/admin
```

## Connecting a WP site

1. Copy `wp-plugin/gyl-connect/` into the WordPress install's `wp-content/plugins/`.
2. Activate it.
3. Settings → GYL Connect.
4. Paste:
   - **Endpoint**: `http://localhost:3000` (dev) or `http://localhost:3001` (prod)
   - **Site slug**: the slug you registered (`aiwebfactory`, `toronto-limo-booking`)
   - **Key ID** + **Secret** from `npm run db:seed` output
5. Click "Send test event" — should land in `/admin/leads` within a second.
6. In your form handlers (e.g. `aiwebfactory-theme/inc/audit-launcher.php`), add **one line** at the point a lead is captured:

```php
do_action( 'gyl_connect/lead_captured', [
    'form'    => 'audit_launcher',
    'name'    => $name,
    'email'   => $email,
    'phone'   => $phone,
    'service' => 'audit',
] );
```

## Layout

```
gyl-platform/
├── src/
│   ├── app/
│   │   ├── admin/                  # dashboard pages
│   │   └── api/events/ingest/      # POST endpoint WP plugin calls
│   ├── db/
│   │   ├── client.ts               # PGlite + Drizzle, lazy ensureSchema()
│   │   ├── schema.ts               # tables
│   │   └── seed.ts                 # creates admin user + sites + keys
│   └── lib/hmac.ts                 # sign/verify
└── wp-plugin/gyl-connect/          # the WordPress plugin
```

## API contract (v0.1)

`POST /api/events/ingest`

Headers:
- `Content-Type: application/json`
- `X-GYL-Key-Id: <key-id>`
- `X-GYL-Timestamp: <unix-seconds>`
- `X-GYL-Signature: hex(hmac_sha256(secret, timestamp + "." + body))`
- `X-GYL-Idempotency-Key: <uuid>`

Body:
```json
{
  "kind": "lead.captured",
  "site_slug": "aiwebfactory",
  "payload": {
    "form": "audit_launcher",
    "name": "...",
    "email": "...",
    "...": "..."
  }
}
```

Responses: `200 {ok:true}` (or `{ok:true, duplicate:true}`), `4xx {ok:false, error:"reason"}`, `5xx`. Plugin retries 5xx/408/429 with exponential backoff; drops 4xx after logging.
