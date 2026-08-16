import { createFileRoute } from "@tanstack/react-router";
import { buildPromptForKind } from "@/lib/job-templates";
import { jobsStore } from "@/lib/jobs-store";

export const Route = createFileRoute("/api/jobs/claim")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    try {
      let workerId = "mac-worker";
      if (request && request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        workerId = body.workerId || "mac-worker";
      }

      const claimed = jobsStore.claim(workerId);
      if (!claimed) {
        return { ok: true, job: null };
      }

      const prompt = buildPromptForKind(claimed.kind, claimed.input);

      return {
        ok: true,
        job: {
          id: claimed.id,
          kind: claimed.kind,
          title: claimed.title,
          prompt,
          input: claimed.input,
        },
      };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },
  component: ApiJobsClaimComponent,
});

function ApiJobsClaimComponent() {
  return null;
}
