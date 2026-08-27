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

/**
 * Same shape-extraction as extractJson(), but scoped to a ```tasks fenced
 * block specifically -- used for SEO Suite tools (Strategy Plan) whose
 * output is primarily a Markdown report with a task list appended at the
 * end, as opposed to the orchestrator's output which is pure JSON.
 */
function extractTasksBlock(output: string): any {
  const fenced = output.match(/```tasks\s*([\s\S]*?)```/);
  if (!fenced) return null;
  try {
    return JSON.parse(fenced[1].trim());
  } catch {
    return null;
  }
}

/**
 * Inserts a model-proposed task list into kanban_tasks, running each task
 * through the approval-rules engine to decide pending_approval vs.
 * auto-approved. Shared by the orchestrator (whole-output JSON) and any
 * SEO Suite tool marked producesTasks: true (a ```tasks fenced block
 * trailing its Markdown report) -- same destination, same rules, two
 * different sources of the task list.
 */
async function insertProposedTasks(tasks: any[], siteId: string | undefined, sourceLabel: string) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    console.warn(`[${sourceLabel}] produced no parseable tasks`);
    return 0;
  }

  const { db, ensureSchema } = await import("@/db/client");
  const { kanbanTasks, approvalRules } = await import("@/db/schema");
  const { evaluateApproval } = await import("@/lib/approval-rules");

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
  let inserted = 0;
  for (const t of tasks) {
    if (!t?.title) continue;
    const priority = ["low", "medium", "high", "critical"].includes(t.priority) ? t.priority : "medium";
    const decision = evaluateApproval({ priority, category: t.category || null, siteId: siteId || null }, evaluableRules);

    const id = `${sourceLabel}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    inserted++;
  }

  console.log(`[${sourceLabel}] inserted ${inserted} task(s) for site ${siteId}`);
  return inserted;
}

async function applyOrchestratorResult(job: any, output: string) {
  const parsed = extractJson(output);
  await insertProposedTasks(parsed?.tasks, job.input?.siteId, "orchestrator");
}

async function applySeoSuiteTasks(job: any, output: string) {
  const { getSeoTool } = await import("@/lib/seo-tools");
  const toolId = job.input?.toolId as string | undefined;
  const tool = toolId ? getSeoTool(toolId) : undefined;
  if (!tool?.producesTasks) return; // report-only tool -- nothing to extract

  const parsed = extractTasksBlock(output);
  await insertProposedTasks(parsed?.tasks, job.input?.siteId, `seo-suite:${toolId}`);
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
            } else if (job?.kind?.startsWith("seo-suite:")) {
              await applySeoSuiteTasks(job, body.outputMarkdown || "");
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
