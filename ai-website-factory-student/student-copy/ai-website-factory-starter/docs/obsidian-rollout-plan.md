# Obsidian Gold — Portal-Wide Rollout Plan

**Date:** 2026-05-26
**Scope:** 73 admin pages
**Method:** 4 parallel deep audits against the approved `/preview/obsidian` prototype
**Status:** Theme tokens + chrome (sidebar + topbar) already deployed. This plan covers the remaining per-page polish.

---

## The unanimous finding

All four audit agents — working independently on different page batches — converged on the same diagnosis:

> The existing portal is **functional and on-brand-typography** but **uniformly flat**. KPIs are number-only with no spark / delta. List rows lack numbered eyebrows and severity dots. Gold is sprinkled (multiple CTAs, accent-tint blocks per page) rather than reserved for active state + one primary CTA. The components needed for the polish lift already exist — they just need to be extracted from the prototype into shared UI and adopted page-by-page.

**Implication for sequencing:** the shared atoms are the dependency. Do them first → every subsequent page rebuild becomes a 30-minute compose-and-deploy. Without them, every page reimplements gradient logic, sparkline math, status-dot styling, etc., and the rollout takes 2-3× longer.

---

## Phase 0 — Shared atom foundation (must come first · 1-2 days)

Extract the prototype's `_ui/atoms.tsx` primitives into `src/components/ui/` so every admin page can adopt them with a single import. Two existing components also need upgrades.

| Atom | Source | Status today | Action |
|---|---|---|---|
| `KpiCard` | new | `Stat` exists in `Stat.tsx` — ~70% of target | **Upgrade existing**: add gold-hairline top, default-on Sparkline slot, `text-[28px] tabular-nums` value, gradient `surface → surface-2` bg |
| `Sparkline` | new | none in shared UI | **Extract from prototype** — gradient-fill version with last-point marker |
| `TrendChip` | new | inline `▲▼ text-success/text-danger` in 5+ files | **Extract** — single component replaces all ad-hoc deltas |
| `StatusDot` | new | exists in `Row.tsx` — no pulse prop | **Upgrade existing** to add `pulse?: boolean` prop |
| `Pill` | new | exists in `Row.tsx` — limited tones | **Consolidate** — 7-tone variant from prototype replaces ad-hoc `rounded-full ring-1` chips |
| `ProgressBar` | new | flat 2px bars in completeness cards | **Extract** — gold-accent gradient version |
| `NumberedRow` | NEW | not implemented | **Build** — `01/02/03` eyebrow + severity dot + label + meta + chevron. High-leverage executive cue. |
| `Timeline` | NEW | 5+ pages have ad-hoc activity lists | **Build** — vertical line + gold markers, drop-in for activity feeds |
| `PrimaryCta` | NEW | every page has 3-5 `bg-accent` buttons | **Build** — only ONE gold-gradient render per page tree (asserts at render with `[data-primary-cta]` count) |
| `HeroKPIStrip` | NEW | each page lays out KPIs differently | **Build** — canonical 4-5 col grid wrapper |

**Effort:** 1-2 dev days. Net: every Phase 1+ page becomes 2-4× faster to polish.

---

## Phase 1 — Foundation pages, biggest visual ROI (3-4 days)

These are the screens an operator sees every morning. Polish here = the biggest perceived quality lift in shortest time. Sequenced by `daily-traffic × visual-gap × cheap-to-do`.

