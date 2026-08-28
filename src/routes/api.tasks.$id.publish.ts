import { createFileRoute } from "@tanstack/react-router";
import { actorEmailFromRequest, logAudit } from "@/lib/audit";
import { publishWordPressPost } from "@/lib/wordpress";
import { decrypt } from "@/lib/crypto";

/**
 * "To Review" approval action -- publishes the task's real AI-generated
 * output (kanban_tasks.output_markdown) as a real WordPress post via the
 * REST API, using the site's stored Application Password credentials.
 * Requires the site to actually have WordPress connected with real
 * credentials; returns a real error (not a fake success) if not.
 */
export const Route = createFileRoute("/api/tasks/$id/publish")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, sites } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          const [task] = await d.select().from(kanbanTasks).where(eq(kanbanTasks.id, params.id)).limit(1);
          if (!task) {
            return Response.json({ ok: false, error: "Task not found" }, { status: 404 });
          }
          if (task.status !== "review") {
            return Response.json({ ok: false, error: `Task is "${task.status}", not "review" -- nothing to publish` }, { status: 400 });
          }
          if (!task.outputMarkdown) {
            return Response.json({ ok: false, error: "This task has no AI-generated output to publish yet" }, { status: 400 });
          }

          const [site] = task.siteId
            ? await d.select().from(sites).where(eq(sites.id, task.siteId)).limit(1)
            : [];

          if (!site) {
            return Response.json({ ok: false, error: "No site found for this task -- cannot determine where to publish" }, { status: 400 });
          }
          if (!site.wpSiteUrl || !site.wpUsername || !site.wpAppPasswordCiphertext) {
            return Response.json({
              ok: false,
              error: `WordPress isn't connected for ${site.name || site.domain}. Add the site URL, username, and an Application Password in the site's settings before approving tasks here.`,
            }, { status: 400 });
          }

          let appPassword: string;
          try {
            appPassword = decrypt(site.wpAppPasswordCiphertext);
          } catch (err: any) {
            return Response.json({ ok: false, error: `Stored WordPress credentials could not be decrypted: ${err.message}` }, { status: 500 });
          }

          let result;
          try {
            result = await publishWordPressPost(
              { siteUrl: site.wpSiteUrl, username: site.wpUsername, appPassword },
              { title: task.title, content: task.outputMarkdown, status: "publish" },
            );
          } catch (err: any) {
            return Response.json({ ok: false, error: `Publish failed: ${err.message}` }, { status: 502 });
          }

          const now = new Date();
          const actor = actorEmailFromRequest(request);
          await d.update(kanbanTasks).set({
            status: "done",
            publishedUrl: result.link,
            publishedAt: now,
            approvedBy: actor,
            approvedAt: now,
            updatedAt: now,
          }).where(eq(kanbanTasks.id, params.id));

          await logAudit(actor, "task.published", {
            taskId: params.id,
            title: task.title,
            siteId: site.id,
            publishedUrl: result.link,
            wpPostId: result.postId,
          });

          return Response.json({ ok: true, publishedUrl: result.link, postId: result.postId });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message || "Failed to publish task" }, { status: 500 });
        }
      },
    },
  },
});
