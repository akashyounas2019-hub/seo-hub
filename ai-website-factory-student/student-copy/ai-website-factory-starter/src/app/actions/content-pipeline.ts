"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { contentBriefs, sites } from "@/db/schema";
import { recordAdminAction } from "@/lib/audit-log";
import {
  BRIEF_STATUSES,
  isAllowedTransition,
  type BriefStatus,
} from "@/lib/content-pipeline";
import { CRITIC_AUTO_THRESHOLD, criticPass } from "@/lib/seo-critic";
import { callPlugin } from "@/lib/wp-plugin-client";
import { requireAdmin } from "@/lib/server-auth";

/** Block transition if the critic verdict says the brief is below this. */
const BRIEF_BLOCK_THRESHOLD = 50;
/** Stale critic verdict — if older than this AND the brief changed, re-run. */
const BRIEF_STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24h

function s(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function nullableUuid(v: string): string | null {
  return v && v !== "none" ? v : null;
}

/** Convert Markdown → HTML — minimal, no extra deps. WP can take HTML. */
function markdownToHtml(md: string): string {
  // Headings
  let html = md
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>");
  // Bold + italic
  html = html
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bullets
  html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*?<\/li>(?:\n)?)+/gs, (m) => `<ul>${m}</ul>`);
  // Paragraphs (blank-line separation)
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (/^<(h\d|ul|ol|p|blockquote|pre|table)/i.test(block.trim())) return block;
      return `<p>${block.trim().replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");
  return html;
}

/** Create a new brief. */
export async function createBriefAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const siteSlug = s(formData, "siteSlug");
  const title = s(formData, "title");
  const targetKeyword = s(formData, "targetKeyword") || null;
  const briefMarkdown = s(formData, "briefMarkdown");
  const contentType = (s(formData, "contentType") || "post") as "post" | "page";

  if (!siteSlug || !title) {
    redirect("/admin/content?error=missing-fields");
  }

  const [site] = await db().select().from(sites).where(eq(sites.slug, siteSlug)).limit(1);
  if (!site) redirect("/admin/content?error=site-not-found");

  const [inserted] = await db()
    .insert(contentBriefs)
    .values({
      siteId: site.id,
      title,
      targetKeyword,
      briefMarkdown,
      contentType,
      createdBy: me.id,
      status: "brief",
      transitions: [{ from: "(new)", to: "brief", at: new Date().toISOString(), by: me.id }],
    })
    .returning({ id: contentBriefs.id });
  await recordAdminAction({
    actor: me,
    kind: "content.create",
    targetType: "site",
    targetId: site.id,
    summary: `Created content brief: ${title}`,
  });
  revalidatePath("/admin/content");
  redirect(`/admin/content/${inserted.id}`);
}

/** Update brief body (draft / brief / review notes). */
export async function updateBriefAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  const update: Partial<typeof contentBriefs.$inferInsert> = {};
  const briefMarkdown = formData.get("briefMarkdown");
  const draftMarkdown = formData.get("draftMarkdown");
  const reviewNotes = formData.get("reviewNotes");
  const title = formData.get("title");
  const targetKeyword = formData.get("targetKeyword");
  const dueAt = formData.get("dueAt");
  const assigneeId = formData.get("assigneeId");
  if (typeof briefMarkdown === "string") update.briefMarkdown = briefMarkdown;
  if (typeof draftMarkdown === "string") update.draftMarkdown = draftMarkdown;
  if (typeof reviewNotes === "string") update.reviewNotes = reviewNotes;
  if (typeof title === "string" && title.trim()) update.title = title.trim();
  if (typeof targetKeyword === "string") update.targetKeyword = targetKeyword || null;
  if (typeof dueAt === "string" && dueAt) update.dueAt = new Date(dueAt);
  if (typeof assigneeId === "string") update.assigneeId = nullableUuid(assigneeId);
  update.updatedAt = new Date();
  await db().update(contentBriefs).set(update).where(eq(contentBriefs.id, id));
  await recordAdminAction({
    actor: me,
    kind: "content.update",
    targetType: "other",
    targetId: id,
    summary: `Updated content brief ${id}`,
  });
  revalidatePath(`/admin/content/${id}`);
  revalidatePath("/admin/content");
}

/**
 * Run the Haiku critic against a brief. Stores the verdict on the row so
 * the UI can surface the confidence score + issues without re-charging.
 *
 * Cheap (~$0.0001 per call). Safe to call on demand from a "Run critic"
 * button, and called automatically before transitioning into 'drafting'.
 */
export async function runBriefCriticAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;

  const [brief] = await db()
    .select({ b: contentBriefs, siteName: sites.name, siteDomain: sites.domain })
    .from(contentBriefs)
    .innerJoin(sites, eq(sites.id, contentBriefs.siteId))
    .where(eq(contentBriefs.id, id))
    .limit(1);
  if (!brief) return;

  const verdict = await criticPass({
    kind: "content_brief",
    siteName: brief.siteName,
    siteDomain: brief.siteDomain,
    title: brief.b.title,
    targetKeyword: brief.b.targetKeyword,
    contentType: brief.b.contentType,
    briefMarkdown: brief.b.briefMarkdown,
  });

  await db()
    .update(contentBriefs)
    .set({
      criticConfidence: verdict.confidence,
      criticIssues: verdict.issues,
      criticReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(contentBriefs.id, id));

  await recordAdminAction({
    actor: me,
    kind: "content.critic_run",
    targetType: "other",
    targetId: id,
    summary: `Brief critic scored ${verdict.confidence}/100${verdict.issues.length ? ` · ${verdict.issues.length} issue${verdict.issues.length === 1 ? "" : "s"}` : ""}`,
    after: { confidence: verdict.confidence, issues: verdict.issues, model: verdict.model },
  });

  revalidatePath(`/admin/content/${id}`);
}

/** Transition brief to a new status — validates against the state machine. */
export async function transitionBriefAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  const to = s(formData, "to") as BriefStatus;
  const note = s(formData, "note") || undefined;
  const force = s(formData, "force") === "1";
  if (!id || !BRIEF_STATUSES.includes(to)) return;

  const [brief] = await db().select().from(contentBriefs).where(eq(contentBriefs.id, id)).limit(1);
  if (!brief) return;
  const from = brief.status as BriefStatus;
  if (!isAllowedTransition(from, to)) {
    redirect(`/admin/content/${id}?error=invalid-transition`);
  }

  // Critic gate: any transition out of 'brief' (i.e. brief → drafting) or
  // into 'approved' (review → approved) requires a fresh critic verdict.
  // The brief itself can't ship to the writer until we know it's coherent.
  const gateMoves = (from === "brief" && to === "drafting") || to === "approved";
  if (gateMoves && !force) {
    const stale =
      !brief.criticReviewedAt ||
      new Date().getTime() - new Date(brief.criticReviewedAt).getTime() > BRIEF_STALE_AFTER_MS;
    if (stale) {
      redirect(`/admin/content/${id}?error=critic-stale`);
    }
    if (
      brief.criticConfidence !== null &&
      brief.criticConfidence !== undefined &&
      brief.criticConfidence < BRIEF_BLOCK_THRESHOLD
    ) {
      await recordAdminAction({
        actor: me,
        kind: "content.transition_blocked",
        targetType: "other",
        targetId: id,
        summary: `Critic confidence ${brief.criticConfidence} below ${BRIEF_BLOCK_THRESHOLD} — transition blocked`,
        after: { from, to, confidence: brief.criticConfidence, issues: brief.criticIssues },
      });
      redirect(`/admin/content/${id}?error=critic-low`);
    }
  }
  if (gateMoves && force && brief.criticConfidence !== null && brief.criticConfidence < CRITIC_AUTO_THRESHOLD) {
    await recordAdminAction({
      actor: me,
      kind: "content.transition_force",
      targetType: "other",
      targetId: id,
      summary: `Force-transitioned ${from} → ${to} despite critic confidence ${brief.criticConfidence}`,
      after: { from, to, confidence: brief.criticConfidence, issues: brief.criticIssues },
    });
  }

  const log = (brief.transitions as Array<Record<string, unknown>>) ?? [];
  log.push({ from, to, at: new Date().toISOString(), by: me.id, note });

  const update: Partial<typeof contentBriefs.$inferInsert> = {
    status: to,
    transitions: log as Array<{ from: string; to: string; at: string; by: string | null; note?: string }>,
    updatedAt: new Date(),
  };
  if (to === "published" && !brief.publishedAt) update.publishedAt = new Date();
  await db().update(contentBriefs).set(update).where(eq(contentBriefs.id, id));

  // If transitioning to 'published' and we don't yet have a WP post ID,
  // push the draft to WordPress via the plugin.
  if (to === "published" && !brief.wpPostId && brief.draftMarkdown.trim()) {
    try {
      const html = markdownToHtml(brief.draftMarkdown);
      const path = brief.contentType === "page" ? "/content/create-page" : "/content/create-post";
      const resp = await callPlugin<{ ok: boolean; post_id?: number; error?: string }>(brief.siteId, {
        method: "POST",
        path,
        body: {
          title: brief.title,
          content: html,
          status: "publish",
          focus_keyword: brief.targetKeyword,
        },
      });
      if (resp.ok && resp.post_id) {
        await db().update(contentBriefs).set({ wpPostId: resp.post_id }).where(eq(contentBriefs.id, id));
      }
    } catch (err) {
      console.warn(`[content] publish to WP failed for ${id}:`, err instanceof Error ? err.message : err);
      // Don't roll back the status — admin can manually publish later.
    }
  }

  await recordAdminAction({
    actor: me,
    kind: "content.transition",
    targetType: "other",
    targetId: id,
    summary: `Brief ${id}: ${from} → ${to}`,
    before: { status: from },
    after: { status: to },
  });
  revalidatePath(`/admin/content/${id}`);
  revalidatePath("/admin/content");
}

/** Delete a brief. */
export async function deleteBriefAction(formData: FormData): Promise<void> {
  await ensureSchema();
  const me = await requireAdmin();
  const id = s(formData, "id");
  if (!id) return;
  await db().delete(contentBriefs).where(eq(contentBriefs.id, id));
  await recordAdminAction({
    actor: me,
    kind: "content.delete",
    targetType: "other",
    targetId: id,
    summary: `Deleted brief ${id}`,
  });
  revalidatePath("/admin/content");
  redirect("/admin/content");
}
