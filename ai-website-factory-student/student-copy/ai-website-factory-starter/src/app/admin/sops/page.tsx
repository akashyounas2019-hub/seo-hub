/**
 * P6 — Standard operating procedures index.
 *
 * Lists SOPs grouped by category, with pinned ones up top.
 */
import Link from "next/link";
import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { sops } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CATEGORIES = ["general", "seo", "content", "ops", "support"];

export default async function SopsIndex({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const category = searchParams.category && CATEGORIES.includes(searchParams.category) ? searchParams.category : undefined;
  const q = searchParams.q?.trim();

  const conditions = [];
  if (category) conditions.push(eq(sops.category, category));
  if (q) conditions.push(or(ilike(sops.title, `%${q}%`), ilike(sops.body, `%${q}%`)));

  const list = await db()
    .select()
    .from(sops)
    .where(conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : conditions.reduce((acc, c) => (acc ? sql`${acc} AND ${c}` : c))) : undefined)
    .orderBy(desc(sops.pinned), desc(sops.updatedAt));

  const [stats] = await db()
    .select({ total: sql<number>`count(*)::int`, pinned: sql<number>`count(*) filter (where pinned = true)::int` })
    .from(sops);

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="">SOPs</h1>
            <p className="mt-1.5 text-xs text-text-muted">
              Standard operating procedures — the team&apos;s shared playbook. Pinned ones surface first.
            </p>
          </div>
          <Link href="/admin/sops/new" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-brand-navy-deep hover:bg-accent-hover">
            + New SOP
          </Link>
        </div>
      </header>

      <form className="flex flex-wrap items-center gap-2" action="/admin/sops">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title + body…"
          className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
        <select
          name="category"
          defaultValue={category ?? ""}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs text-text hover:border-accent">Search</button>
      </form>

      {list.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-xs text-text-muted">
          <p className="font-medium text-text">No SOPs match.</p>
          <p className="mt-1">Start one with the "+ New SOP" button.</p>
        </div>
      ) : (
        <RowList footer={`${list.length} of ${stats?.total ?? 0} — ${stats?.pinned ?? 0} pinned`}>
          {list.map((s) => (
            <Row key={s.id}>
              <Link href={`/admin/sops/${s.slug}`} className="flex flex-1 items-center gap-3">
                <Pill tone={s.category === "seo" ? "info" : s.category === "content" ? "accent" : s.category === "ops" ? "warning" : "neutral"}>{s.category}</Pill>
                {s.pinned ? <span className="text-xs text-warning" title="Pinned">●</span> : null}
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-text">{s.title}</span>
                  {(s.tags as string[])?.length > 0 ? (
                    <span className="ml-2 font-mono text-xs text-text-faint">{(s.tags as string[]).map((t) => `#${t}`).join(" ")}</span>
                  ) : null}
                </div>
                <span className="text-xs text-text-faint">updated {formatRelative(s.updatedAt)}</span>
              </Link>
            </Row>
          ))}
        </RowList>
      )}
    </div>
  );
}
