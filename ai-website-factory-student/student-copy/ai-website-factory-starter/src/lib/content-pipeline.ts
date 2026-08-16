/**
 * P4 — Content pipeline state machine.
 *
 * Five steady states + archived. Transitions are validated server-side:
 * any attempt to jump straight from "brief" to "published" is rejected.
 */

export type BriefStatus =
  | "brief"
  | "drafting"
  | "review"
  | "approved"
  | "published"
  | "archived";

export const BRIEF_STATUSES: BriefStatus[] = [
  "brief",
  "drafting",
  "review",
  "approved",
  "published",
  "archived",
];

const ALLOWED_TRANSITIONS: Record<BriefStatus, BriefStatus[]> = {
  brief: ["drafting", "archived"],
  drafting: ["review", "brief", "archived"],
  review: ["approved", "drafting", "archived"],
  approved: ["published", "review", "archived"],
  published: ["archived"],
  archived: ["brief"],
};

export function isAllowedTransition(from: BriefStatus, to: BriefStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStates(from: BriefStatus): BriefStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

export function statusTone(s: BriefStatus): "info" | "warning" | "accent" | "success" | "neutral" {
  switch (s) {
    case "brief":
      return "info";
    case "drafting":
      return "warning";
    case "review":
      return "accent";
    case "approved":
      return "accent";
    case "published":
      return "success";
    case "archived":
      return "neutral";
  }
}

export function statusLabel(s: BriefStatus): string {
  switch (s) {
    case "brief":
      return "Brief";
    case "drafting":
      return "Drafting";
    case "review":
      return "In review";
    case "approved":
      return "Approved";
    case "published":
      return "Published";
    case "archived":
      return "Archived";
  }
}
