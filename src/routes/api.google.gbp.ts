import { createFileRoute } from "@tanstack/react-router";
import { fetchGBPAccounts, fetchGBPLocations } from "@/lib/google/business-profile";

export const Route = createFileRoute("/api/google/gbp")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const accounts = await fetchGBPAccounts().catch(() => []);
          let locations: any[] = [];
          if (accounts.length > 0 && accounts[0].name) {
            locations = await fetchGBPLocations(accounts[0].name).catch(() => []);
          }

          return Response.json({
            ok: true,
            projectId: "gmb-safaeewala",
            clientEmail: "aks-seo-service-account@gmb-safaeewala.iam.gserviceaccount.com",
            accounts,
            locations,
          });
        } catch (err: any) {
          return Response.json({ ok: false, error: err.message }, { status: 500 });
        }
      },
    },
  },
});
