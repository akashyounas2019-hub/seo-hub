/**
 * Money formatting helper used by reporting surfaces. Niche-agnostic — formats
 * an integer cents value as a currency string.
 */
export function formatCents(cents: number | string | null | undefined, currency = "usd"): string {
  if (cents == null) return "—";
  const n = typeof cents === "string" ? Number(cents) : cents;
  if (!Number.isFinite(n)) return "—";
  const symbol = currency.toLowerCase() === "cad" || currency.toLowerCase() === "usd" ? "$" : "";
  return `${symbol}${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
