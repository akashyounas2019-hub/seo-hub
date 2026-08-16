/**
 * The platform's own public base URL — used to build absolute links (e.g.
 * invite/onboarding links) that are sent to people who aren't already in the
 * app. Configure via PUBLIC_BASE_URL; defaults to the local dev port.
 */
export function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? "http://localhost:3001";
}
