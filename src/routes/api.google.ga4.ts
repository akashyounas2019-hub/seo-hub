import { createFileRoute } from "@tanstack/react-router";
import { fetchGA4Report } from "@/lib/google/analytics-ga4";

function formatOffsetDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

function resolveDateRange(rawStart: string, rawEnd: string) {
  let startDate = rawStart;
  let endDate = rawEnd;

  if (rawStart === "7daysAgo" || rawStart === "7d") {
    startDate = formatOffsetDate(7);
    endDate = "today";
  } else if (rawStart === "14daysAgo" || rawStart === "14d" || rawStart === "14v14") {
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

  return { startDate, endDate };
}

export const Route = createFileRoute("/api/google/ga4")({
  server: {
    handlers: {
      GET: async ({ request }) => {
    try {
      const url = new URL(request.url);
      const propertyId = url.searchParams.get("propertyId") || "";
      if (!propertyId) {
        return Response.json({ ok: false, error: "propertyId is required" }, { status: 400 });
      }
      const rawStart = url.searchParams.get("startDate") || "28daysAgo";
      const rawEnd = url.searchParams.get("endDate") || "today";
      const { startDate, endDate } = resolveDateRange(rawStart, rawEnd);

      const [overviewReport, trendReport, pagesReport, channelsReport, deviceReport, countryReport] =
        await Promise.all([
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
            metrics: ["sessions", "activeUsers"],
            dimensions: ["date"],
          }).catch(() => null),
          fetchGA4Report({
            propertyId,
            startDate,
            endDate,
            metrics: ["screenPageViews", "averageSessionDuration", "conversions"],
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
            propertyId,
            startDate,
            endDate,
            metrics: ["sessions"],
            dimensions: ["deviceCategory"],
          }).catch(() => null),
          fetchGA4Report({
            propertyId,
            startDate,
            endDate,
            metrics: ["sessions"],
            dimensions: ["country"],
          }).catch(() => null),
        ]);

      return Response.json({
        ok: true,
        projectId: "gmb-safaeewala",
        propertyId,
        startDate,
        endDate,
        timeZone: "Asia/Dubai",
        overview: overviewReport,
        trend: trendReport,
        pages: pagesReport,
        channels: channelsReport,
        devices: deviceReport,
        countries: countryReport,
      });
    } catch (err: any) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
      },
    },
  },
});
