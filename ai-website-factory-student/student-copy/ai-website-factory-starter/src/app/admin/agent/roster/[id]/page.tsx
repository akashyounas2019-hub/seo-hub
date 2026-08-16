/**
 * Agent profile page at /admin/agent/roster/[id].
 *
 * Server component: fetches agent, KPIs, schedules, task history, and the
 * roster (for sibling links). Passes everything to the client component
 * <AgentProfileView>, which renders the Lovable-derived dark cyan design
 * and hosts the small local UI state (toggles, notes, autonomy slider).
 *
 * Server actions preserved:
 *   - saveAgentSkillAction / resetAgentSkillAction
 *   - deleteCustomAgentAction
 *   - createAgentScheduleAction / deleteAgentScheduleAction
 */
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { agentSchedules, claudeJobs, sites } from "@/db/schema";
import {
  createAgentScheduleAction,
  deleteAgentScheduleAction,
  deleteCustomAgentAction,
  renameAgentAction,
  resetAgentSkillAction,
  saveAgentSkillAction,
  setAgentActiveAction,
} from "@/app/actions/agent-profiles";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";
import {
  BUILT_IN_DEFAULT_SKILLS,
  isBuiltInAgentId,
  loadAgent,
  loadRoster,
  type BuiltInAgentId,
} from "@/lib/agent-roster";
import { AGENT_CAPABILITIES } from "@/lib/agent-capabilities";
import { AgentProfileView, type FlashDto, type SubAgentDto } from "./AgentProfileView";

export const dynamic = "force-dynamic";

const FLASH_MESSAGES: Record<string, string> = {
  "skill-saved": "Skill instructions saved.",
  "skill-reset": "Skill instructions reset to default.",
  "schedule-created": "Scheduled task created.",
  "schedule-deleted": "Scheduled task removed.",
  "cannot-delete-builtin": "Built-in agents can't be deleted.",
  "schedule-invalid": "Fill in a title and a fire time.",
  "schedule-bad-time": "That doesn't parse as a valid date/time.",
  activated: "Agent activated.",
  deactivated: "Agent deactivated — it now shows OFF on the Agent Jobs hero.",
  renamed: "Identity updated.",
  "name-too-short": "Name must be at least 2 characters.",
  invalid: "Something didn't validate. Try again.",
};

/** Parse the free-form skill_instructions blob into up to 4 sub-agent chips. */
function parseSubAgents(instructions: string | null): SubAgentDto[] {
  if (!instructions) return [];
  const sentences = instructions
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6);
  return sentences.slice(0, 4).map((sentence) => {
    const colonSplit = sentence.split(/\s*[—:–]\s+/);
    if (colonSplit.length >= 2 && colonSplit[0].length <= 40) {
      return {
        name: cap(colonSplit[0]),
        desc: colonSplit.slice(1).join(" ").replace(/\.$/, ""),
      };
    }
    const words = sentence.split(/\s+/);
    const nameWords = words.slice(0, 4);
    const rest = words.slice(4).join(" ").replace(/\.$/, "");
    return { name: cap(nameWords.join(" ")), desc: rest || sentence };
  });
}
function cap(s: string): string {
  const trimmed = s.trim().replace(/^["']|["']$/g, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export default async function AgentProfilePage({
  params,
  searchParams = {},
}: {
  params: { id: string };
  searchParams?: { ok?: string; error?: string };
}) {
  await ensureSchema();
  await requireAdmin();
  const d = db();

  const agent = await loadAgent(params.id);
  if (!agent) notFound();

  const [counts] = await d
    .select({
      queued: sql<number>`count(*) filter (where status='pending')::int`,
      running: sql<number>`count(*) filter (where status in ('claimed','running'))::int`,
      done: sql<number>`count(*) filter (where status='done')::int`,
      failed: sql<number>`count(*) filter (where status='failed')::int`,
    })
    .from(claudeJobs)
    .where(
      and(
        eq(claudeJobs.kind, "agent_task"),
        sql`(${claudeJobs.input}->>'agentId') = ${agent.id}`,
      ),
    );

  const historyRows = await d
    .select({
      j: claudeJobs,
      siteSlug: sites.slug,
      siteName: sites.name,
    })
    .from(claudeJobs)
    .leftJoin(sites, eq(sites.id, claudeJobs.siteId))
    .where(
      and(
        eq(claudeJobs.kind, "agent_task"),
        sql`(${claudeJobs.input}->>'agentId') = ${agent.id}`,
      ),
    )
    .orderBy(desc(claudeJobs.createdAt))
    .limit(25);

  const scheduleRows = await d
    .select()
    .from(agentSchedules)
    .where(eq(agentSchedules.agentId, agent.id))
    .orderBy(desc(agentSchedules.nextFireAt));

  const roster = await loadRoster();
  const siblingExperts = roster
    .filter((r) => r.id !== agent.id && r.id !== "leader")
    .map((r) => ({ id: r.id, name: r.name, title: r.title }));

  const isBuiltIn = isBuiltInAgentId(agent.id);
  const defaultSkill = isBuiltIn
    ? BUILT_IN_DEFAULT_SKILLS[agent.id as BuiltInAgentId]
    : "";

  const subAgents = parseSubAgents(agent.skillInstructions ?? null);

  const flash: FlashDto | null = searchParams.ok
    ? { tone: "ok", msg: FLASH_MESSAGES[searchParams.ok] ?? searchParams.ok }
    : searchParams.error
      ? { tone: "error", msg: FLASH_MESSAGES[searchParams.error] ?? searchParams.error }
      : null;

  return (
    <div className="-mx-5 sm:-mx-7 md:-mx-10 -my-4 sm:-my-5 md:-my-6">
      <AgentProfileView
        agent={{
          id: agent.id,
          name: agent.name,
          title: agent.title,
          focus: agent.focus,
          isCustom: !!agent.isCustom,
          isActive: agent.isActive,
          skillInstructions: agent.skillInstructions ?? null,
        }}
        counts={{
          queued: counts?.queued ?? 0,
          running: counts?.running ?? 0,
          done: counts?.done ?? 0,
          failed: counts?.failed ?? 0,
        }}
        schedules={scheduleRows.map((s) => ({
          id: s.id,
          title: s.title,
          taskType: s.taskType,
          nextFireAtIso: s.nextFireAt.toISOString(),
          recurrence: s.recurrence,
          fireCount: s.fireCount,
        }))}
        history={historyRows.map((row) => ({
          id: row.j.id,
          title: row.j.title,
          status: row.j.status,
          siteSlug: row.siteSlug ?? null,
          siteName: row.siteName ?? null,
          createdAtIso: row.j.createdAt.toISOString(),
          createdRelative: formatRelative(row.j.createdAt),
        }))}
        subAgents={subAgents}
        capabilities={(AGENT_CAPABILITIES as Record<string, { label: string; href?: string; backend?: string; hint?: string }[]>)[agent.id] ?? []}
        siblingExperts={siblingExperts}
        isBuiltIn={isBuiltIn}
        defaultSkill={defaultSkill}
        flash={flash}
        saveSkillAction={saveAgentSkillAction}
        resetSkillAction={resetAgentSkillAction}
        deleteAgentAction={deleteCustomAgentAction}
        createScheduleAction={createAgentScheduleAction}
        deleteScheduleAction={deleteAgentScheduleAction}
        setActiveAction={setAgentActiveAction}
        renameAction={renameAgentAction}
      />
    </div>
  );
}
