/**
 * One-shot: reset ALL built-in agent_profiles rows to match the current
 * AGENT_ROSTER seed + BUILT_IN_DEFAULT_SKILLS. Also inserts newly-added
 * built-ins (e.g. "research") that don't exist yet.
 *
 * Why: ensureBuiltInAgents() uses ON CONFLICT DO NOTHING, so once a built-in
 * row exists the seeder never touches it again. This script bypasses that
 * so renames + new agents + fresh skill defaults land on the live app.
 *
 *   Stop the dev server first (PGlite is single-writer), then:
 *     npm run agent:reset:builtin
 *
 * Safe to re-run.
 */
import { eq } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { agentProfiles } from "../db/schema";
import {
  AGENT_ROSTER,
  BUILT_IN_DEFAULT_SKILLS,
  type BuiltInAgentId,
} from "../lib/agent-roster";

async function main() {
  await ensureSchema();

  let updated = 0;
  let inserted = 0;

  for (const seed of AGENT_ROSTER) {
    const [existing] = await db()
      .select({ id: agentProfiles.id })
      .from(agentProfiles)
      .where(eq(agentProfiles.id, seed.id))
      .limit(1);

    const skill = BUILT_IN_DEFAULT_SKILLS[seed.id as BuiltInAgentId];

    if (existing) {
      await db()
        .update(agentProfiles)
        .set({
          name: seed.name,
          title: seed.title,
          focus: seed.focus,
          skillInstructions: skill,
          updatedAt: new Date(),
        })
        .where(eq(agentProfiles.id, seed.id));
      console.log(`· reset ${seed.id} — ${seed.name} · ${seed.title}`);
      updated += 1;
    } else {
      await db().insert(agentProfiles).values({
        id: seed.id,
        name: seed.name,
        title: seed.title,
        focus: seed.focus,
        skillInstructions: skill,
        isCustom: false,
        isActive: true,
      });
      console.log(`+ inserted ${seed.id} — ${seed.name} · ${seed.title}`);
      inserted += 1;
    }
  }

  console.log(`\n✓ done — updated ${updated}, inserted ${inserted}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
