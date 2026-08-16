import { createFileRoute } from "@tanstack/react-router";
import { GoogleAnalyticsDrilldown } from "@/components/analytics-google-analytics";

export const Route = createFileRoute("/analytics/google-analytics")({
  head: () => ({
    meta: [
      { title: "Google Analytics Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Analytics drill-down: sessions, engagement, revenue, comparison filters, top channels, pages and audience breakdown.",
      },
      { property: "og:title", content: "Google Analytics Insights — AKS SEO Console" },
    ],
  }),
  component: GoogleAnalyticsDrilldown,
});