| # | Page | Effort | Key moves |
|---|---|---|---|
| 1 | `/admin` (overview) | L | Replace `HeroStat` with KPI strip · convert activity/health/system triptych to bento (1 wide hero + flanking rails) · numbered eyebrow on urgent tasks · demote agent banner's tint panel to ONE gold-gradient CTA · replace with AI Briefing card pattern |
| 2 | `/admin/today` | M | Closest to target. Bento restructure of bottom 2-col area · numbered eyebrows on agent suggestions + stuck tasks · gold hairline replacement of plain card rectangles · one gold CTA in header |
| 3 | `/admin/sites` | M | Replace 3-cell `NetStat` strip with 5-card KPI strip (live agent pulse on one) · convert site cards into numbered leaderboard rows sorted by health · one gold CTA only (currently every chip is `bg-accent`) · hairline divider on each card top |
| 4 | `/admin/sites/[slug]` | L | Bento at top: hero = composite score ring + delta + sparkline, rails = leads/team/agent-cost KPIs · numbered task rows w/ severity dots · mini progress bars under each ScoreRing for sub-metric breakdown · live pulse on integration cards · one gold CTA per section family |
| 5 | `/admin/seo` | L | `SeoStat` boxes → KpiCard with sparklines + delta · inbox proposals → numbered eyebrow rows with severity dot per risk · Approve button → gradient gold, Reject ghost · CompetitorIntel grid → numbered timeline article cards · Skills grid → numbered tabular rows |
| 6 | `/admin/leads` | L | Prepend KPI strip (New today / Contacted / Qualified / Won / SLA breach) · donut into bento alongside funnel · SLA breach card → danger-pill big-number pattern · numbered eyebrow per lead row · filter form → surface-2 + gold focus ring · one gold "Convert to task" bulk CTA |
| 7 | `/admin/tasks` | L | `KpiTile` → `KpiCard` upgrade · assignee facets → `Pill` consolidation · kanban cards get numbered eyebrows + severity dots · gold hairline on cards · one gold "+ New task" · add bento hero "5 overdue · 3 due today · 12 in flight" big-number |
| 8 | `/admin/quotes` | M | KPI strip with sparklines + deltas · stale-pending card → big-number + status pill + mini progress · revenue forecast → 30-day big chart (gradient area) · numbered eyebrows on quote rows · one gold "Send quote" CTA |
| 9 | `/admin/reservations` | M | KPI strip with sparklines · today timeline → vertical gold-marker timeline · reservation rows → severity-dot rows with numbered eyebrows · pickup time tabular-num · one gold "+ New" · upcoming-revenue big-hero-number |
| 10 | `/admin/customers` | M | KPI strip needs sparklines + deltas + live dots · filter form gold focus rings · row eyebrows + status dots · big-hero LTV with 30d trend · one gold "Tag VIP" bulk CTA |
| 11 | `/admin/build/[id]` | L | Discipline: ONE accent-tint surface only (gate OR deploy, demote the other) · phase rail → gold marker dots (kill tile fill) · KPI strip at top (phase %, pages-ready, AI score avg, time-in-phase) · gate score → 32px tabular hero with severity dot |
| 12 | `/admin/content` | M | 4-col KPI strip above kanban (in flight, overdue, drafts in review, published 7d) with sparklines · lane headers → tabular count + mini progress · cards get severity dot + numbered eyebrow · gold hairline on active "review" lane |

**Phase 1 total:** ~12 pages, ~3-4 days post-Phase-0.

---

## Phase 2 — Remaining Foundation pages (3-4 days)

Same polish toolkit, second-tier visibility.

| # | Page | Effort | Key moves |
|---|---|---|---|
| 13 | `/admin/notifications` | M | Segmented period filter → `FilterTabs` · KPI strip (12 unread / 3 errors / 2 AI flags) with live pulse · NotificationCards get numbered eyebrows + severity dots + gold hairline · grouped sections → vertical timeline with day-markers |
| 14 | `/admin/me` | M | All 4 KPIs get sparklines · three task RowLists → single bento card with severity-dot rows + numbered eyebrows · mini progress bar "Done · 14 days" · first "Start your day" → gradient gold |
| 15 | `/admin/agent` (Mission Control) | M | Spend block → 5-col KPI strip (Spend MTD / Sites / Reviews / Applied 24h / Failed 24h) with sparklines · live pulse on "Agent active" · 6-tile review grid → hero bento (wide "Awaiting review" numbered · narrow "Recent activity" timeline rail) · restrain DelegateCards to ONE gold CTA at top |
| 16 | `/admin/agent/qa` | M | KPI sparklines + deltas (7d runs, fail-rate) · open-failures → numbered eyebrow rows with severity dot (critical = danger pulse) · recent-runs P/W/F counts → 3-segment mini progress bar · hairline-only form panel, one gold CTA |
| 17 | `/admin/patterns` | M | 3-col KPI strip above tabs (open critical / sites-affected / avg resolution days) · per-pattern sections → numbered eyebrow + severity dot + ProgressBar showing "X of Y sites affected" · linked tasks → timeline gutter with gold markers · gradient "Accept" CTA, ghost dismiss |
| 18 | `/admin/seo-health` | M | KPI strip 5 cards (add avg Δ clicks + avg position trend) each with sparkline · drops table → numbered finding rows with severity dots (red ≥60%, warning 30-60%) + mini sparkline per row · gold "Generate weekly brief" header CTA matching topbar |
| 19 | `/admin/local` | M | KPI strip (avg completeness / verified / inconsistent / unanswered reviews) all with sparklines · numbered leaderboard sorted by completeness asc (worst first) with score cells + severity dots · gold "Run network audit" hero CTA |
| 20 | `/admin/screenshots` | S | KPI strip (open changes / major / reviewed today / capture freshness) with live pulse · tab nav → `FilterTabs` · cards get severity dot + gold hairline on major changes + eyebrow numbers |
| 21 | `/admin/users` | S | Convert "+ New user" to gold gradient · existing left-border stat tiles → KpiCard with eyebrow + 28px value + sparkline (new signups, online trend) · gold hairline top |
| 22 | `/admin/payments` | S | StatStrip → KpiCard with revenue sparkline + TrendChip · demote "Apply filters" to ghost · add "Connect Stripe/Square" gradient CTA when provider unconfigured · table rows → leaderboard treatment with hover-row tone |
| 23 | `/admin/reports` | S | Upgrade `BigStat` (gold hairline + 28px value + sparkline + TrendChip) · per-site rollup → leaderboard with numbered rank cells · severity-dot per report card |
| 24 | `/admin/build` | S | 4-col KPI strip above (Active / In research / Awaiting approval / Live this month) with sparklines · project rows: phase pill + 3-phase mini progress bar · existing hero CTA stays |
| 25 | `/admin/agent/jobs` | S | KPI strip sparklines + 7d delta chips · executor banner live pulse + tabular numbers · job rows: `01..N` eyebrow + status severity dot · single gradient CTA in header |

