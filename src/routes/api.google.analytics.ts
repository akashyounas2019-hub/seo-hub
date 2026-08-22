import { createFileRoute } from "@tanstack/react-router";
import { fetchGA4Report } from "@/lib/google/analytics-ga4";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/api/google/analytics")({
  loader: async ({ request }: any) => {
    try {
      const url = new URL(request.url);
      const propertyId = url.searchParams.get("propertyId") || "377896920";
      const rawStart = url.searchParams.get("startDate") || "28daysAgo";
      const rawEnd = url.searchParams.get("endDate") || "today";

      let startDate = rawStart;
      let endDate = rawEnd;

      if (rawStart === "7daysAgo" || rawStart === "7d") {
        startDate = formatOffsetDate(7);
        endDate = "today";
      } else if (rawStart === "14daysAgo" || rawStart === "14d") {
        startDate = formatOffsetDate(14);
        endDate = "today";
      } else if (rawStart === "28daysAgo" || rawStart === "28d") {
        startDate = formatOffsetDate(28);
        endDate = "today";
      } else if (rawStart === "90daysAgo" || rawStart === "3m") {
        startDate = formatOffsetDate(90);
        endDate = "today";
      } else if (rawStart === "180daysAgo" || rawStart === "6m") {
        startDate = formatOffsetDate(180);
        endDate = "today";
      } else if (rawStart === "365daysAgo" || rawStart === "12m") {
        startDate = formatOffsetDate(365);
        endDate = "today";
      }

      const report = await fetchGA4Report({
        propertyId,
        startDate,
        endDate,
        metrics: ["activeUsers", "sessions", "eventCount", "bounceRate", "userEngagementDuration", "conversions"],
        dimensions: ["date"],
      }).catch(() => null);

      return {
        ok: true,
        propertyId,
        overview: report,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: () => null,
});
