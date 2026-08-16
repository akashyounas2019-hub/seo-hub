"use client";

/**
 * SeoAgentTeam — the specialist crew that runs every queued job.
 *
 * Now shaped as an org chart: SEO Leader (AKS) sits at the top with the
 * page's primary CTAs inside his row, then a "delegates to" divider, then the
 * five specialists below. Each specialist card shows its own live activity
 * (queued / running / done) so the hierarchy is legible at a glance.
 *
 * Click any agent to open their profile — recent work history + an editable
 * "Skill instructions" field that steers how their queued jobs should behave.
 * Skill instructions persist locally per agent id.
 *
 * All avatars are custom SVG. No emoji, no clip art. Motion respects
 * prefers-reduced-motion.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export type AgentActivity = {
  queued: number;
  running: number;
  done7d: number;
};
export type AgentActivityMap = Record<string, AgentActivity>;

type Role = {
  id: string;
  name: string;
  title: string;
  hue: number;
  tagline: string;
  bio: string;
  focus: string[];
  history: { when: string; label: string; note: string; status: "done" | "running" | "queued" }[];
  defaultSkill: string;
  Avatar: React.FC<{ hue: number }>;
};

const LEADER: Pick<Role, "id" | "name" | "title" | "bio" | "focus" | "history" | "defaultSkill"> = {
  id: "leader",
  name: "AKS",
  title: "SEO Leader",
  bio: "Orchestrates every job — routes work to the right specialist, audits output against the checklist, and signs off before delivery.",
  focus: ["Routing", "Audit sign-off", "Escalation triage"],
  history: [
    { when: "12m ago", label: "Signed off villa-cleaning page", note: "Routed to Kaveh + Renner; all checks green.", status: "done" },
    { when: "38m ago", label: "Escalated 404 spike on /services", note: "Handed to Malik for redirect map.", status: "done" },
    { when: "1h ago",  label: "Weekly SEO plan drafted",         note: "Kicked off cluster brief with Silas.",  status: "running" },
  ],
  defaultSkill:
    "Route jobs by kind: research → Kaveh, backlinks → Renner, crawl/CWV → Malik, briefs/drafts → Silas, sitemaps/indexation → Idris. Always run the 60-point checklist before marking a job done. Escalate any job stuck > 15 minutes.",
};

const TEAM: Role[] = [
  {
    id: "onpage",
    name: "Kaveh Noor",
    title: "On-page Expert",
    hue: 152,
    tagline: "Titles · H1s · schema",
    bio: "Owns page-level SEO — title tags, meta descriptions, heading hierarchy, and schema markup for every page we ship.",
    focus: ["Title & meta rewrites", "H1–H3 hierarchy", "Schema (LocalBusiness, FAQ, Article)"],
    history: [
      { when: "6m ago",  label: "Rewrote 12 title tags · spotlesscleaningservices",  note: "CTR uplift model: +11%.", status: "done" },
      { when: "42m ago", label: "Added LocalBusiness schema to /contact",           note: "Passed rich-result test.", status: "done" },
      { when: "2h ago",  label: "Fixed H1 duplication on /services",                 note: "Consolidated to single H1.", status: "done" },
      { when: "3h ago",  label: "Schema audit — 8 pages",                            note: "In progress.", status: "running" },
    ],
    defaultSkill:
      "Rewrite title tags to 55–60 chars, ending with primary keyword. Meta descriptions 145–158 chars ending with a verb-led CTA. Enforce one H1 per page. Add schema only when the entity actually matches the page.",
    Avatar: OnPageAvatar,
  },
  {
    id: "offpage",
    name: "Renner Voss",
    title: "Off-page Expert",
    hue: 32,
    tagline: "Backlinks · outreach",
    bio: "Runs backlink acquisition, digital PR outreach, and referring-domain quality control.",
    focus: ["Prospect research", "Outreach sequences", "Anchor-text diversification"],
    history: [
      { when: "18m ago", label: "10 new referring domains logged",     note: "DR avg 42.", status: "done" },
      { when: "1h ago",  label: "Outreach batch — Dubai lifestyle blogs", note: "Sent 24 personalised pitches.", status: "done" },
      { when: "3h ago",  label: "Disavow file updated",                 note: "Removed 3 toxic domains.", status: "done" },
    ],
    defaultSkill:
      "Only pursue referring domains with DR ≥ 25 and topical relevance to home services, hospitality, or UAE lifestyle. Vary anchor text — no exact-match past 12%. Reject paid-link brokers on sight.",
    Avatar: OffPageAvatar,
  },
  {
    id: "technical",
    name: "Malik Rhodes",
    title: "Technical Expert",
    hue: 200,
    tagline: "Crawl · CWV · redirects",
    bio: "Handles crawl budget, Core Web Vitals, redirect maps, and every technical guardrail that keeps the site indexable.",
    focus: ["CWV budgets", "Redirect chains", "Robots + canonicals"],
    history: [
      { when: "9m ago",  label: "LCP fix shipped — /home", note: "Hero image → AVIF, 380ms saved.", status: "done" },
      { when: "35m ago", label: "Redirect chain collapsed", note: "3-hop chain → 1 hop on /services/*.", status: "done" },
      { when: "1h ago",  label: "Robots.txt sweep — 51 sites", note: "In progress.", status: "running" },
    ],
    defaultSkill:
      "Keep LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1 on mobile. Never allow redirect chains > 1 hop. Every non-canonical URL must have rel=canonical to its canonical.",
    Avatar: TechnicalAvatar,
  },
  {
    id: "blog",
    name: "Silas Iyer",
    title: "Blog Writer",
    hue: 288,
    tagline: "Briefs · drafts · edits",
    bio: "Writes and edits long-form editorial — briefs, first drafts, and final passes tuned to the brand voice.",
    focus: ["Search-intent-first briefs", "Editorial voice", "Internal linking"],
    history: [
      { when: "22m ago", label: "Draft: 'Villa handover checklist'",  note: "1,180 words, 4 internal links.", status: "done" },
      { when: "1h ago",  label: "Brief: 'Post-construction cleaning'", note: "Handed to editor.", status: "done" },
      { when: "2h ago",  label: "Voice pass — 3 apartment pages",     note: "In review.", status: "running" },
    ],
    defaultSkill:
      "Follow the brand voice: confident, quiet, specific. Banned words: sparkling, shine, sparkle, wow, magic, amazing. Every claim must be concrete or cut. Body ≤ 2 sentences per paragraph.",
    Avatar: BlogAvatar,
  },
  {
    id: "techseo",
    name: "Idris Hale",
    title: "Technical SEO",
    hue: 340,
    tagline: "Sitemaps · indexation",
    bio: "Owns sitemaps, indexation coverage in GSC, hreflang, and every signal that decides which URLs Google sees.",
    focus: ["XML sitemaps", "Indexation coverage", "Hreflang correctness"],
    history: [
      { when: "14m ago", label: "Sitemap regenerated — 12 sites",    note: "Only canonical URLs.", status: "done" },
      { when: "48m ago", label: "GSC coverage sweep",                note: "3 crawl anomalies flagged.", status: "done" },
      { when: "2h ago",  label: "Hreflang matrix — EN/AR",           note: "In progress.", status: "running" },
    ],
    defaultSkill:
      "Sitemaps contain canonical URLs only — never redirects, never 4xx/5xx. hreflang tags must be reciprocal. Discovered-not-indexed URLs get triaged within 24h.",
    Avatar: TechSeoAvatar,
  },
];

/* ─────────── Root component ─────────── */

