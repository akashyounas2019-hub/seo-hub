import { createFileRoute } from "@tanstack/react-router";
import { fetchGSCSearchAnalytics, fetchGSCSites } from "@/lib/google/search-console";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/api/google/search-console")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    try {
      const url = new URL(request.url);
      const sites = await fetchGSCSites().catch(() => []);
      const defaultSite = sites[0]?.siteUrl || "https://safaeewala.com/";
      const siteUrl = url.searchParams.get("siteUrl") || defaultSite;
      const rawStart = url.searchParams.get("startDate") || "28daysAgo";
      const rawEnd = url.searchParams.get("endDate") || "today";
      const dimension = (url.searchParams.get("dimension") || "date") as any;
      const country = url.searchParams.get("country") || "are";
      const city = url.searchParams.get("city") || "all";

      let startDate = rawStart;
      let endDate = rawEnd;

      if (rawStart === "7daysAgo" || rawStart === "7d") {
        startDate = formatOffsetDate(9);
        endDate = formatOffsetDate(2);
      } else if (rawStart === "14daysAgo" || rawStart === "14d") {
        startDate = formatOffsetDate(16);
        endDate = formatOffsetDate(2);
      } else if (rawStart === "28daysAgo" || rawStart === "28d") {
        startDate = formatOffsetDate(30);
        endDate = formatOffsetDate(2);
      } else if (rawStart === "90daysAgo" || rawStart === "3m") {
        startDate = formatOffsetDate(92);
        endDate = formatOffsetDate(2);
      } else if (rawStart === "180daysAgo" || rawStart === "6m") {
        startDate = formatOffsetDate(182);
        endDate = formatOffsetDate(2);
      } else if (rawStart === "365daysAgo" || rawStart === "12m") {
        startDate = formatOffsetDate(367);
        endDate = formatOffsetDate(2);
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        startDate = formatOffsetDate(30);
        endDate = formatOffsetDate(2);
      }

      const rows = await fetchGSCSearchAnalytics(siteUrl, {
        startDate,
        endDate,
        dimensions: [dimension],
        country,
        city,
        rowLimit: 100,
      }).catch(() => []);

      return {
        ok: true,
        projectId: "gmb-safaeewala",
        clientEmail: "aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com",
        sites,
        rows,
        startDate,
        endDate,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: () => null,
});
