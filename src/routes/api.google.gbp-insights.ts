import { createFileRoute } from "@tanstack/react-router";
import {
  fetchGBPAccounts,
  fetchGBPLocations,
  fetchGBPReviews,
  fetchGBPPerformance,
  fetchGBPSearchKeywords,
} from "@/lib/google/business-profile";

// Real Google Business Profile insights: performance metrics, reviews, and
// search keywords. Each section is fetched independently and reports its
// own ok/error -- one API not being enabled on the service account's GCP
// project (a real, common state) shouldn't take down the whole drilldown or
// force the UI to fall back to invented numbers for that section.
export const Route = createFileRoute("/api/google/gbp-insights")({
  server: {
    handlers: {
      GET: async () => {
        const result: Record<string, any> = {
          ok: true,
          location: null,
          performance: { ok: false, error: null as string | null, series: [] as any[] },
          reviews: { ok: false, error: null as string | null, reviews: [] as any[], averageRating: null, totalReviewCount: null },
          searchKeywords: { ok: false, error: null as string | null, keywords: [] as any[] },
        };

        try {
          const accounts = await fetchGBPAccounts();
          if (!accounts.length) {
            return Response.json({ ...result, ok: false, error: "No Google Business Profile accounts accessible to this service account" });
          }

          const locations = await fetchGBPLocations(accounts[0].name);
          if (!locations.length) {
            return Response.json({ ...result, ok: false, error: "No GBP locations found on this account" });
          }

          const location = locations[0];
          result.location = { name: location.name, title: location.title };

          const locationId = location.name;
          const accountId = accounts[0].name;

          await Promise.all([
            fetchGBPPerformance(locationId)
              .then((series) => { result.performance = { ok: true, error: null, series }; })
              .catch((err) => { result.performance = { ok: false, error: err.message, series: [] }; }),

            fetchGBPReviews(accountId, locationId)
              .then(({ reviews, averageRating, totalReviewCount }) => {
                result.reviews = { ok: true, error: null, reviews, averageRating, totalReviewCount };
              })
              .catch((err) => { result.reviews = { ok: false, error: err.message, reviews: [], averageRating: null, totalReviewCount: null }; }),

            fetchGBPSearchKeywords(locationId)
              .then((keywords) => { result.searchKeywords = { ok: true, error: null, keywords }; })
              .catch((err) => { result.searchKeywords = { ok: false, error: err.message, keywords: [] }; }),
          ]);

          return Response.json(result);
        } catch (err: any) {
          return Response.json({ ...result, ok: false, error: err.message || "Failed to load GBP insights" }, { status: 500 });
        }
      },
    },
  },
});
