/**
 * P6 — Prompt library index.
 *
 * Lists every prompt slot the platform uses + whether the admin has
 * overridden the built-in default with a custom version.
 */
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, ensureSchema } from "@/db/client";
import { promptTemplates } from "@/db/schema";
import { Pill, Row, RowList } from "@/components/ui/Row";
import { PROMPT_SLOTS } from "@/lib/prompt-library";
import { requireAdmin } from "@/lib/server-auth";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PromptsIndexPage() {
  await ensureSchema();
  await requireAdmin();
  const active = await db()
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.isActive, true));
  const bySlot = new Map(active.map((p) => [p.slot, p]));

  return (
    <div className="space-y-6">
      <header className="brand-rule">
        <h1 className="">Prompt library</h1>
        <p className="mt-1.5 text-xs text-text-muted">
          Versioned prompts the agent uses. Override the built-in defaults to tune voice or behavior per slot.
        </p>
      </header>

      <RowList footer={`${PROMPT_SLOTS.length} slot${PROMPT_SLOTS.length === 1 ? "" : "s"} · ${bySlot.size} overridden`}>
        {PROMPT_SLOTS.map((slot) => {
          const active = bySlot.get(slot.slot);
          return (
            <Row key={slot.slot}>
              <Link href={`/admin/prompts/${slot.slot}`} className="flex flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text-faint">{slot.slot}</span>
                    {active ? <Pill tone="success">v{active.version}</Pill> : <Pill tone="neutral">default</Pill>}
                  </div>
                  <p className="mt-0.5 text-xs text-text">{slot.label}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-text-faint">{slot.description}</p>
                </div>
                {active ? (
                  <span className="text-xs text-text-faint">edited {formatRelative(active.createdAt)}</span>
                ) : (
                  <span className="text-xs text-text-faint">no override</span>
                )}
              </Link>
            </Row>
          );
        })}
      </RowList>
    </div>
  );
}
