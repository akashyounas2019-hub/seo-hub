import { createFileRoute } from "@tanstack/react-router";
import { AutomationView } from "@/features/automation/components/automation-view";

export const Route = createFileRoute("/automation")({
  head: () => ({
    meta: [
      { title: "Automation — AKS SEO Console" },
      {
        name: "description",
        content:
          "Automate SEO workflows for a Dubai cleaning company: local SEO, GBP, reviews, backlinks, content, and technical monitoring.",
      },
      { property: "og:title", content: "Automation — AKS SEO Console" },
      {
        property: "og:description",
        content:
          "Local SEO automation tailored for Dubai cleaning services: keywords, GBP, reviews, outreach, and site health.",
      },
    ],
  }),
  component: AutomationPage,
});

function AutomationPage() {
  return <AutomationView />;
}