export function SeoAgentTeam({
  activityByAgent,
  totalActive,
  totalQueued,
}: {
  activityByAgent: AgentActivityMap;
  totalActive: number;
  totalQueued: number;
}) {
  // Leader activity is still surfaced by future callers; kept for now so the
  // prop contract stays stable if it needs to be re-added to LeaderHero.
  void activityByAgent[LEADER.id];

  return (
    <section
      aria-label="SEO agent team"
      className="relative overflow-hidden rounded-2xl border border-border bg-surface"
      style={{
        background:
          "radial-gradient(1200px 400px at 50% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%), linear-gradient(180deg, var(--surface), var(--surface-2))",
      }}
    >
      <GridBackdrop />

      <div className="relative px-5 pt-5 pb-6 sm:px-8 sm:pt-7 sm:pb-9">
        {/* Side-by-side layout on desktop:
              [ Leader plate — 50% ] [ Specialists grid — 50% ]
            On mobile the two collapse to a vertical stack.
            The connector tree is drawn between them (horizontal on desktop,
            top-down on mobile). */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
          {/* ── LEADER HERO — tighter, half-width on desktop ── */}
          <div className="relative">
            <LeaderHero
              active={totalActive > 0}
              totalActive={totalActive}
              totalQueued={totalQueued}
              href={`/admin/agent/roster/${LEADER.id}`}
            />
            {/* Horizontal wire that exits the plate on the right and connects
                into the specialists container. Hidden on mobile where the
                stack changes to vertical (mobile uses the top-down tree). */}
            <HorizontalConnector active={totalActive > 0} />
          </div>

          {/* ── SPECIALISTS — visually distinct container, wired in ── */}
          <div
            className="relative rounded-2xl border border-dashed border-border/70 bg-surface-2/40 p-3 sm:p-4"
            style={{ minHeight: "100%" }}
          >
            {/* Small label so the visual separation is intentional */}
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              Delegates
            </p>
            {/* Mobile-only: top-down wire from the leader plate above */}
            <VerticalConnector active={totalActive > 0} count={TEAM.length} />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
              {TEAM.map((role, idx) => (
                <AgentCard
                  key={role.id}
                  role={role}
                  index={idx}
                  activity={activityByAgent[role.id] ?? { queued: 0, running: 0, done7d: 0 }}
                  href={`/admin/agent/roster/${role.id}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{keyframes}</style>
    </section>
  );
}

/* ─────────── Hierarchy divider ("delegates to") ─────────── */

/**
 * Vertical connector — only shown on MOBILE where the leader plate stacks
 * above the specialists. Draws the leader drop + horizontal trunk + drops
 * to each specialist column.
 *
 * Renamed from OrgChartTree since the layout is now horizontal on desktop.
 */
function VerticalConnector({ active, count }: { active: boolean; count: number }) {
  const stroke = active ? "var(--accent)" : "color-mix(in oklab, var(--accent) 40%, var(--border))";
  const glow = active ? "drop-shadow(0 0 4px color-mix(in oklab, var(--accent) 45%, transparent))" : "none";

  // viewBox is 100 wide × 40 tall — width is the grid, height is the padding
  // between leader row and specialist row.
  const trunkY = 20;
  const columnCenters = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);
  const trunkStart = columnCenters[0];
  const trunkEnd = columnCenters[columnCenters.length - 1];

  return (
    // Only visible on mobile — desktop uses the horizontal connector.
    <div className="relative mb-3 block lg:hidden" aria-hidden>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-8 w-full"
        style={{ filter: glow }}
      >
        <line x1="50" y1="0" x2="50" y2={trunkY} stroke={stroke} strokeWidth="0.6" />
        <line
          x1={trunkStart}
          y1={trunkY}
          x2={trunkEnd}
          y2={trunkY}
          stroke={stroke}
          strokeWidth="0.6"
        />
        {columnCenters.map((cx, i) => (
          <line
            key={i}
            x1={cx}
            y1={trunkY}
            x2={cx}
            y2="40"
            stroke={stroke}
            strokeWidth="0.6"
          />
        ))}
        {columnCenters.map((cx, i) => (
          <circle key={`j${i}`} cx={cx} cy={trunkY} r="0.9" fill={stroke} />
        ))}
        <circle cx="50" cy="0" r="1.2" fill={stroke} />
      </svg>
    </div>
  );
}

/**
 * Horizontal connector — only shown on DESKTOP where the leader plate sits
 * to the LEFT of the specialists container. The wire exits the plate on the
 * right edge and enters the specialists container on the left edge.
 *
 * Absolutely positioned so it sits in the tiny gap between the two grid
 * columns; the SVG spans the full plate height and reaches into the gutter.
 */
function HorizontalConnector({ active }: { active: boolean }) {
  const stroke = active
    ? "var(--accent)"
    : "color-mix(in oklab, var(--accent) 40%, var(--border))";
  const glow = active
    ? "drop-shadow(0 0 3px color-mix(in oklab, var(--accent) 45%, transparent))"
    : "none";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -right-4 hidden w-8 lg:block"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="h-full w-full"
        style={{ filter: glow }}
      >
        {/* Horizontal wire exiting the plate at mid-height */}
        <line x1="0" y1="50" x2="100" y2="50" stroke={stroke} strokeWidth="1.2" />
        {/* Endpoint nodes */}
        <circle cx="4" cy="50" r="2" fill={stroke} />
        <circle cx="96" cy="50" r="2" fill={stroke} />
      </svg>
    </div>
  );
}

/* ─────────── Leader hero — vertical stack, expanded height ───────────
 *
 * Layout (top → bottom, all centered):
 *   1. Bot logo (large avatar with double ring)
 *   2. Name (AKS) — display size
 *   3. Title (SEO Leader) — accent-colored eyebrow
 *   4. Working / Queued stats
 *   5. Action buttons (Add Agent · Assign · New Job)
 *
 * The plate uses a distinct radial gradient + brass hairline + inner ring
 * to visually signify leadership. Height is deliberately expanded (~340px
 * on desktop) so the leader dominates the vertical hierarchy above the
 * specialist row.
 */
function LeaderHero({
  active,
  totalActive,
  totalQueued,
  href,
}: {
  active: boolean;
  totalActive: number;
  totalQueued: number;
  href: string;
}) {
  return (
    <div className="relative">
      <span aria-hidden className="agent-halo" style={{ left: "50%" }} />
      <span aria-hidden className="agent-halo agent-halo--outer" style={{ left: "50%" }} />
      <div
        className="agent-leader relative flex flex-col items-center gap-3 rounded-2xl border-2 border-accent/25 px-6 py-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.45)] sm:gap-4 sm:px-8 sm:py-7"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%), linear-gradient(180deg, color-mix(in oklab, var(--accent) 6%, var(--surface)) 0%, var(--surface-2) 100%)",
        }}
      >
        {/* Inner brass hairline for the "plate" edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-2 rounded-xl"
          style={{ border: "1px solid color-mix(in oklab, var(--accent) 20%, transparent)" }}
        />

        {/* 1) Bot logo — large avatar */}
        <Link
          href={href}
          className="group relative z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Open AKS profile"
        >
          <span className="relative grid h-20 w-20 place-items-center overflow-hidden rounded-full ring-2 ring-accent/60 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.4)] transition group-hover:ring-accent">
            <LeaderAvatar />
            <StatusDot active={active} className="absolute -bottom-0.5 -right-0.5 h-4 w-4" />
          </span>
        </Link>

        {/* 2 + 3) Name + title tight-stacked (padding between them reduced) */}
        <div className="relative z-10 flex flex-col items-center gap-0.5">
          <Link
            href={href}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <h2 className="text-3xl font-semibold tracking-tight text-text hover:underline decoration-accent/60 decoration-2 underline-offset-4">
              AKS
            </h2>
          </Link>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
            SEO Leader
          </p>
        </div>

        {/* 4) Stats — Working + Queued on the SAME horizontal line */}
        <div className="relative z-10 flex items-center divide-x divide-border rounded-lg border border-border bg-surface/70 backdrop-blur">
          <InlineStat label="Working" value={totalActive} live={totalActive > 0} />
          <InlineStat label="Queued" value={totalQueued} />
        </div>

        {/* 5) Action buttons — harmonized: same size, radius, weight, cyan family */}
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
          <ActionButton href="/admin/agent/roster/new" variant="ghost">
            + Add Agent
          </ActionButton>
          <ActionButton href="/admin/agent/tasks/new" variant="ghost">
            Assign Jobs
          </ActionButton>
          <ActionButton href="/admin/agent/jobs/new" variant="primary">
            + New Job
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Small inline stat used inside the leader's Working/Queued strip. Renders
 * label + value on ONE line so both stats fit horizontally in a tight bar
 * (previously each stat had its own vertical block, wasting height).
 */
function InlineStat({
  label,
  value,
  live,
}: {
  label: string;
  value: number;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
        {label}
      </span>
      <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-text">
        {live ? <span className="live-dot inline-block" aria-hidden /> : null}
        {value}
      </span>
    </div>
  );
}

/**
 * Harmonized action button used in the leader plate. Two variants share the
 * exact same sizing, weight, and border-radius so the three buttons read as
 * a single, professional cluster — only the fill differs.
 */
function ActionButton({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "ghost" | "primary";
  children: ReactNode;
}) {
  const shared =
    "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold tracking-tight transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const styles =
    variant === "primary"
      ? "bg-accent text-white shadow-sm hover:bg-accent-hover"
      : "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20";
  return (
    <Link href={href} className={`${shared} ${styles}`}>
      {children}
    </Link>
  );
}

/* ─────────── Specialist card ─────────── */

function AgentCard({
  role,
  index,
  activity,
  href,
}: {
  role: Role;
  index: number;
  activity: AgentActivity;
  href: string;
}) {
  const busy = activity.running + activity.queued > 0;
  return (
    <Link
      href={href}
      className="agent-card group relative flex flex-col items-center rounded-lg border border-border bg-surface px-2 py-3 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{
        animationDelay: `${index * 120}ms`,
        background:
          "linear-gradient(180deg, var(--surface), color-mix(in oklab, var(--surface-2) 60%, var(--surface)))",
      }}
    >
      <span
        aria-hidden
        className="agent-ring"
        style={{
          background: `conic-gradient(from 0deg, hsl(${role.hue} 80% 60% / 0.55), transparent 55%)`,
          animationDelay: `${index * 300}ms`,
          width: 46,
          height: 46,
          top: 8,
        }}
      />
      <span
        className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full ring-1 ring-border"
        style={{
          background: `radial-gradient(circle at 50% 30%, hsl(${role.hue} 60% 92%), var(--surface))`,
        }}
      >
        <role.Avatar hue={role.hue} />
        <StatusDot active={busy} className="absolute -bottom-0.5 -right-0.5 h-3 w-3" />
      </span>
      {/* Name — primary identifier */}
      <p className="mt-2 truncate text-[12px] font-semibold leading-tight text-text">{role.name}</p>
      {/* Primary role */}
      <p
        className="mt-0.5 line-clamp-2 text-[9px] font-semibold uppercase leading-tight tracking-[0.1em]"
        style={{ color: `hsl(${role.hue} 40% 45%)` }}
      >
        {role.title}
      </p>
    </Link>
  );
}

/* ─────────── Live stat / status dot ─────────── */

function LiveStat({
  label,
  value,
  live,
  sublabel,
}: {
  label: string;
  value: number;
  live?: boolean;
  sublabel?: string;
}) {
  return (
    <div className="flex flex-col items-start">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-faint">
        {label}
        {sublabel ? <span className="ml-1 text-text-faint/70">· {sublabel}</span> : null}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold tabular-nums text-text">
        {live ? <span className="live-dot inline-block" aria-hidden /> : null}
        {value}
      </p>
    </div>
  );
}

function StatusDot({ active, className = "" }: { active: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-3.5 w-3.5 place-items-center rounded-full ring-2 ring-surface ${className}`}
      style={{ background: active ? "hsl(148 65% 45%)" : "hsl(220 8% 70%)" }}
    >
      {active ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: "white",
            animation: "agent-pulse 1600ms ease-in-out infinite",
          }}
        />
      ) : null}
    </span>
  );
}

/* ─────────── Backdrop ─────────── */

function GridBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.35]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="agent-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="var(--border)" strokeWidth="0.5" />
        </pattern>
        <radialGradient id="agent-vignette" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="black" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#agent-grid)" />
      <rect width="100%" height="100%" fill="url(#agent-vignette)" />
    </svg>
  );
}

