import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const past = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  let body: string;
  if (sec < 60) body = `${sec}s`;
  else if (min < 60) body = `${min}m`;
  else if (hr < 24) body = `${hr}h`;
  else if (day < 30) body = `${day}d`;
  else return d.toISOString().slice(0, 10);

  return past ? `${body} ago` : `in ${body}`;
}
