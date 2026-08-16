import { requireAdmin } from "@/lib/server-auth";
import { ensureSchema } from "@/db/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

export default async function TodoListPage() {
  await ensureSchema();
  await requireAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="To-do List"
        subtitle="A personal checklist separate from assigned Tasks — quick reminders and one-off items that don't need full task tracking."
      />
      <EmptyState
        glyph="tasks"
        title="Coming soon"
        description="The to-do list will let you jot down quick personal reminders and one-off items without going through the full task assignment flow."
      />
    </div>
  );
}
