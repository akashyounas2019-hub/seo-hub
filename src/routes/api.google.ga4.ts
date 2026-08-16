import { createFileRoute } from "@tanstack/react-router";
import { fetchGA4Report } from "@/lib/google/analytics-ga4";

export const Route = createFileRoute("/api/google/ga4")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    try {
      const url = new URL(request.url);
      const propertyId = url.searchParams.get("propertyId") || "377896920";
      const startDate = url.searchParams.get("startDate") || "30daysAgo";
      const endDate = url.searchParams.get("endDate") || "today";

      const [overviewReport, pagesReport, channelsReport, trendReport] = await Promise.all([
        fetchGA4Report({
          propertyId,
          startDate,
          endDate,
          metrics: [
            "activeUsers",
            "sessions",
            "eventCount",
            "bounceRate",
            "averageSessionDuration",
            "conversions",
          ],
        }).catch(() => null),
        fetchGA4Report({
          propertyId,
          startDate,
          endDate,
          metrics: ["screenPageViews", "bounceRate", "conversions"],
          dimensions: ["landingPagePlusQueryString"],
        }).catch(() => null),
        fetchGA4Report({
          propertyId,
          startDate,
          endDate,
          metrics: ["sessions"],
          dimensions: ["sessionDefaultChannelGroup"],
        }).catch(() => null),
        fetchGA4Report({
          propertyId: propertyId,
          startDate: "14daysAgo",
          endDate: "today",
          metrics: ["sessions"],
          dimensions: ["date"],
        }).catch(() => null),
      ]);

      return {
        ok: true,
        projectId: "gmb-safaeewala",
        clientEmail: "aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com",
        propertyId,
        timeZone: "Asia/Dubai",
        overview: overviewReport,
        pages: pagesReport,
        channels: channelsReport,
        trend: trendReport,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: () => null,
});