/* ─────────── Avatars ─────────── */

function LeaderAvatar() {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <defs>
        <linearGradient id="ld-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7f5f0" />
          <stop offset="100%" stopColor="#e9e2d2" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#ld-body)" />
      {[-40, -20, 0, 20, 40].map((deg) => (
        <rect
          key={deg}
          x="23"
          y="4"
          width="2"
          height="5"
          rx="1"
          fill="hsl(38 55% 45%)"
          transform={`rotate(${deg} 24 14)`}
        />
      ))}
      <circle cx="24" cy="22" r="7" fill="#2a2a2a" />
      <path d="M10 42 C 12 32 36 32 38 42 Z" fill="#2a2a2a" />
      <circle cx="21.5" cy="20" r="1.2" fill="#f4c07a" />
      <circle cx="26.5" cy="20" r="1.2" fill="#f4c07a" />
    </svg>
  );
}


function OnPageAvatar({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <circle cx="24" cy="20" r="7" fill={`hsl(${hue} 30% 25%)`} />
      <path d="M11 40 C 13 31 35 31 37 40 Z" fill={`hsl(${hue} 30% 25%)`} />
      <circle cx="34" cy="14" r="4.5" fill="none" stroke={`hsl(${hue} 60% 40%)`} strokeWidth="1.5" />
      <line x1="37.5" y1="17.5" x2="41" y2="21" stroke={`hsl(${hue} 60% 40%)`} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="21.5" cy="19" r="1.1" fill="#fff" />
      <circle cx="26.5" cy="19" r="1.1" fill="#fff" />
    </svg>
  );
}

