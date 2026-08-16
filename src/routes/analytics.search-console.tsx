import { createFileRoute } from "@tanstack/react-router";
import { SearchConsoleDrilldown } from "@/components/analytics-search-console";

export const Route = createFileRoute("/analytics/search-console")({
  head: () => ({
    meta: [
      { title: "Search Console Insights — AKS SEO Console" },
      {
        name: "description",
        content:
          "Detailed Google Search Console drill-down: ranking keywords, top pages, CTR gainers and losers, comparison filters.",
      },
      { property: "og:title", content: "Search Console Insights — AKS SEO Console" },
    ],
  }),
  component: SearchConsoleDrilldown,
});
