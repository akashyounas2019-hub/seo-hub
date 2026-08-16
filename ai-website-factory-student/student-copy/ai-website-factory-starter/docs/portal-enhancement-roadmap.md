# GYL Platform — Master Enhancement Roadmap

**Date:** 2026-05-26
**Scope:** 76 admin pages, 28 components, 88 lib files
**Method:** 4 parallel deep audits (operator daily-work · network management · AI/agent surfaces · admin/settings/reporting)
**Audience:** Wali Shah (solo operator) — synthesis of design and feature gaps, ranked by impact-to-effort.

---

## TL;DR — The 5 Bets That Matter

Of the 87 individual items across the four audits, five themes deliver disproportionate leverage. **Everything else is downstream of these.**

1. **Driver mobile PWA + Dispatch console.** The driver — the person actually doing the trip — has zero touchpoint. Every status update flows through a dispatcher's hand-typing. A PWA at `/driver/:id` plus a real dispatch console at `/admin/dispatch` turns a single operator from dispatching 15 trips/day to dispatching 100. This is the #1 ROI of the entire roadmap.

2. **Unified Agent Action Layer (`agent_intents` table).** Today the agent has 5 disconnected surfaces (SEO proposals, build jobs, content briefs, pattern tasks, QA runs) each with its own state machine. Collapse into ONE inbox with one approve/reject/ask-followup flow. Mission Control already pretends to be this — make it real.

3. **Real-time spine + Command palette (⌘K).** All 76 pages are `force-dynamic` server renders with a 30-second poll on two pages. A dispatcher running this 8 hours wants live updates, toast notifications on new bookings, and ⌘K to jump anywhere. The HMAC ingest endpoint is already the chokepoint — pipe events through SSE.

4. **Cross-site intelligence layer.** Network alert digest, cross-site customer dedup, A/B testing across sites, plugin auto-update, cross-site comparison view. The difference between managing 15 sites and 50.

5. **Operator-trust primitives: audit log + kill switch + cost tracking.** No `audit_logs` table. No global pause on autopilot. AI spend is one number with no provider breakdown. These are the things that determine whether you ever sleep through the night.

---

## CONSOLIDATED QUICK WINS (1–2 hour fixes, ship in week 1)

Group these into a single "Polish Sprint" PR. Net visual + UX uplift across the whole portal in one push.

### Header / typography consistency

- **Unify list-page headers.** Only `/today` uses `<header className="brand-rule">`. Every other list (`/me`, `/leads`, `/quotes`, `/reservations`, `/drivers`, `/tasks`, `/customers`, `/notifications`) uses bare `<header>` with `<h1 className="">` (empty). `/calls` inlines a different style entirely. Extract `<PageHeader title="…">` component, replace all 11 occurrences.
- **`/tasks/[id]` uses old typography.** `rounded-xl` + `text-sm font-semibold uppercase tracking-wide`; every other detail page uses `rounded-lg` + `text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted`. Mass-replace.
- **Extract `<BackLink>` component.** Each detail page implements its own slightly-different back link.
- **Build phase rail uses accent-tint bg** (`build/[id]/page.tsx:112`) — violates the deliberate anti-pattern set in `build/page.tsx:1-9`.

### Falsehoods that erode trust

- **SystemCard is hardcoded fiction** (`/admin/page.tsx:790`). "API: Online · Database: Connected · Ingest: Accepting events" are literal strings. Wire to `/api/health` (already linked) or remove.
- **`/admin/settings` is titled "AI Settings"** but holds Stripe, Square, Google, Twilio, SMTP, Telegram, Network KB. Rename to "Settings" + add anchored sub-sections.
- **Chat empty state lies** (`/admin/chat/page.tsx:108-126`). Says "not configured" while gemini-default works fine. Fix the gate to check the multi-provider chain.
- **Jobs dashboard says "Auto-runner active" only with Anthropic** (`agent/jobs/page.tsx:83-104`). Wrong with Gemini default.
- **Spend MTD is one number with no provider breakdown** (`agent/page.tsx:114-117`). Add Gemini/Groq/Anthropic split and a quota progress bar.
- **Mission Control hardcodes 13 cron rows** (`agent/page.tsx:291-304`) with no signal whether each actually ran. Add `cron_runs` table + color rows green/red.
- **"Nothing on fire" stage direction** (`/admin/page.tsx:519`) — "🎉 (kidding — no emoji here…)" is dev-talking-to-themselves. Replace.

