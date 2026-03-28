/**
 * Client for the BroadClaw OpenAI usage proxy (/api/openai-usage).
 *
 * OpenAI Usage API returns token counts per model.
 * OpenAI Costs API returns USD amounts per line item.
 */

// --- API response shape (from our proxy) ---

export interface OpenAIUsageResponse {
  available: boolean;
  error?: string;
  setupUrl?: string;
  usage?: unknown;
  cost?: unknown;
  period?: { start: string; end: string; days: number };
  source?: string;
}

// --- Parsed summaries ---

export interface ParsedOpenAIUsage {
  input: number;
  output: number;
  cached: number;
  totalTokens: number;
}

export interface ParsedOpenAICost {
  totalUsd: number;
}

// --- Parsing functions ---

/**
 * Parse the OpenAI usage report into aggregated token counts.
 * OpenAI returns input_tokens, output_tokens, input_cached_tokens per bucket.
 */
export function parseOpenAIUsage(usage: unknown): ParsedOpenAIUsage {
  const data =
    (usage as { data?: Array<{ results?: Array<Record<string, unknown>> }> })
      ?.data ?? [];
  let input = 0;
  let output = 0;
  let cached = 0;

  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      input += (r.input_tokens as number) ?? 0;
      output += (r.output_tokens as number) ?? 0;
      cached += (r.input_cached_tokens as number) ?? 0;
    }
  }

  return { input, output, cached, totalTokens: input + output + cached };
}

/**
 * Parse the OpenAI cost report into USD.
 * OpenAI returns { amount: { value: number, currency: "usd" } } per result.
 */
export function parseOpenAICost(cost: unknown): ParsedOpenAICost {
  const data =
    (cost as { data?: Array<{ results?: Array<Record<string, unknown>> }> })
      ?.data ?? [];
  let totalUsd = 0;

  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      const amount = r.amount as { value?: number; currency?: string } | undefined;
      if (amount?.value) {
        totalUsd += amount.value;
      }
    }
  }

  return { totalUsd };
}

// --- Per-model usage parsing ---

export interface PerModelOpenAIUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  activeDays: number;
}

/**
 * Parse usage report grouped by model into per-model token breakdowns.
 */
export function parseOpenAIPerModelUsage(usage: unknown): PerModelOpenAIUsage[] {
  const data =
    (usage as { data?: Array<{ results?: Array<Record<string, unknown>> }> })
      ?.data ?? [];

  const byModel = new Map<string, PerModelOpenAIUsage>();

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

      existing.inputTokens += (r.input_tokens as number) ?? 0;
      existing.outputTokens += (r.output_tokens as number) ?? 0;
      existing.cachedTokens += (r.input_cached_tokens as number) ?? 0;
      existing.activeDays += 1;
      existing.totalTokens =
        existing.inputTokens + existing.outputTokens + existing.cachedTokens;

      byModel.set(model, existing);
    }
  }

  return Array.from(byModel.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens
  );
}

// --- Fetch helper ---

export async function fetchOpenAIUsage(
  adminKey: string,
  days: number = 30
): Promise<OpenAIUsageResponse> {
  const res = await fetch(`/api/openai-usage?days=${days}`, {
    headers: {
      "x-admin-key": adminKey,
    },
  });

  const data: OpenAIUsageResponse = await res.json();
  return data;
}

/**
 * Validate an OpenAI Admin key by making a usage request.
 */
export async function validateOpenAIAdminKey(adminKey: string): Promise<
  | {
      valid: true;
      usage: ParsedOpenAIUsage;
      cost: ParsedOpenAICost;
      perModel: PerModelOpenAIUsage[];
      period: { start: string; end: string; days: number };
    }
  | { valid: false; error: string }
> {
  const response = await fetchOpenAIUsage(adminKey, 30);

  if (!response.available || response.error) {
    return {
      valid: false,
      error:
        response.error ??
        "Failed to connect. Check your key and try again.",
    };
  }

  const usage = parseOpenAIUsage(response.usage);
  const cost = parseOpenAICost(response.cost);
  const perModel = parseOpenAIPerModelUsage(response.usage);

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
 * Quick check: does this look like an OpenAI key?
 */
export function looksLikeOpenAIKey(key: string): boolean {
  return key.startsWith("sk-");
}

// --- Display helpers ---

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
