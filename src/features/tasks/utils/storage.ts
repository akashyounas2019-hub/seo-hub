import type { Task, Template } from "../types";

export const STORAGE_KEY = "aks-assign-tasks-v1";

export function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

export function relativeDue(iso?: string): string {
  if (!iso) return "";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffH = Math.round((then - now) / 36e5);
  if (diffH < 0) return `${Math.abs(diffH)}h overdue`;
  if (diffH < 24) return `${diffH}h`;
  return `${Math.round(diffH / 24)}d`;
}

export function saveState(state: { tasks: Task[]; templates: Template[] }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