### One-click instead of submit-form

- **Lead-detail status is 5 radios + submit button** (`leads/[id]/page.tsx:472-501`). Should be 5 pill buttons that fire instantly, matching the reservation pipeline buttons (`reservations/[id]/page.tsx:469-490`).
- **Task-detail status is 6 radios + submit** (`tasks/[id]/page.tsx:253-282`). Same fix.
- **Tasks kanban not draggable.** `todo → in_progress` is 3 clicks instead of one drag.

### Missing baseline list functionality

- **`/calls` is the orphan of the operator section.** No filters, no pagination (hard `LIMIT 200`), no search, no date range, no direction filter, no transcript search. Half a day of work brings it in line.
- **No search/filter on sites grid** (`sites/page.tsx:232`). Add chips: Healthy / Stale / Silent, has-GSC, has-Stripe, no-theme, has-overdue-tasks.
- **`AutoRefresh` exists on `/today` and `/notifications` only.** `/leads`, `/quotes`, `/reservations` should have it too — these are the pages a dispatcher leaves open.
- **`/admin/users` has no search/filter** — only sorted by createdAt.
- **`/admin/desktop` has no Active-now / Inactive-7d+ filter.**

### Per-provider safety

- **Provider credentials have no clear/disconnect button** (`/admin/settings/page.tsx:521-588`). Once Stripe/Square/Google/Twilio are saved you can only overwrite, never wipe. Mirror the Anthropic clear flow at line 402 for all providers.
- **SMTP "Send test email" silently disabled** when SMTP not enabled. Render enabled with a "Save settings first" toast.
- **Webhook events as free-text comma list** (`webhooks/page.tsx:51-58`). Right below at line 125 is the canonical event-kind list — render as checkboxes.
- **Template cadence is free text** (`templates/[id]/page.tsx:80-86`). One typo silently breaks the cron. Make it `<select>`.
- **`/admin/sites/new` is dead weight.** Duplicates step 1 of `/connect` without plugin verification. Delete.
- **`/admin/screenshots` tab counts mix all-time total with open-changes** — at 50 sites that's misleading. Show "last 7d".

### Cheap UX uplift

- **Site detail page is 1,158 lines, 11 sections, scrolled linearly.** Convert header (`sites/[slug]/page.tsx:249-292`) to a real tab strip + lazy-load each tab.
- **Lead-detail notes textarea has no autosave** (`leads/[id]/page.tsx:281`). Dispatcher answers a call mid-typing → loses the note.
- **Quote stale-pending number isn't a link** (`quotes/page.tsx:225`). Should filter to those quotes.
- **Score grid hides entirely if `!hasAnySiteScore`** (`sites/[slug]/page.tsx:318-324`). Render dimension cards as `—` so the operator knows what exists.
- **`/admin/sops` renders body as `<pre>`** — Markdown is stored but not rendered.
- **Prompt history shows first 600 chars** (`prompts/[slot]/page.tsx:94`) — the meaningful diff is mid-body.
- **`/admin/local` rollup sorts by slug** — should sort by completeness ASC.
- **Sidebar "Tune" section** (Prompts/SOPs/Outcomes/Sample review) is a junk drawer — collapse under "Agent" or hide behind power-user toggle.

---

## CONSOLIDATED MEDIUM BUILD (1–2 day features, ship in weeks 2–6)

### Operator workflow