function OffPageAvatar({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <circle cx="24" cy="20" r="7" fill={`hsl(${hue} 30% 25%)`} />
      <path d="M11 40 C 13 31 35 31 37 40 Z" fill={`hsl(${hue} 30% 25%)`} />
      <g stroke={`hsl(${hue} 60% 45%)`} strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M32 12 a3 3 0 0 1 4 4 l-1.5 1.5" />
        <path d="M40 18 a3 3 0 0 1 -4 4 l-1.5 -1.5" />
      </g>
      <circle cx="21.5" cy="19" r="1.1" fill="#fff" />
      <circle cx="26.5" cy="19" r="1.1" fill="#fff" />
    </svg>
  );
}

function TechnicalAvatar({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <circle cx="24" cy="20" r="7" fill={`hsl(${hue} 30% 25%)`} />
      <path d="M11 40 C 13 31 35 31 37 40 Z" fill={`hsl(${hue} 30% 25%)`} />
      <g stroke={`hsl(${hue} 65% 50%)`} strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M17 10 h6 v3" />
        <path d="M31 10 h-6 v3" />
        <circle cx="17" cy="10" r="1.4" fill={`hsl(${hue} 65% 50%)`} />
        <circle cx="31" cy="10" r="1.4" fill={`hsl(${hue} 65% 50%)`} />
      </g>
      <circle cx="21.5" cy="19" r="1.1" fill="#fff" />
      <circle cx="26.5" cy="19" r="1.1" fill="#fff" />
    </svg>
  );
}

