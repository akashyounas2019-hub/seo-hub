/**
 * /admin/sites/[slug]/fixes — Per-site fix proposal history.
 *
 * Pending + recent decided fix proposals scoped to one site. Approve / reject
 * inline using the existing fix-queue server actions.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { fixProposals, sites } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { requireAdmin } from "@/lib/server-auth";
import { SiteTabs } from "../SiteTabs";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  approved: "info",
  running: "info",
  done: "success",
  failed: "danger",
  rejected: "neutral",
};

export default async function SiteFixesPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  await requireAdmin();
  const { slug } = await params;
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) notFound();

  const rows = await db()
    .select({
      id: fixProposals.id,
      fixKind: fixProposals.fixKind,
      label: fixProposals.label,
      preview: fixProposals.preview,
      status: fixProposals.status,
      priority: fixProposals.priority,
      createdAt: fixProposals.createdAt,
      decidedAt: fixProposals.decidedAt,
      autoApprovedByRule: fixProposals.autoApprovedByRule,
    })
    .from(fixProposals)
    .where(eq(fixProposals.siteId, site.id))
    .orderBy(desc(fixProposals.createdAt))
    .limit(100);

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/sites" className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text">← Sites</Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">{site.name} · Fixes</h1>
        <p className="mt-1 text-xs text-text-muted">{site.domain}</p>
      </header>
      <SiteTabs slug={slug} />

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">
          Pending <span className="text-text-faint tabular-nums">{pending.length}</span>
        </h2>
        <RowList>
          {pending.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-md text-text">Nothing waiting for review.</div>
              <div className="mt-1 text-xs text-text-muted">
                Audits run every Monday and drop proposals here when they find something.
              </div>
            </div>
          )}
          {pending.map((r) => (
            <Row key={r.id} href={`/admin/fix-queue#${r.id}`}>
              <div className="flex w-full items-center gap-3">
                <Pill tone={r.priority === "high" ? "danger" : r.priority === "low" ? "neutral" : "info"}>
                  {r.fixKind.replace("fix:", "")}
                </Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text">{r.label}</div>
                  {r.preview && (
                    <div className="truncate text-xs text-text-faint">{r.preview}</div>
                  )}
                </div>
                <div className="tnum text-xs text-text-faint">
                  {new Date(r.createdAt).toISOString().slice(0, 10)}
                </div>
              </div>
            </Row>
          ))}
        </RowList>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Recent</h2>
        <RowList>
          {done.length === 0 && (
            <div className="px-4 py-6 text-center text-md text-text-muted">No history yet.</div>
          )}
          {done.slice(0, 50).map((r) => (
            <Row key={r.id}>
              <div className="flex w-full items-center gap-3">
                <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text">{r.label}</div>
                  <div className="truncate text-xs text-text-faint">
                    {r.fixKind}
                    {r.autoApprovedByRule ? ` · auto: ${r.autoApprovedByRule}` : ""}
                  </div>
                </div>
                <div className="tnum text-xs text-text-faint">
                  {(r.decidedAt ?? r.createdAt).toISOString().slice(0, 10)}
                </div>
              </div>
            </Row>
          ))}
        </RowList>
      </section>
    </div>
  );
}