1. **Lead → Quote → Reservation one-click conversion.** Today: open lead → click "Create follow-up task" (creates a *task*, not a quote). There is **no `convertLeadToQuoteAction`**. Lead detail page needs 3 buttons: "Quote this lead", "Book this lead" (skip quote), "Lost". The current "+ Create follow-up task" sends operators on a detour through the task system instead of straight to revenue.
2. **Availability-aware driver assignment.** Today: a `<select>` listing `on_trip` drivers with `(on trip)` text label. The #1 daily dispatcher action is the dumbest interface. Build a suggest panel: "Tom — free, in your fleet, last trip 3hrs ago, sedan matches request."
3. **Batch dispatch view at `/admin/dispatch?date=today`.** Un-assigned reservations on left, driver fleet on right, two-click assign. The dispatcher's job is *batch*, not row-by-row.
4. **SMS workflow.** Twilio is integrated but `/calls` is read-only and there's no SMS surface anywhere — no "send confirmation SMS" button on reservation detail, no "SMS the driver" on assignment, no inbound SMS inbox. Extend calls/page leadId match to reservationId too.
5. **No-show / late-pickup automation.** Reservation pipeline has `no_show` status but nothing auto-flags "pickup time was 20 min ago, status still confirmed". Add cron + push notification + auto-task.
6. **VIP customer indicator on lead/quote/reservation rows.** Customer LTV is calculated on detail pages — surface as a star on rows when LTV > threshold.
7. **Bulk actions beyond leads.** `LeadBulkBar` exists; quotes/reservations/customers/tasks need bulk status changes, bulk site reassign, bulk export.
8. **Notifications inbox triage shortcuts** — "snooze 4h", "convert to task", "assign to teammate". Today notifications are read-only until deleted.
9. **AI price suggestion badge on quote list rows.** AiSuggestionCard exists on quote detail — exposing confidence on the list lets operator batch-approve high-confidence ones.
10. **`/me` page is a navigation crutch** — has zero quote/reservation/call surfaces for managers. Should show their sites' bookings today, need-driver list, team's overdue tasks.

### Network management

1. **Cross-site comparison view at `/admin/sites/compare`.** Table with 1 row per site, columns for 6 composite scores + last lead + last event + open tasks + theme-pushed-at. Sortable.
2. **Site health monitoring at `/admin/site-health`.** Cron hits each domain + `wp-admin/admin-ajax.php` + checks SSL expiry. Store in `site_uptime_checks`. Status-page-quality.
3. **Plugin version drift detection.** Heartbeat already sends version. Surface in sites grid as `v0.8.1` green/amber chip. Add `?filter=outdated-plugin` quick link.
4. **Per-site cron status footer.** "Last sync: screenshots 4h ago · inventory 8h ago · QA 1d ago" on each site detail header.
5. **Bulk operations beyond brand.** `/admin/sites/bulk` for: run QA across N sites, capture screenshots, push knowledge-base snippets, push pricing changes.
6. **Visual-regression actually diffs.** Today shows side-by-side desktop+mobile from *one capture* — not old-vs-new. The `diffPct` exists but the previous capture is never overlaid.
7. **AI knowledge: org-level default + per-site extension.** Today every new site needs 8KB of fleet/policies pasted from scratch.
8. **Citations: bulk tier-1 seed** across every site that has none.
9. **Connect wizard polling on step 2.** Currently requires manual refresh.
10. **Pricing: bulk + copy-from-another-site.** No path to raise base across the network by $5.

### Agent surfaces

