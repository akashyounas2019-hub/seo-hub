import { createFileRoute } from "@tanstack/react-router";
import { BusinessProfileDrilldown } from "@/components/analytics-business-profile";

export const Route = createFileRoute("/analytics/business-profile")({
  head: () => ({
    meta: [
      { title: "Google Business Profile Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Business Profile drill-down: calls, directions, reviews, photo views and local search queries.",
      },
      { property: "og:title", content: "Google Business Profile Insights — AKS SEO Console" },
    ],
  }),
  component: BusinessProfileDrilldown,
});
