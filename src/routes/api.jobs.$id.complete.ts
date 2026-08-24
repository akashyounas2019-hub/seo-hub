import { createFileRoute } from "@tanstack/react-router";

/**
 * Extracts a JSON object/array from a model's raw text output even if it
 * wrapped it in markdown fences or added stray prose. Mirrors the worker's
 * own extractJson() in worker/aks-worker.mjs (kept in sync manually --
 * this route runs in the app process, the worker runs standalone).
 */
function extractJson(output: string): any {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : output).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function applyOrchestratorResult(job: any, output: string) {
  const { db, ensureSchema } = await import("@/db/client");
  const { kanbanTasks, approvalRules } = await import("@/db/schema");
  const { evaluateApproval } = await import("@/lib/approval-rules");

  const siteId = job.input?.siteId as string | undefined;
  const parsed = extractJson(output);
  const tasks = parsed?.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.warn(`[orchestrator] job ${job.id} produced no parseable tasks`);
    return;
  }

  await ensureSchema();
  const d = db();
  const rules = await d.select().from(approvalRules);
  const evaluableRules = rules.map((r) => ({
    id: r.id,
    name: r.name,
    minPriority: r.minPriority,
    category: r.category,
    siteId: r.siteId,
    requiresApproval: r.requiresApproval,
    enabled: r.enabled,
  }));

  const now = new Date();
  for (const t of tasks) {
    if (!t?.title) continue;
    const priority = ["low", "medium", "high", "critical"].includes(t.priority) ? t.priority : "medium";
    const decision = evaluateApproval({ priority, category: t.category || null, siteId: siteId || null }, evaluableRules);

    const id = `orch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await d.insert(kanbanTasks).values({
      id,
      siteId: siteId || "safaeewala",
      title: String(t.title).slice(0, 300),
      desc: [t.description, t.reasoning ? `\n\nWhy: ${t.reasoning}` : ""].filter(Boolean).join(""),
      assignee: t.assignee || "Technical SEO Expert",
      priority,
      status: decision.requiresApproval ? "pending_approval" : "todo",
      templateId: t.category || null,
      outputMarkdown: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`[orchestrator] job ${job.id} — inserted ${tasks.length} task(s) for site ${siteId}`);
}

export const Route = createFileRoute("/api/jobs/$id/complete")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const body = await request.json().catch(() => ({}));

          const { db, ensureSchema } = await import("@/db/client");
          const { kanbanTasks, claudeJobs } = await import("@/db/schema");
          const { eq } = await import("drizzle-orm");

          await ensureSchema();
          const d = db();

          await d
            .update(claudeJobs)
            .set({
              status: "done",
              outputMarkdown: body.outputMarkdown || "",
              durationMs: body.durationMs,
              finishedAt: new Date(),
            })
            .where(eq(claudeJobs.id, params.id));

          try {
            const [job] = await d.select().from(claudeJobs).where(eq(claudeJobs.id, params.id)).limit(1);

            if (job?.kind === "seo:orchestrator-review") {
              await applyOrchestratorResult(job, body.outputMarkdown || "");
            } else if (job && (job.input as any)?.taskId) {
              const taskId = (job.input as any).taskId;
              await d.update(kanbanTasks).set({
                status: "review",
                outputMarkdown: body.outputMarkdown || "Task execution complete.",
                updatedAt: new Date(),
              }).where(eq(kanbanTasks.id, taskId));
            }
          } catch (dbErr) {
            console.error(`[jobs] complete post-processing failed for ${params.id}:`, dbErr);
          }

          return Response.json({ ok: true });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