1. **Conversational orchestration.** Chat at `/admin/chat` has 7 read-only tools — answer "which sites scored < 60?" but can't act. Add `propose_bulk_action` tool that drafts agent tasks (no auto-execute). Patterns infrastructure already accepts spawned tasks.
2. **Build phase validation gates.** `canAdvance = jobDone && !!nextPhase` only — job can be "done" with a 50-char output (failure-as-success). Add per-phase validation: research must produce ≥5 competitor URLs, sitemap ≥3 pages.
3. **Kill switch + auto-pause.** Global pause/resume on Mission Control. Per-capability auto-pause on N consecutive failures.
4. **Prompt A/B testing.** Shadow-run v2 against 10% of traffic, compare critic confidence at 14d, auto-promote winner. Add `traffic_share` to `promptTemplates`.
5. **QA Suite → "agent fix this" path.** Each failure wires to a `seoProposals` row creator or Claude job template.
6. **Content pipeline talks to build pipeline.** Site that was just built has 0 briefs queued — agent should auto-spawn briefs for service-area + FAQ extensions post-deploy.
7. **Per-capability sample rate config.** Today 10% is hardcoded — newer skills should be 100%-sampled until trust earned.
8. **Manual pattern creation path.** Today only the detector seeds patterns.

### Settings / reporting / admin trust

1. **Audit log of admin actions.** No `audit_logs` table exists. Critical for "who broke webhook signing at 2am" — log every settings save (whose key was rotated, when, by whom).
2. **Cost tracking by provider × surface × site.** `/admin/billing` with monthly chart, top sites by AI usage, provider mix.
3. **Webhook delivery log + replay.** Today only last delivery status shown. Add `webhook_deliveries` table with last 50 attempts per subscriber + "Retry" action.
4. **Telegram + SMTP health visibility.** Last successful webhook timestamp, send-test button, bounce log, deferral counts.
5. **Onboarding checklist** that persists until done. Today's Quick Start only shows when `siteCount <= 1`.
6. **Credential rotation reminders.** Display "last rotated 287 days ago" per credential with configurable cadence.
7. **`/admin/desktop/[userId]` per-day grouping.** Currently flat list of 100 raw events with `JSON.stringify(detail)` dumps. Group by session, idle gaps, horizontal timeline.
8. **2FA at minimum (TOTP).** The portal holds Stripe Connect platform keys, Twilio tokens, OAuth secrets across providers. Password-only is the weakest link.
9. **Permission depth — "View only" role.** Data model already separates `users.role` from `site_users.role`. Surface a third option.
10. **Reports: ad-hoc query + CSV export.** Date Range + Site picker. "Monthly client PDF — Coming soon" tease should ship or die.

---

## CONSOLIDATED BIG BETS (week+ projects)

### B1. Driver mobile PWA at `/driver/:id` — **highest-leverage single item in this document**

A phone-first surface for the person actually doing the trip:
- Today's manifest
- "I'm en route" / "passenger onboard" / "complete trip" buttons (status pipeline already wired)
- Photo upload for completion proof
- GPS check-in
- Receive dispatch SMS in the app instead of a separate channel

**Impact:** Every trip status update would otherwise be hand-entered by a dispatcher. With 15 sites × 8 trips/day this is 120 manual entries that disappear.

### B2. Dispatch console at `/admin/dispatch`

Live map, driver positions, in-progress trips, ETA badges, color-coded by status, drag-from-queue-to-driver. With ~15 sites and a single solo operator, the difference between a list view and a dispatch console is the difference between dispatching 15 and dispatching 100 trips/day.

### B3. Unified Agent Action Layer (`agent_intents` table)

Collapse 5 agent surfaces (SEO proposals, build jobs, content briefs, pattern tasks, QA runs) into ONE intent table with one approve/reject/ask-followup flow. Mission Control becomes the inbox. Single state machine, single audit trail, single rollback. **1–2 weeks.**

### B4. Real-time spine: SSE channel + ⌘K command palette

- `getActivityFeed` exists (used in `today/page.tsx:84`) — make it streamable.
- HMAC ingest is already the chokepoint — pipe the same events through an SSE channel scoped to the user's visibility.
- ⌘K search across leads/customers/reservations/drivers/sites/sops.
- Toast notifications for new bookings on every page.
- Keyboard shortcuts (`j/k` to navigate, `c` to call, `?` for help).

### B5. Cross-site learning loop + network alert digest