function BlogAvatar({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <circle cx="24" cy="20" r="7" fill={`hsl(${hue} 30% 25%)`} />
      <path d="M11 40 C 13 31 35 31 37 40 Z" fill={`hsl(${hue} 30% 25%)`} />
      <g fill={`hsl(${hue} 60% 45%)`}>
        <path d="M34 10 l5 3 l-6 6 l-3 -5 z" />
        <circle cx="35" cy="14.5" r="0.9" fill="#fff" />
      </g>
      <circle cx="21.5" cy="19" r="1.1" fill="#fff" />
      <circle cx="26.5" cy="19" r="1.1" fill="#fff" />
    </svg>
  );
}

function TechSeoAvatar({ hue }: { hue: number }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full">
      <circle cx="24" cy="20" r="7" fill={`hsl(${hue} 30% 25%)`} />
      <path d="M11 40 C 13 31 35 31 37 40 Z" fill={`hsl(${hue} 30% 25%)`} />
      <g stroke={`hsl(${hue} 60% 50%)`} strokeWidth="1.4" fill="none">
        <path d="M35 10 v3 M30 16 h10 M30 16 v2 M35 16 v2 M40 16 v2" strokeLinecap="round" />
        <rect x="33.5" y="8.5" width="3" height="2" fill={`hsl(${hue} 60% 50%)`} />
        <rect x="28.5" y="18" width="3" height="2" fill={`hsl(${hue} 60% 50%)`} />
        <rect x="33.5" y="18" width="3" height="2" fill={`hsl(${hue} 60% 50%)`} />
        <rect x="38.5" y="18" width="3" height="2" fill={`hsl(${hue} 60% 50%)`} />
      </g>
      <circle cx="21.5" cy="19" r="1.1" fill="#fff" />
      <circle cx="26.5" cy="19" r="1.1" fill="#fff" />
    </svg>
  );
}

