import type { LucideIcon } from "lucide-react";

export type Priority = "low" | "medium" | "high" | "critical";
export type Status = "todo" | "inprogress" | "review" | "done";

export type Task = {
  id: string;
  title: string;
  desc?: string;
  assignee: string; // agent title
  priority: Priority;
  status: Status;
  due?: string; // ISO date
  templateId?: string;
  jobId?: string;
  outputMarkdown?: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
};

export type Template = {
  id: string;
  name: string;
  title: string;
  desc: string;
  defaultAssignee?: string;
  priority: Priority;
  builtIn?: boolean;
};

export type ColumnMeta = {
  id: Status;
  title: string;
  hint: string;
  accent: string;
  dot: string;
};

export type PriorityMeta = {
  label: string;
  cls: string;
  ring: string;
  icon: LucideIcon;
};