- **Learning:** when a meta title rewrite improves CTR by +20% on one site, the agent proposes the same *pattern* (not the exact title) on the other 49 sites. Build a `playbooks` table populated from `seo_outcomes`.
- **Alerts:** Daily digest watches: `lastEventAt > 36h`, score drops > 10 WoW, screenshot status = `major_change`, QA critical fails, payment webhook failures, integration `lastSyncStatus = error`, SSL expiry < 14d. Emit ONE consolidated `notifications` row per recipient. The `ai:digest` cron already exists — extend it.

### B6. Cross-site customer canonical layer

Today: phone/email siloed per site. Reality: one human books Mississauga AND Toronto. Add `customers_canonical` table keyed by normalized phone/email, with a join table to `leads.site_id`. Surface "this person has booked across 3 of your sites" on lead detail.

### B7. Cost-aware LLM routing per task

`src/lib/llm-multi.ts` has provider preference but no per-task tier mapping. Today the platform pays Anthropic for trivial alt-text rewrites that Gemini Flash nails 95% of the time. Build a router mapping `seo_skill_kind` → tier → provider, with auto-downgrade when quota or critic-confidence allows. **Target: $0/month at network scale on Gemini-free.**

### B8. Plugin auto-update infrastructure

Today: 15 manual wp-admin uploads when a new GYL Suite ships. Add `wp-plugin/version-manifest.json` served from the platform, plugin self-checks on heartbeat, "push update to selected sites" from the bulk pattern.

### B9. Network Operations Console rebuild of `/admin`

Today: six stat cards + activity feed + workload widget + urgent-task list. Rebuild as a triage queue answering "what should I do next" — leads to call, payments to reconcile, sites going silent, AI proposals waiting, drivers off-schedule, expiring OAuth tokens. Today's page answers "what's happening".

### B10. Revenue reconciliation + per-driver settlement

`/today` shows revenue rolled up from `payments`, but no daily payout view, no per-driver settlement, no Stripe Connect transfers reconciliation. With Stripe Connect in Phase 4, this is high-leverage at low incremental effort once webhooks land.

### B11. A/B testing across sites

Each site as an arm — try CTA copy A on 3 sites, B on 12, compare reservation rate. Build on top of `pages` design overrides. Needs `experiments` table + attribution from `events`.

### B12. Multi-org foundation

Every action and `requireAdmin()` assumes a single org. `org_settings` is a singleton row. When you operate a second client network, every page in this audit changes. Plan the `orgs` table now while it's still single-tenant.

### B13. Public API + API key management at `/admin/api-keys`

Token mint + scope + last-used. Path to Zapier-class integration without SaaS dependency. For tech-savvy customers integrating their own dispatch.

### B14. Multilingual customer comms

Ontario taxi/limo customer base is heavily non-English (Punjabi, Urdu, Cantonese, Spanish, French). Widget already supports 10 languages — extend to: language field on customers, structured multi-language SMS/email templates per site, AI translation hook on chat assistant.

---

## SEQUENCED ROADMAP

### Sprint 1 — "Polish Sprint" (Week 1)

All 50+ quick wins in ONE PR. Net visual + UX uplift. Zero new schema. Zero risk.

- Header + typography unification
- Replace SystemCard fiction with `/api/health` probe
- Rename "AI Settings" → "Settings" with anchored sub-sections
- Per-provider disconnect buttons
- One-click status pills (leads, tasks)
- `/calls` filter bar + pagination
- AutoRefresh on `/leads`, `/quotes`, `/reservations`
- Sites grid filter chips
- Delete `/admin/sites/new`
- Markdown render in SOPs
- Template cadence as `<select>`
- Webhook events as checkboxes
- Sidebar "Tune" section collapse

### Sprint 2 — Operator Workflow (Weeks 2–3)

