import { createFileRoute } from "@tanstack/react-router";
import { jobsStore } from "@/lib/jobs-store";

export const Route = createFileRoute("/api/jobs/")({
  loader: async (ctx: any) => {
    const request = ctx?.request;
    if (request && request.method === "POST") {
      try {
        const body = await request.json();
        if (body.kind && body.title) {
          const job = jobsStore.create({
            kind: body.kind,
            title: body.title,
            input: body.input || {},
            priority: body.priority || "normal",
            preferWorker: body.preferWorker || "mac",
            createdBy: body.createdBy || "Web UI",
          });
          return { ok: true, job };
        }
      } catch {}
    }
    const jobs = jobsStore.getAll();
    return { ok: true, jobs };
  },
  component: ApiJobsIndexComponent,
});

function ApiJobsIndexComponent() {
  return null;
}
