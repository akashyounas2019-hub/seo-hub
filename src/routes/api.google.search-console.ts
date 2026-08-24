import { createFileRoute } from "@tanstack/react-router";
import { fetchGSCSearchAnalytics, fetchGSCSites } from "@/lib/google/search-console";
import { getBigQueryStatus } from "@/lib/google/bigquery";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export const Route = createFileRoute("/api/google/search-console")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const siteUrlParam = url.searchParams.get("siteUrl") || "https://safaeewala.com/";
          const rawStart = url.searchParams.get("startDate") || "28daysAgo";
          const country = url.searchParams.get("country") || "all";
          const city = url.searchParams.get("city") || "all";

          let startDate = rawStart;
          let endDate = url.searchParams.get("endDate") || "today";

          if (rawStart === "7daysAgo" || rawStart === "7d") {
            startDate = formatOffsetDate(9);
            endDate = formatOffsetDate(2);
          } else if (rawStart === "14daysAgo" || rawStart === "14d" || rawStart === "14v14") {
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

          // Fetch sites and BigQuery status in parallel with GSC analytics
          const [sites, dateRows, queryRows, pageRows, deviceRows, countryRows, bqStatus] =
            await Promise.all([
              fetchGSCSites().catch(() => [{ siteUrl: "https://safaeewala.com/", permissionLevel: "siteFullUser" }]),
              fetchGSCSearchAnalytics(siteUrlParam, {
                startDate, endDate, dimensions: ["date"], country, city, rowLimit: 500,
              }).catch(() => []),
              fetchGSCSearchAnalytics(siteUrlParam, {
                startDate, endDate, dimensions: ["query"], country, city, rowLimit: 100,
              }).catch(() => []),
              fetchGSCSearchAnalytics(siteUrlParam, {
                startDate, endDate, dimensions: ["page"], country, city, rowLimit: 100,
              }).catch(() => []),
              fetchGSCSearchAnalytics(siteUrlParam, {
                startDate, endDate, dimensions: ["device"], country, city, rowLimit: 10,
              }).catch(() => []),
              fetchGSCSearchAnalytics(siteUrlParam, {
                startDate, endDate, dimensions: ["country"], rowLimit: 30,
              }).catch(() => []),
              getBigQueryStatus("gmb-safaeewala").catch(() => ({
                connected: false,
                projectId: "gmb-safaeewala",
                datasets: [] as string[],
                tablesCount: 0,
                lastExportDate: null,
                latestRecordCount: 0,
                error: "BigQuery status check failed",
              })),
            ]);

          // Compute aggregate summary
          let totalClicks = 0;
          let totalImpressions = 0;
          let sumPosition = 0;

          for (const r of dateRows) {
            totalClicks += r.clicks || 0;
            totalImpressions += r.impressions || 0;
            sumPosition += (r.position || 0) * (r.impressions || 0);
          }

          const avgCtr = totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
          const avgPosition = totalImpressions > 0 ? parseFloat((sumPosition / totalImpressions).toFixed(1)) : 0;

          return Response.json({
            ok: true,
            projectId: "gmb-safaeewala",
            clientEmail: "aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com",
            property: siteUrlParam,
            sites,
            startDate,
            endDate,
            summary: {
              clicks: totalClicks,
              impressions: totalImpressions,
              ctr: avgCtr,
              position: avgPosition,
              daysCount: dateRows.length,
            },
            dateRows,
            queryRows,
            pageRows,
            deviceRows,
            countryRows,
            bigQuery: bqStatus,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
