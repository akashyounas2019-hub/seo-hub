import { createFileRoute } from "@tanstack/react-router";
import { jobsStore } from "@/lib/jobs-store";

export const Route = createFileRoute("/api/jobs/$id/heartbeat")({
  loader: async ({ params }) => {
    const success = jobsStore.heartbeat(params.id);
    return { ok: success };
  },
  component: ApiJobsHeartbeatComponent,
});

function ApiJobsHeartbeatComponent() {
  return null;
}