**Phase 2 total:** ~13 pages, ~3-4 days.

---

## Phase 3 — Detail pages (4-5 days)

Drilled-into pages. Dense data, less daily traffic, but operator spends real time here.

| # | Page | Effort | Key moves |
|---|---|---|---|
| 26 | `/admin/leads/[id]` | L | Hero → big-hero-number pattern (LTV / response time + mini context) · contact-attempts → vertical timeline with gold markers · status-dot rail for identity attributes · numbered eyebrows on cross-site lead chips · gold-gradient status updater |
| 27 | `/admin/users/[id]` | M | Profile header → hero card with bigger avatar + completion% ring + 14d sparkline · StatStrip → KPI strip with TrendChip · audit verdicts → numbered finding row (01/02/03/04 eyebrow + severity dot) · activity feed → gold-marker timeline · one gold primary + ghost secondaries |
| 28 | `/admin/desktop/[userId]` ★ | L | **Biggest visual gap on audit.** Three raw `<table>` elements need conversion. KPI strip (Sessions today / Active now / Recording hours / Activity events) · activity table → proper vertical timeline · sessions table → leaderboard with 01/02/03 + StatusDot · recordings → card-per-recording bento (not raw `<ul>`) |
| 29 | `/admin/quotes/[id]` | M | Status transitions → vertical timeline with gold marker on current step · AI suggestion → "Live" briefing card with pulse · price breakdown line items → numbered eyebrows · gradient primary action |
| 30 | `/admin/reservations/[id]` | M | Pipeline 4-step → progress-bar-with-checkpoints + gold marker on current · activity feed → vertical timeline with gold dots · status-change buttons → one gradient primary + neutral secondaries · numbered line items · status-dot identity rail |
| 31 | `/admin/tasks/[id]` | M | Title block → TopBar-style h1 + colored sub-stat line · comments → vertical timeline with author monograms + gold marker on most-recent · status changer → segmented pill with one gradient "primary" · AI audit → status-pill + numbered findings rows |
| 32 | `/admin/customers/[id]` | M | Big-hero LTV + 12-month spend sparkline · quotes + reservations RowLists → vertical timeline with gold markers on most-recent · numbered eyebrows on frequent routes · gradient save, ghost tag chips |
| 33 | `/admin/agent/qa/[runId]` | M | Score card → 28px hero + mini context line + 7-run sparkline · per-group sections → vertical timeline with severity dots · numbered eyebrow per check · live pulse during running status |
| 34 | `/admin/content/[id]` | M | Critic panel → 32px hero confidence + severity dot + sparkline of scores over revisions · transition buttons → horizontal mini-progress timeline (brief→drafting→review→approved→published) · one gradient "Publish" CTA |
| 35 | `/admin/seo/outcomes` | M | Aggregate per-capability cards → proper KPI mini-strip with sparkline + delta vs baseline · snapshot rows → numbered eyebrow + severity dot tied to critic score · "Total fixes tracked" hero with win/loss tone |
| 36 | `/admin/sites/[slug]/local` | M | Completeness card → big-hero "70%" + mini context lines (NAP ✓ / Schema ✗ / Categories ✓) + mini progress bar · citations → numbered rows per directory with status dot · KPI strip above form (verified / unanswered / NAP mismatches / freshness) |
| 37 | `/admin/sites/[slug]/brand` | S | Preview → wide hero card with gold hairline · provenance → right-rail narrow card with vertical timeline of extraction events · status pill (agent-extracted = green pulse / manual = info / default = warning) · one primary "Apply to {domain}" gradient + one ghost re-extract |
| 38 | `/admin/sites/[slug]/pages` | S | KPI strip (total / w/ override / drafts / modified 7d) each with delta + sparkline · page rows → eyebrow number + last-modified mini-context + tabular dim count · bulk push → gradient |
| 39 | `/admin/sites/[slug]/pages/[postId]/design` | S | Preview half → wide hero with gold hairline + status pill ("override active" = accent pulse) · ONE gold "Push to live" + 2 ghost buttons · agent prompt strip in accent-tinted card with live pulse · mini context above iframe |
| 40 | `/admin/sites/[slug]/screenshots` | S | KPI strip (total / open changes / largest diff / freshness) · hour-groups → timeline nodes with gold markers · gold hairline on changed shots · severity dot on hi-diff · hero card on most-recent pair |
| 41 | `/admin/sites/[slug]/scores/[key]` | S | Score ring → big-hero number + delta chip + 30-day sparkline + mini context (peer rank, last-changed) · inputs → numbered finding rows · 3-week comparison KPI strip above |
| 42 | `/admin/build/[id]/pages` | S | KPI strip sparklines on Pending/Ready · page rows → numbered eyebrow matching sort_order · AI/SEO scores → ScoreCell pattern (tabular + severity dot) · per-row "Generate" → ghost outline only |
| 43 | `/admin/build/[id]/pages/[pageId]` | M | Header AI/SEO inline → mini-KPI capsules with severity dot + sparkline · job status → live pulse + progress bar for pending→claimed→running→ready · Generate → ghost; preview/publish owns the gradient |
| 44 | `/admin/agent/jobs/[id]` | S | Hero duration as 28px tabular · contextual progress bar `pending→claimed→running→done` · 3-col mini KPIs with eyebrow labels · output section card hairline + collapsible · error block → severity-dot list |
| 45 | `/admin/reports/weekly` | S | KpiCard sparkline on each tile · ▲▼ delta → TrendChip · hot/cold sections → eyebrow rank numbers · "Export PDF" gradient header CTA |
| 46 | `/admin/desktop` | S | DeskStat → KpiCard shape with sparkline · primary metric chip → accent-tinted pill matching nav badge · timeline dots on `lastSeenAt` column |
| 47 | `/admin/webhooks` | S | Add stat strip (total / active / failing in last 24h / signed) · "+ Add subscriber" → gradient · each Row gets a delivery-health StatusDot + tiny sparkline of success rate |
| 48 | `/admin/me/settings` | S | One gradient primary per section (Save profile dominant) · sessions `<table>` → leaderboard with StatusDot current/other · toggle rows → ProgressBar status indicator · "Current session" KPI tile at top |

