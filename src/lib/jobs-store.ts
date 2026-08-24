// Postgres-backed AI job queue (backs the Scout Team / AI Jobs screens).
// Client callers hit the /api/jobs/* routes, which read and write the
// `claude_jobs` table via Drizzle (src/db/schema.ts, src/routes/api.jobs.*.ts).
// This used to be a pure localStorage class with a fabricated SEED_JOBS seed;
// it now proxies to the real API so job records persist across restarts and
// are visible from any client, not just the browser that created them.

export type JobStatus = "pending" | "claimed" | "running" | "done" | "failed" | "cancelled";
export type JobPriority = "low" | "normal" | "high" | "critical";

export type AIJob = {
  id: string;
  kind: string;
  title: string;
  status: JobStatus;
  input: Record<string, any>;
  outputMarkdown?: string;
  error?: string;
  preferWorker?: string;
  priority: JobPriority;
  createdBy?: string;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  durationMs?: number;
  workerId?: string;
};

function fromRow(row: any): AIJob {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    input: row.input || {},
    outputMarkdown: row.outputMarkdown ?? undefined,
    error: row.error ?? undefined,
    preferWorker: row.preferWorker,
    priority: row.priority,
    createdBy: row.createdBy ?? undefined,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt ?? undefined,
    completedAt: row.finishedAt ?? undefined,
    durationMs: row.durationMs ?? undefined,
    workerId: row.workerId ?? undefined,
  };
}

class JobsStore {
  public async getAll(): Promise<AIJob[]> {
    try {
      const res = await fetch("/api/jobs");
      const json = await res.json();
      const jobs = json?.jobs || [];
      return jobs.map(fromRow);
    } catch {
      return [];
    }
  }

  public async create(data: Omit<AIJob, "id" | "status" | "createdAt">): Promise<AIJob | null> {
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      return json?.job ? fromRow(json.job) : null;
    } catch {
      return null;
    }
  }

  public async claim(workerId: string): Promise<AIJob | null> {
    try {
      const res = await fetch("/api/jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      const json = await res.json();
      return json?.job ? fromRow(json.job) : null;
    } catch {
      return null;
    }
  }

  public async heartbeat(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/jobs/${id}/heartbeat`, { method: "POST" });
      const json = await res.json();
      return !!json?.ok;
    } catch {
      return false;
    }
  }

  public async complete(id: string, outputMarkdown: string, durationMs?: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/jobs/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputMarkdown, durationMs }),
      });
      const json = await res.json();
      return !!json?.ok;
    } catch {
      return false;
    }
  }

  public async fail(id: string, error: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/jobs/${id}/fail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error }),
      });
      const json = await res.json();
      return !!json?.ok;
    } catch {
      return false;
    }
  }

  public async delete(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      const json = await res.json();
      return !!json?.ok;
    } catch {
      return false;
    }
  }
}

export const jobsStore = new JobsStore();
