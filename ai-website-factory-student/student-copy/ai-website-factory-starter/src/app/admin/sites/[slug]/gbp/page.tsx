/**
 * /admin/sites/[slug]/gbp — Per-site GBP post pipeline.
 *
 * Drafts (AI-generated, awaiting approval), queued, posted, and citation
 * NAP-state for this site only.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { citationQueue, gbpPosts, sites } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { Stat } from "@/components/ui/Stat";
import { requireAdmin } from "@/lib/server-auth";
import { SiteTabs } from "../SiteTabs";
import { AddCitationForm } from "./AddCitationForm";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "neutral"> = {
  draft: "warning",
  queued: "info",
  posted: "success",
  failed: "danger",
  cancelled: "neutral",
};

export default async function SiteGbpPage({ params }: { params: Promise<{ slug: string }> }) {
  await ensureSchema();
  await requireAdmin();
  const { slug } = await params;
  const [site] = await db().select().from(sites).where(eq(sites.slug, slug)).limit(1);
  if (!site) notFound();

  const posts = await db()
    .select()
    .from(gbpPosts)
    .where(eq(gbpPosts.siteId, site.id))
    .orderBy(desc(gbpPosts.scheduledFor), desc(gbpPosts.createdAt))
    .limit(50);

  const citations = await db()
    .select()
    .from(citationQueue)
    .where(eq(citationQueue.siteId, site.id))
    .limit(40);

  const drafts = posts.filter((p) => p.status === "draft").length;
  const posted = posts.filter((p) => p.status === "posted").length;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/sites" className="inline-flex items-center gap-1 text-xs text-text-faint hover:text-text">← Sites</Link>
        <h1 className="mt-1 text-2xl font-medium tracking-tightish text-text">{site.name} · GBP</h1>
        <p className="mt-1 text-xs text-text-muted">{site.domain}</p>
      </header>
      <SiteTabs slug={slug} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Awaiting review" value={drafts} tone={drafts > 0 ? "warning" : "neutral"} />
        <Stat label="Posted to GBP" value={posted} tone="success" />
        <Stat label="Citations tracked" value={citations.length} />
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Posts</h2>
        <RowList>
          {posts.length === 0 && (
            <div className="px-4 py-6 text-center">
              <div className="text-md text-text">No GBP drafts yet.</div>
              <div className="mt-1 text-xs text-text-muted">
                Trigger an AI batch from <a href="/admin/gbp" className="text-accent hover:underline">/admin/gbp</a> or run <code className="font-mono text-xs">npm run gbp:queue -- --site={site.domain}</code>.
              </div>
            </div>
          )}
          {posts.map((p) => (
            <Row key={p.id} href={`/admin/gbp#${p.id}`}>
              <div className="flex w-full items-center gap-3">
                <Pill tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text">
                    {p.title ?? p.body.slice(0, 80)}
                  </div>
                  <div className="truncate text-xs text-text-faint">
                    {p.kind}
                    {p.scheduledFor ? ` · sched ${new Date(p.scheduledFor).toISOString().slice(0, 10)}` : ""}
                  </div>
                </div>
              </div>
            </Row>
          ))}
        </RowList>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Citations</h2>
        <AddCitationForm siteId={site.id} />
        <RowList>
          {citations.length === 0 && (
            <div className="px-4 py-6 text-center text-md text-text-muted">No citations tracked.</div>
          )}
          {citations.map((c) => {
            const tone =
              c.napState === "listed" ? "success" :
              c.napState === "inconsistent" ? "warning" :
              c.napState === "not_listed" ? "danger" : "neutral";
            return (
              <Row key={c.id} href={c.listingUrl ?? undefined}>
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-text">{c.directory}</div>
                    {c.notes && (
                      <div className="truncate text-xs text-text-faint">{c.notes}</div>
                    )}
                  </div>
                  <Pill tone={tone}>{c.napState.replace("_", " ")}</Pill>
                </div>
              </Row>
            );
          })}
        </RowList>
      </section>
    </div>
  );
}

