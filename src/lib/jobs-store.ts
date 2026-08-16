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

const STORAGE_KEY = "aks_ai_jobs_queue_v1";

const SEED_JOBS: AIJob[] = [
  {
    id: "seed-job-1",
    kind: "seo:technical-audit",
    title: "Full technical audit for akscleaning.ae",
    status: "done",
    input: { url: "https://akscleaning.ae", scope: "deep" },
    outputMarkdown: `### Technical SEO Audit Report — akscleaning.ae
- **Crawlability**: 98% indexable URLs. 2 canonical tag mismatches flagged.
- **Core Web Vitals**: LCP 2.1s (Good), INP 180ms (Good), CLS 0.04 (Good).
- **Schema**: LocalBusiness JSON-LD correctly injected on homepage.`,
    priority: "high",
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    completedAt: new Date(Date.now() - 3600000 * 1.8).toISOString(),
    durationMs: 24500,
  },
  {
    id: "seed-job-2",
    kind: "content:blog-post",
    title: "Draft post: Top Villa Deep Cleaning Tips for Dubai Summer 2026",
    status: "pending",
    input: {
      topic: "Villa Deep Cleaning Tips in Dubai",
      keyword: "deep cleaning villa dubai",
      niche: "Cleaning Services",
      city: "Dubai",
      wordCount: 1500,
    },
    priority: "normal",
    createdAt: new Date().toISOString(),
  },
];

class JobsStore {
  private jobs: AIJob[] = [];

  constructor() {
    this.jobs = this.load();
  }

  private load(): AIJob[] {
    if (typeof window === "undefined") return SEED_JOBS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return SEED_JOBS;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_JOBS;
    } catch {
      return SEED_JOBS;
    }
  }

  private save() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.jobs));
    } catch {}
  }

  public getAll(): AIJob[] {
    return [...this.jobs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  public getById(id: string): AIJob | undefined {
    return this.jobs.find((j) => j.id === id);
  }

  public create(data: Omit<AIJob, "id" | "status" | "createdAt">): AIJob {
    const job: AIJob = {
      ...data,
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.jobs = [job, ...this.jobs];
    this.save();
    return job;
  }

  public claim(workerId: string): AIJob | null {
    const pendingIndex = this.jobs.findIndex((j) => j.status === "pending");
    if (pendingIndex === -1) return null;

    const job = this.jobs[pendingIndex];
    const updated: AIJob = {
      ...job,
      status: "claimed",
      claimedAt: new Date().toISOString(),
      workerId,
    };
    this.jobs[pendingIndex] = updated;
    this.save();
    return updated;
  }

  public heartbeat(id: string): boolean {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index === -1) return false;
    this.jobs[index] = { ...this.jobs[index], status: "running" };
    this.save();
    return true;
  }

  public complete(id: string, outputMarkdown: string, durationMs?: number): boolean {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index === -1) return false;
    this.jobs[index] = {
      ...this.jobs[index],
      status: "done",
      outputMarkdown,
      durationMs,
      completedAt: new Date().toISOString(),
    };
    this.save();
    return true;
  }

  public fail(id: string, error: string): boolean {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index === -1) return false;
    this.jobs[index] = {
      ...this.jobs[index],
      status: "failed",
      error,
      completedAt: new Date().toISOString(),
    };
    this.save();
    return true;
  }

  public delete(id: string): boolean {
    const initialLen = this.jobs.length;
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.save();
    return this.jobs.length < initialLen;
  }
}

export const jobsStore = new JobsStore();
