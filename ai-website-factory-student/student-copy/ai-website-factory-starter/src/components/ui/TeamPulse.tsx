import Link from "next/link";
import { AvatarWithDot } from "./Avatar";
import { Pill } from "./Row";
import { presenceLabel, presenceTone, type TeamMemberPresence } from "@/lib/presence";

/**
 * Card-style live team roster.
 *
 * Each row shows: avatar with presence dot · name + role · current focus (or
 * idle/last-seen) · today's quick stats (done/open/overdue).
 *
 * Pair with <AutoRefresh /> on the page for live updates.
 */
export function TeamPulse({
  members,
  title = "Team pulse",
  showOnlineCount = true,
}: {
  members: TeamMemberPresence[];
  title?: string;
  showOnlineCount?: boolean;
}) {
  const onlineCount = members.filter((m) => m.presence === "online").length;
  const todayCount = members.filter((m) => m.presence === "today").length;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            {title}
          </h2>
          {showOnlineCount && members.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="relative inline-flex h-2 w-2">
                {onlineCount > 0 ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                ) : null}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    onlineCount > 0 ? "bg-success" : "bg-text-faint"
                  }`}
                />
              </span>
              <span className="tnum text-xs text-text-muted">
                {onlineCount} online{todayCount > 0 ? ` · ${todayCount} today` : ""}
              </span>
            </div>
          ) : null}
        </div>
        <Link
          href="/admin/users"
          className="text-xs text-text-faint hover:text-text-muted"
        >
          Manage team →
        </Link>
      </header>

      {members.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-text-faint">
          No teammates yet — invite managers and students from the{" "}
          <Link href="/admin/users" className="text-text-muted underline-offset-2 hover:underline">
            Users page
          </Link>
          .
        </div>
      ) : (
        <ul role="list" className="divide-y divide-border">
          {members.map((m) => (
            <TeamPulseRow key={m.id} member={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamPulseRow({ member: m }: { member: TeamMemberPresence }) {
  const tone = presenceTone(m.presence);
  const isOnline = m.presence === "online";

  return (
    <li>
      <Link
        href={`/admin/users/${m.id}`}
        className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <AvatarWithDot
          email={m.email}
          name={m.name}
          role={m.role}
          size="md"
          tone={tone}
          pulse={isOnline}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium text-text">
              {m.name ?? m.email.split("@")[0]}
            </span>
            <RoleTag role={m.role} />
            <span className="hidden truncate text-xs text-text-faint sm:inline">
              {presenceLabel(m.presence, m.lastSeenAt)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
            <FocusIcon kind={m.focus.kind} />
            <span className="truncate">
              {m.focus.detail ? (
                <>
                  <span className="text-text-faint">{m.focus.label}</span>{" "}
                  <span className="text-text-muted">{m.focus.detail}</span>
                </>
              ) : (
                m.focus.label
              )}
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <StatChip
            label="done"
            value={m.tasksDoneToday}
            tone={m.tasksDoneToday > 0 ? "success" : "neutral"}
          />
          <StatChip
            label="open"
            value={m.tasksOpen}
            tone={m.tasksOpen > 0 ? "info" : "neutral"}
          />
          {m.tasksOverdue > 0 ? (
            <StatChip label="late" value={m.tasksOverdue} tone="danger" />
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function RoleTag({ role }: { role: string }) {
  const tone =
    role === "admin" ? ("danger" as const) : role === "manager" ? ("warning" as const) : ("info" as const);
  return (
    <Pill tone={tone}>
      <span className="text-xs">{role}</span>
    </Pill>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "danger" | "neutral";
}) {
  const c =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : tone === "danger"
          ? "text-danger"
          : "text-text-faint";
  return (
    <span className="inline-flex items-baseline gap-1 rounded-sm border border-border bg-surface px-1.5 py-0.5">
      <span className={`tnum text-xs font-semibold ${c}`}>{value}</span>
      <span className="text-xs uppercase tracking-wider text-text-faint">{label}</span>
    </span>
  );
}

function FocusIcon({ kind }: { kind: "task" | "comment" | "idle" | "never" }) {
  const common = "h-3 w-3 shrink-0 text-text-faint";
  if (kind === "task") {
    return (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={common} aria-hidden>
        <rect x="2" y="2.5" width="8" height="7" rx="1.5" />
        <path d="M4.5 5.5h3M4.5 7.5h2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "comment") {
    return (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={common} aria-hidden>
        <path d="M2 4a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 10 4v3a1.5 1.5 0 0 1-1.5 1.5H5l-2 2v-2H3.5A1.5 1.5 0 0 1 2 7V4z" />
      </svg>
    );
  }
  if (kind === "never") {
    return (
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={common} aria-hidden>
        <circle cx="6" cy="6" r="4" />
        <path d="M6 4v2.5l1.5 1" strokeLinecap="round" />
      </svg>
    );
  }
  // idle
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={common} aria-hidden>
      <circle cx="6" cy="6" r="4" />
    </svg>
  );
}
