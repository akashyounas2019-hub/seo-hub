import { createFileRoute } from "@tanstack/react-router";
import { jobsStore } from "@/lib/jobs-store";

export const Route = createFileRoute("/api/jobs/$id/fail")({
  loader: async (ctx: any) => {
    const params = ctx?.params || {};
    const request = ctx?.request;
    try {
      let body: any = {};
      if (request && request.method === "POST") {
        body = await request.json().catch(() => ({}));
      }
      const success = jobsStore.fail(params.id, body.error || "Unknown error");
      return { ok: success };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: ApiJobsFailComponent,
});

function ApiJobsFailComponent() {
  return null;
}
