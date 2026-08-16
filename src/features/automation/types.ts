import type { Zap } from "lucide-react";

export type Cadence = "realtime" | "hourly" | "daily" | "weekly" | "monthly";
export type Status = "running" | "paused" | "draft";

export type Flow = {
  id: string;
  name: string;
  desc: string;
  category: string;
  icon: typeof Zap;
  accent: string;
  status: Status;
  cadence: Cadence;
  lastRun: string;
  successRate: number;
  assignedAgents?: string[];
};

export type EditorState =
  | { mode: "create"; base?: Omit<Flow, "id" | "status" | "lastRun" | "successRate"> }
  | { mode: "edit"; flow: Flow }
  | null;
