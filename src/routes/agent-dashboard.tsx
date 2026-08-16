import { createFileRoute } from "@tanstack/react-router";
import { AgentDashboardView } from "@/features/agents/components/agent-dashboard-view";

export const Route = createFileRoute("/agent-dashboard")({
  head: () => ({
    meta: [
      { title: "Agent Dashboard — AKS SEO Console" },
      {
        name: "description",
        content:
          "Live agent workload management, active fleet execution status, and interactive drag-and-drop Kanban execution board.",
      },
      { property: "og:title", content: "Agent Dashboard — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Real-time operational dashboard for the AKS agent fleet with workload balancing and Kanban task execution.",
      },
    ],
  }),
  component: AgentDashboardPage,
});

function AgentDashboardPage() {
  return <AgentDashboardView />;
}
