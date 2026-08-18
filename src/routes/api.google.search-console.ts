import { createFileRoute } from "@tanstack/react-router";
import { fetchGSCSearchAnalytics, fetchGSCSites } from "@/lib/google/search-console";

export const Route = createFileRoute("/api/google/search-console")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    try {
      const url = new URL(request.url);
      const sites = await fetchGSCSites().catch(() => []);
      const defaultSite = sites[0]?.siteUrl || "https://safaeewala.com/";
      const siteUrl = url.searchParams.get("siteUrl") || defaultSite;
      const startDate = url.searchParams.get("startDate") || "2026-07-15";
      const endDate = url.searchParams.get("endDate") || "2026-08-12";
      const dimension = (url.searchParams.get("dimension") || "date") as any;
      const country = url.searchParams.get("country") || "are";
      const city = url.searchParams.get("city") || "all";

      const rows = await fetchGSCSearchAnalytics(siteUrl, {
        startDate,
        endDate,
        dimensions: [dimension],
        country,
        city,
        rowLimit: 50,
      }).catch(() => []);

      return {
        ok: true,
        projectId: "gmb-safaeewala",
        clientEmail: "aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com",
        sites,
        rows,
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: () => null,
});