**Phase 3 total:** ~23 pages, ~4-5 days.

---

## Phase 4 — Outliers requiring rebuild, not polish (2 days)

| # | Page | Effort | Rationale |
|---|---|---|---|
| 49 | `/admin/calls` | L | **Audit called it "v0 placeholder"** — no KPIs, no filters, no sparklines, audio player in raw card. Full rebuild: KPI strip (today / avg duration / answered % / unrecorded) · filter bar · severity-dot rows · live pulse on inbound-in-progress · vertical day-group timeline · audio frame · gradient "Provision number" header CTA |
| 50 | `/admin/settings` | M | 800-line single-column form scrollfest. Section eyebrow numbering (01/02/03/04 per provider) · 4-stat KPI strip at top (Gemini status / Anthropic / SMTP / Telegram) with `StatusDot pulse` · subtle gold-hairline divider between sections · demote duplicate Save buttons to ghost; one primary per section family |

---

## Phase 5 — XS sweep, low-touch + specialized (2-3 days)

Batch these in one focused session. Mostly: convert primary button to gradient, add KPI strip, eyebrow numbers, gold focus rings on forms.

| Page | Effort |
|---|---|
| `/admin/sops` (index) | XS |
| `/admin/sops/[slug]` | XS |
| `/admin/sops/new` | XS |
| `/admin/prompts` | XS |
| `/admin/prompts/[slot]` | XS |
| `/admin/templates` | XS |
| `/admin/templates/[id]` | XS |
| `/admin/templates/new` | XS |
| `/admin/users/new` | XS |
| `/admin/users/[id]/delete` | XS |
| `/admin/sites/new` | XS |
| `/admin/sites/connect` | XS |
| `/admin/sites/brand` (bulk) | S |
| `/admin/sites/[slug]/qa` | S |
| `/admin/sites/[slug]/pricing` | S |
| `/admin/agent/jobs/new` | S |
| `/admin/build/new` | XS |
| `/admin/content/new` | XS |
| `/admin/seo/sample-review` | S |
| `/admin/preview` | XS |
| `/admin/design` | XS |
| `/admin/chat` | S |

