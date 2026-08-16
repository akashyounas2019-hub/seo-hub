import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/features/dashboard/components/dashboard-view";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agents — AKS SEO Console" },
      {
        name: "description",
        content:
          "Manage the AKS agent fleet: total, working, and offline agents at a glance, with the leader and specialist sub-agent hierarchy.",
      },
      { property: "og:title", content: "Agents — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Add, assign, and orchestrate specialist SEO agents from a single control surface.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <DashboardView />;
}
