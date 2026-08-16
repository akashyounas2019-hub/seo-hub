/**
 * /admin/fix-queue — Pending fix proposals.
 *
 * Each row is an audit-issue → fix-job proposal. Operator approves (queues
 * Mac-worker job) or rejects. Bulk-approve by kind/site.
 */
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { fixProposals, sites, fixAutoApproveRules } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { TechnicalScoutTabs } from "@/components/ui/TechnicalScoutTabs";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import { FixQueueActions } from "./FixQueueActions";

export const dynamic = "force-dynamic";

export default async function FixQueuePage() {
  await ensureSchema();
  await requireAdmin();

  const pending = await db()
    .select({
      id: fixProposals.id,
      siteId: fixProposals.siteId,
      siteName: sites.name,
      siteSlug: sites.slug,
      fixKind: fixProposals.fixKind,
      label: fixProposals.label,
      preview: fixProposals.preview,
      priority: fixProposals.priority,
      input: fixProposals.input,
      createdAt: fixProposals.createdAt,
    })
    .from(fixProposals)
    .innerJoin(sites, eq(sites.id, fixProposals.siteId))
    .where(eq(fixProposals.status, "pending"))
    .orderBy(desc(fixProposals.priority), desc(fixProposals.createdAt))
    .limit(200);

  // Group by fixKind for bulk-approve.
  const byKind = new Map<string, typeof pending>();
  for (const p of pending) {
    const list = byKind.get(p.fixKind) ?? [];
    list.push(p);
    byKind.set(p.fixKind, list);
  }

  const autoRules = await db().select().from(fixAutoApproveRules);
  const autoEnabled = new Set(
    autoRules.filter((r) => r.enabled && !r.siteId).map((r) => r.fixKind),
  );

  // Summary strip — computed across the full pending set.
  const summary = {
    pending: pending.length,
    high: pending.filter((p) => p.priority === "high").length,
    sites: new Set(pending.map((p) => p.siteId)).size,
    kinds: byKind.size,
  };

  // Pull a compact before→after preview from the resolved job input where the
  // worker stamped one (e.g. {from, to} / {before, after} / {old_title, new_title}).
  function beforeAfter(input: Record<string, unknown> | null): { before?: string; after?: string } {
    const i = input ?? {};
    const str = (v: unknown) => (v == null ? undefined : typeof v === "object" ? JSON.stringify(v) : String(v));
    const before = str(i.before ?? i.from ?? i.old ?? i.old_title ?? i.current);
    const after = str(i.after ?? i.to ?? i.new ?? i.new_title ?? i.proposed);
    return { before, after };
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <section className="space-y-3 pt-2">
        <p className="text-xs text-text-faint">Network Health · Fix queue</p>
        <h1 className="text-3xl font-medium tracking-tightish text-text">
          Pending fix proposals
        </h1>
        <p className="max-w-[68ch] text-md text-text-muted">
          {pending.length === 0
            ? "Nothing pending. Audits propose fixes; auto-approve rules handle low-risk categories without you clicking."
            : `${pending.length} pending. Approve to queue a Mac-worker job (subscription only — zero API spend).`}
        </p>
      </section>

      <TechnicalScoutTabs />

      {pending.length > 0 && (
        <StatStrip columns={4}>
          <Stat label="Pending" value={summary.pending} />
          <Stat label="High risk" value={summary.high} tone={summary.high > 0 ? "danger" : "neutral"} />
          <Stat label="Sites affected" value={summary.sites} tone="info" />
          <Stat label="Fix categories" value={summary.kinds} />
        </StatStrip>
      )}

      {Array.from(byKind.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([kind, list]) => (
        <section key={kind} className="space-y-3">
          <header className="flex items-baseline justify-between border-b border-border pb-2">
            <h2 className="text-lg font-medium tracking-tightish text-text">
              <code>{kind}</code>
              <span className="ml-3 text-xs font-normal text-text-faint">
                {list.length} pending
                {autoEnabled.has(kind) && <span className="ml-2 text-green-600">· auto-approve ON</span>}
              </span>
            </h2>
            <FixQueueActions fixKind={kind} bulkCount={list.length} autoEnabled={autoEnabled.has(kind)} />
          </header>
          <RowList>
            {list.slice(0, 30).map((p) => {
              const ba = beforeAfter(p.input as Record<string, unknown> | null);
              return (
              <Row key={p.id}>
                <div className="flex w-full items-center gap-3">
                  <Pill tone={p.priority === "high" ? "danger" : p.priority === "low" ? "neutral" : "info"}>
                    {p.priority} risk
                  </Pill>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-md text-text">{p.label}</div>
                    {/* What it changes — explicit before→after where the proposal carries one,
                        else the free-form preview text. */}
                    {ba.before || ba.after ? (
                      <div className="truncate text-xs text-text-muted">
                        {ba.before != null && <span className="line-through opacity-70">{ba.before}</span>}
                        {ba.before != null && ba.after != null && <span> → </span>}
                        {ba.after != null && <span className="text-text">{ba.after}</span>}
                      </div>
                    ) : p.preview ? (
                      <div className="truncate text-xs text-text-muted">{p.preview}</div>
                    ) : null}
                    <div className="truncate text-xs text-text-faint">
                      <Link href={`/admin/sites/${p.siteSlug}/health`} className="hover:text-text">
                        {p.siteName}
                      </Link>
                      {" · "}{formatRelative(p.createdAt)}
                    </div>
                  </div>
                  <FixQueueActions proposalId={p.id} />
                </div>
              </Row>
              );
            })}
            {list.length > 30 && (
              <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-faint">
                _… and {list.length - 30} more in this category_
              </div>
            )}
          </RowList>
        </section>
      ))}

      {pending.length === 0 && (
        <section className="rounded-md border border-border bg-surface px-6 py-10 text-center text-md text-text-muted">
          No pending fix proposals.
        </section>
      )}
    </div>
  );
}