/* ─────────── Motion ─────────── */

const keyframes = `
  @keyframes agent-pulse {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50% { transform: scale(1.6); opacity: 0.3; }
  }
  @keyframes agent-float {
    0% { transform: translateY(4px); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes agent-ring-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes agent-halo-pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.35; }
    50% { transform: translate(-50%, -50%) scale(1.12); opacity: 0.08; }
  }
  @keyframes agent-slide {
    from { transform: translateX(24px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes agent-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .agent-card {
    animation: agent-float 480ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
    transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 220ms;
    cursor: pointer;
  }
  .agent-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklab, var(--accent) 40%, var(--border));
  }
  .agent-card:active { transform: translateY(-1px) scale(0.97); }
  .agent-leader { transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1); cursor: pointer; }
  .agent-leader:hover { transform: translateY(-1px); }
  .agent-leader:active { transform: scale(0.97); }
  .agent-ring {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 60px;
    border-radius: 9999px;
    filter: blur(0.3px);
    animation: agent-ring-spin 6s linear infinite;
    opacity: 0.9;
    -webkit-mask: radial-gradient(circle, transparent 26px, black 27px);
            mask: radial-gradient(circle, transparent 26px, black 27px);
  }
  .agent-halo {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 140px;
    height: 140px;
    border-radius: 9999px;
    background: radial-gradient(circle, color-mix(in oklab, var(--accent) 22%, transparent), transparent 65%);
    animation: agent-halo-pulse 3200ms ease-in-out infinite;
    pointer-events: none;
  }
  .agent-halo--outer {
    width: 220px;
    height: 220px;
    animation-duration: 4600ms;
    animation-delay: 400ms;
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: reduce) {
    .agent-card, .agent-ring, .agent-halo, .agent-leader { animation: none !important; }
  }
`;
