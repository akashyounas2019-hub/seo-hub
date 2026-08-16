/**
 * Token pricing for the Anthropic models the platform uses.
 *
 * Prices are stored in **micro-USD per million tokens** so cost math stays
 * integer-only at the database level. Historical rows keep the cost computed at
 * insert time, so editing this table does not retroactively rewrite past spend.
 */
export type AnthropicModel =
  | "claude-opus-4-7"
  | "claude-sonnet-4-7"
  | "claude-haiku-4-5";

interface PerTokenMicroUsd {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

const PRICES_MICRO_USD_PER_M_TOKENS: Record<AnthropicModel, PerTokenMicroUsd> = {
  "claude-opus-4-7": {
    input: 15_000_000,
    output: 75_000_000,
    cacheRead: 1_500_000,
    cacheWrite: 18_750_000,
  },
  "claude-sonnet-4-7": {
    input: 3_000_000,
    output: 15_000_000,
    cacheRead: 300_000,
    cacheWrite: 3_750_000,
  },
  "claude-haiku-4-5": {
    input: 1_000_000,
    output: 5_000_000,
    cacheRead: 100_000,
    cacheWrite: 1_250_000,
  },
};

/**
 * Compute integer micro-USD cost from a usage breakdown. Falls back to Opus
 * pricing for an unknown model so we never under-report spend.
 */
export function costMicroUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): number {
  const table =
    PRICES_MICRO_USD_PER_M_TOKENS[input.model as AnthropicModel] ??
    PRICES_MICRO_USD_PER_M_TOKENS["claude-opus-4-7"];
  const t = (n: number, perMillion: number): number =>
    Math.round((n * perMillion) / 1_000_000);
  return (
    t(input.inputTokens, table.input) +
    t(input.outputTokens, table.output) +
    t(input.cacheReadTokens ?? 0, table.cacheRead) +
    t(input.cacheWriteTokens ?? 0, table.cacheWrite)
  );
}

/** Pretty-print a micro-USD value for the dashboard. e.g. 1_234_567 -> "$1.23". */
export function formatMicroUsd(micro: number): string {
  const dollars = micro / 1_000_000;
  if (dollars >= 100) return `$${dollars.toFixed(0)}`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  if (dollars >= 0.01) return `$${dollars.toFixed(3)}`;
  if (dollars >= 0.0001) return `$${dollars.toFixed(4)}`;
  return "<$0.0001";
}

/**
 * Per-job cost transparency. Mac worker jobs are always $0 (subscription, not
 * per-token). Server executor jobs use the Anthropic API and incur token-cost.
 */
export function jobCost(input: {
  preferWorker?: string | null;
  workerId?: string | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  model?: string | null;
}): { engine: "mac" | "server" | "unknown"; microUsd: number | null; label: string } {
  const engine: "mac" | "server" | "unknown" = (() => {
    if (input.workerId?.startsWith("server:")) return "server";
    if (input.workerId && input.workerId.includes("@")) return "mac";
    if (input.preferWorker === "mac") return "mac";
    if (input.preferWorker === "server") return "server";
    return "unknown";
  })();

  if (engine === "mac") {
    return { engine, microUsd: 0, label: "$0 · subscription" };
  }
  if (engine === "server") {
    const tIn = input.tokensInput ?? 0;
    const tOut = input.tokensOutput ?? 0;
    if (tIn === 0 && tOut === 0) {
      return { engine, microUsd: null, label: "— · server" };
    }
    const micro = costMicroUsd({
      model: input.model ?? "claude-opus-4-7",
      inputTokens: tIn,
      outputTokens: tOut,
    });
    return { engine, microUsd: micro, label: `${formatMicroUsd(micro)} · API` };
  }
  return { engine: "unknown", microUsd: null, label: "—" };
}
