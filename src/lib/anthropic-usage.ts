/**
 * Client for the OptimoClaw Anthropic usage proxy (/api/anthropic-usage).
 *
 * Parsing logic adapted from usage-reference/UsageSection.tsx
 * (parseClaudeUsage / parseClaudeCost functions).
 */

// --- API response shape (from our proxy) ---

export interface AnthropicUsageResponse {
  available: boolean;
  error?: string;
  setupUrl?: string;
  usage?: unknown;
  cost?: unknown;
  period?: { start: string; end: string; days: number };
  source?: string;
}

// --- Parsed summaries ---

export interface ParsedUsage {
  input: number;
  output: number;
  cached: number;
  totalTokens: number;
}

export interface ParsedCost {
  totalUsd: number;
}

// --- Parsing functions (from UsageSection.tsx reference) ---

/**
 * Parse the usage report into aggregated token counts.
 * Matches the proven parseClaudeUsage pattern from the reference.
 */
export function parseClaudeUsage(usage: unknown): ParsedUsage {
  const data =
    (usage as { data?: Array<{ results?: Array<Record<string, unknown>> }> })
      ?.data ?? [];
  let input = 0;
  let output = 0;
  let cached = 0;

  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      input += (r.uncached_input_tokens as number) ?? 0;
      output += (r.output_tokens as number) ?? 0;
      cached += (r.cache_read_input_tokens as number) ?? 0;
    }
  }

  return { input, output, cached, totalTokens: input + output + cached };
}

/**
 * Parse the cost report into USD.
 * The amount field is in cents — divide by 100.
 * Matches the proven parseClaudeCost pattern from the reference.
 */
export function parseClaudeCost(cost: unknown): ParsedCost {
  const data =
    (cost as { data?: Array<{ results?: Array<{ amount?: string }> }> })
      ?.data ?? [];
  let totalCents = 0;

  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      totalCents += parseFloat(r.amount ?? "0") || 0;
    }
  }

  return { totalUsd: totalCents / 100 };
}

// --- Fetch helper ---

/**
 * Fetch usage + cost data via our API proxy.
 * The admin key is sent in a header, never in the URL.
 */
export async function fetchAnthropicUsage(
  adminKey: string,
  days: number = 30
): Promise<AnthropicUsageResponse> {
  const res = await fetch(`/api/anthropic-usage?days=${days}`, {
    headers: {
      "x-admin-key": adminKey,
    },
  });

  const data: AnthropicUsageResponse = await res.json();
  return data;
}

/**
 * Validate an Admin key by making a small usage request.
 * Returns parsed usage + cost on success.
 */
export async function validateAdminKey(adminKey: string): Promise<
  | {
      valid: true;
      usage: ParsedUsage;
      cost: ParsedCost;
      perModel: PerModelUsage[];
      period: { start: string; end: string; days: number };
    }
  | { valid: false; error: string }
> {
  const response = await fetchAnthropicUsage(adminKey, 30);

  if (!response.available || response.error) {
    return {
      valid: false,
      error:
        response.error ??
        "Failed to connect. Check your key and try again.",
    };
  }

  const usage = parseClaudeUsage(response.usage);
  const cost = parseClaudeCost(response.cost);
  const perModel = parsePerModelUsage(response.usage);

  return {
    valid: true,
    usage,
    cost,
    perModel,
    period: response.period ?? {
      start: "",
      end: "",
      days: 30,
    },
  };
}

/**
 * Quick check: does this look like an Admin key format?
 */
export function looksLikeAdminKey(key: string): boolean {
  return key.startsWith("sk-ant-admin");
}

// --- Per-model usage parsing ---

export interface PerModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  /** Number of result rows = rough proxy for number of active days */
  activeDays: number;
}

/**
 * Parse usage report grouped by model into per-model token breakdowns.
 * Requires the API call to include group_by[]=model.
 */
export function parsePerModelUsage(usage: unknown): PerModelUsage[] {
  const data =
    (usage as { data?: Array<{ results?: Array<Record<string, unknown>> }> })
      ?.data ?? [];

  const byModel = new Map<string, PerModelUsage>();

  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      const model = String(r.model ?? "unknown");
      const existing = byModel.get(model) ?? {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        activeDays: 0,
      };

      existing.inputTokens += (r.uncached_input_tokens as number) ?? 0;
      existing.outputTokens += (r.output_tokens as number) ?? 0;
      existing.cachedTokens += (r.cache_read_input_tokens as number) ?? 0;
      existing.activeDays += 1; // each bucket-result pair = 1 day of activity
      existing.totalTokens =
        existing.inputTokens + existing.outputTokens + existing.cachedTokens;

      byModel.set(model, existing);
    }
  }

  return Array.from(byModel.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens
  );
}

// --- Display helpers ---

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
