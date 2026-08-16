import { createFileRoute } from "@tanstack/react-router";
import { TasksView } from "@/features/tasks/components/tasks-view";

export const Route = createFileRoute("/assign-tasks")({
  head: () => ({
    meta: [
      { title: "Assign Tasks — AKS SEO Console" },
      {
        name: "description",
        content:
          "Delegate SEO work across your agent fleet with templates, workload balancing, and a drag-and-drop Kanban board.",
      },
      { property: "og:title", content: "Assign Tasks — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Task allocation, workload management, and a professional Kanban workflow for the AKS agent fleet.",
      },
    ],
  }),
  component: AssignTasksPage,
});

function AssignTasksPage() {
  return <TasksView />;
}