---

## Effort summary

| Phase | Pages | Effort | Cumulative |
|---|---|---|---|
| 0. Shared atoms | (toolkit) | 1-2 days | 1-2 days |
| 1. Foundation tier 1 | 12 | 3-4 days | 4-6 days |
| 2. Foundation tier 2 | 13 | 3-4 days | 7-10 days |
| 3. Detail | 23 | 4-5 days | 11-15 days |
| 4. Outlier rebuilds | 2 | 2 days | 13-17 days |
| 5. XS sweep | 22 | 2-3 days | 15-20 days |
| **Total** | **72** | **15-20 days** | |

(The 73rd page, `/admin/design`, is the design-system documentation page — it self-updates as we ship.)

---

## Visual moves dictionary

Quick reference — every page rebuild draws from this fixed vocabulary. Eight moves cover the entire portal.

| # | Move | Used for | Replaces |
|---|---|---|---|
| **M1** | KPI strip | 4-5 metric tile at top of every Foundation page | Plain `Stat` rows; left-border stat cards |
| **M2** | Bento card layout | Varied card sizes (hero + rails + strips) | Symmetric 3-col grids |
| **M3** | Numbered finding row | Lists of urgent items, drops, proposals, top 5/10 anything | Plain `RowList` rows |
| **M4** | Vertical timeline | Activity feeds, comment threads, status transitions | Plain ordered lists |
| **M5** | Gold-gradient `PrimaryCta` | The ONE most-important action per page | Multiple `bg-accent` buttons |
| **M6** | Live pulse `StatusDot` | Real-time signals (running jobs, online agents, in-progress trips) | Static green dots / text "Active" |
| **M7** | Mini progress bar | Multi-step state, completion percentages, segment counts | Flat 2px bars |
| **M8** | Gold-hairline card top | Feature cards that deserve emphasis | Plain `border-border` |

---

## Recommended commit cadence

Each phase ships as one PR + one deploy. Allows visual regression check after each phase.

1. **Phase 0** → 1 PR · 1 deploy (toolkit live, nothing changes visually yet)
2. **Phase 1** → 1 PR per 3-4 pages · 3-4 deploys (highest visibility — incremental shipping = incremental feedback)
3. **Phase 2** → 2 PRs of 6-7 pages each · 2 deploys
4. **Phase 3** → 4 PRs of ~6 pages each · 4 deploys
5. **Phase 4** → 2 PRs (calls + settings separately) · 2 deploys
6. **Phase 5** → 1 PR (XS sweep) · 1 deploy

Total: ~13 deploys over 15-20 working days.

---

## Open decisions for the operator

1. **Phase 0 first, or parallel with Phase 1?** Strong recommendation: Phase 0 first. Without the shared atoms, every Phase 1 page reimplements the same gradient/sparkline logic.
2. **Outliers in Phase 4 or moved earlier?** `/admin/calls` rebuild is L effort. If you use calls daily, move it into Phase 1. If once-a-week, Phase 4 is fine.
3. **Per-page or per-feature delivery?** This plan is per-page (one page polished at a time). Alternative: per-feature (e.g. "all SEO surfaces this week"). Per-page is more linear and easier to QA.
4. **Acceptance criteria?** Recommend defining the bar visually: a polished page must have (a) at least one KPI strip OR bento hero, (b) one primary gold CTA, (c) zero raw `<table>` if showing rows, (d) numbered eyebrows OR severity dots on any list of 5+ items.

---

*End of plan. Source audits stored at `/private/tmp/claude-501/.../tasks/{a565767753305cdb5,add869872093ffc09,a8f3d3a08e5b7c8d3,a1a2a8f3fd6c5caf1}.output` for per-page detail if needed.*