- `convertLeadToQuoteAction` + 3-button lead detail
- Availability-aware driver suggest
- SMS workflow (confirmation, dispatch, inbox)
- No-show / late-pickup automation
- VIP indicator on rows
- Bulk actions on quotes/reservations/customers/tasks

### Sprint 3 — Network Intelligence (Weeks 4–5)

- `/admin/sites/compare`
- `/admin/site-health` (uptime + SSL + plugin version)
- `/admin/sites/bulk`
- Per-site cron status footer
- Visual regression actual diff
- Org-level default knowledge base

### Sprint 4 — Agent Trust (Weeks 6–7)

- `audit_logs` table — log every settings save + agent action
- Kill switch + per-capability auto-pause
- `agent_intents` unified table (start of B3)
- Prompt diff view + A/B traffic_share
- QA failure → "agent fix this" path
- Build phase validation gates
- Cost tracking by provider × surface × site

### Sprint 5 — Driver App (Weeks 8–10) ★ THE BIG BET

- Driver PWA at `/driver/:id`
- Dispatch console at `/admin/dispatch`
- SSE channel for live updates
- ⌘K command palette
- 2FA (TOTP)

### Sprint 6 — Network Compounders (Weeks 11–14)

- Cross-site customer canonical layer
- Cross-site learning loop (`playbooks` table)
- Plugin auto-update infrastructure
- Network alert digest (extend `ai:digest`)
- Network Operations Console rebuild of `/admin`

### Sprint 7 — Phase 4 + Phase 5 Tie-In (Weeks 15–18)

- Revenue reconciliation surface
- Per-driver settlement
- Public API + `/admin/api-keys`
- Multi-org foundation
- A/B testing across sites
- Multilingual customer comms

---

## PRIORITIZATION HEURISTIC USED

For each item, scored on:
- **Reach** — what fraction of operator-time it touches
- **Frequency** — how often per day it fires
- **Trust** — does it remove a falsehood / add a safety net
- **Network multiplier** — does the leverage scale with site count
- **Effort** — hours to ship

Items with high (Reach × Frequency × Network) and low Effort went into Sprint 1. Items with high Trust + low Effort went into Sprint 4. The driver PWA and dispatch console scored 10/10 on Reach × Frequency but high Effort — they're the centerpiece of Sprint 5 and the single highest-impact investment in the document.

---

## DELIBERATELY OUT OF SCOPE

Per the no-SaaS constraint in CLAUDE.md:
- ~~Sentry/Datadog~~ — build in-house error log
- ~~Auth0/Clerk~~ — Lucia + TOTP self-hosted
- ~~ClickUp/Linear sync~~ — `/admin/tasks` is the source of truth
- ~~Airtable export~~ — `/admin/exports` writes to disk under `RECORDING_STORAGE_PATH`-style env var

Per phase boundaries in CLAUDE.md (don't pull forward):
- Phase 5 Twilio features are scoped — SMS workflow (Sprint 2) sits in Phase 5 territory but is high-leverage enough to surface here
- Multi-org foundation (B12) is post-Phase 5

---

## OPEN QUESTIONS FOR WALI

1. **Driver PWA priority** — agree this is the #1 item? It depends on whether you intend to onboard salaried/contract drivers vs. continue dispatching to 3rd-party fleets. If 3rd-party only, the PWA value drops and dispatch console becomes the focus.
2. **Multi-tenant timing** — are you committing to operating multiple client networks (B12) or staying single-org? Affects every schema decision in Sprint 4.
3. **Public API audience** — is this for limo-tech integrators on the network, or for selling the platform to other limo agencies as a product?
4. **Sprint 1 ship constraint** — given prior frustration about deploy time, want me to batch Sprint 1 quick wins into ONE deploy or ship them as 5 smaller PRs over a week?

---

*End of roadmap. Audit raw outputs available at `/private/tmp/claude-501/.../tasks/{a1b92f0f95755384b,a9f112e006e2280da,ac7547e4403d7a9ae,ad15a7e185852ef77}.output` for any item that needs deeper context.*
