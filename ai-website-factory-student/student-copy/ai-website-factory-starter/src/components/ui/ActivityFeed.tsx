import Link from "next/link";
import { Avatar } from "./Avatar";
import type { ActivityItem } from "@/lib/presence";
import { formatRelative } from "@/lib/utils";

/**
 * Unified activity timeline — tasks completed, tasks started, comments posted.
 *
 * Compact rail layout: avatar · verb + object · site · relative time.
 */
export function ActivityFeed({
  items,
  title = "Recent activity",
  emptyHint,
  hideHeader = false,
}: {
  items: ActivityItem[];
  title?: string;
  emptyHint?: string;
  hideHeader?: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      {!hideHeader ? (
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            {title}
          </h2>
          <span className="tnum text-xs text-text-faint">{items.length} events</span>
        </header>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-text-faint">
          {emptyHint ?? "Nothing yet — completed tasks and comments will appear here in real time."}
        </div>
      ) : (
        <ol role="list" className="relative px-4 py-3 space-y-3">
          {/* Vertical gold-marker timeline rail — matches the Obsidian prototype */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[22px] top-3 bottom-3 w-px"
            style={{ background: "var(--border)" }}
          />
          {items.map((item, i) => (
            <FeedRow
              key={`${item.kind}-${i}-${item.at.toISOString()}`}
              item={item}
              current={i === 0}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function FeedRow({ item, current }: { item: ActivityItem; current: boolean }) {
  const verb = verbFor(item);
  const tone = toneFor(item.kind);
  const markerColor =
    item.kind === "task_completed"
      ? "var(--success)"
      : item.kind === "task_started"
        ? "var(--info)"
        : current
          ? "var(--accent)"
          : "var(--text-faint)";
  return (
    <li className="group relative pl-7 flex items-start gap-3 transition-colors">
      {/* Timeline marker — replaces the avatar in the gutter so the rail reads continuous */}
      <span
        aria-hidden
        className="absolute left-0 top-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span className="block h-1.5 w-1.5 rounded-full" style={{ background: markerColor }} />
      </span>
      {item.actor ? (
        <Avatar email={item.actor.email} name={item.actor.name} size="sm" />
      ) : (
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-xs text-text-faint ring-1 ring-inset ring-border">
          ?
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-xs font-medium text-text">
            {item.actor ? item.actor.name ?? item.actor.email.split("@")[0] : "Someone"}
          </span>
          <span className={`text-xs ${tone}`}>{verb}</span>
          <Link
            href={`/admin/tasks/${item.taskId}`}
            className="truncate text-xs text-text-muted hover:text-text hover:underline"
          >
            {item.taskTitle}
          </Link>
          {item.siteSlug ? (
            <Link
              href={`/admin/sites/${item.siteSlug}`}
              className="ml-1 font-mono text-xs text-text-faint hover:text-text-muted"
            >
              {item.siteSlug}
            </Link>
          ) : null}
        </div>
        {item.kind === "task_comment" ? (
          <p className="mt-1 line-clamp-2 text-xs text-text-faint">
            “{item.body}”
          </p>
        ) : null}
      </div>

      <span className="tnum shrink-0 text-xs text-text-faint">
        {formatRelative(item.at)}
      </span>
    </li>
  );
}

function verbFor(item: ActivityItem): string {
  switch (item.kind) {
    case "task_completed":
      return "completed";
    case "task_started":
      return "started";
    case "task_comment":
      return "commented on";
  }
}

function toneFor(kind: ActivityItem["kind"]): string {
  switch (kind) {
    case "task_completed":
      return "text-success";
    case "task_started":
      return "text-info";
    case "task_comment":
      return "text-accent";
  }
}
