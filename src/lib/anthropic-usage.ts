/**
 * Real Anthropic Admin API client for usage/cost data.
 * Hits GET /v1/organizations/usage_report/messages with an Admin API key.
 *
 * Admin keys start with "sk-ant-admin" — standard keys won't work.
 */

const ANTHROPIC_API_BASE = "https://api.anthropic.com";

// --- Types matching the real API response ---

interface CacheCreation {
  ephemeral_5m_input_tokens: number;
  ephemeral_1h_input_tokens: number;
}

interface ServerToolUse {
  web_search_requests: number;
}

export interface UsageResult {
  api_key_id: string | null;
  model: string | null;
  service_tier: string | null;
  context_window: string | null;
  inference_geo: string | null;
  workspace_id: string | null;
  speed: string | null;
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: CacheCreation;
  output_tokens: number;
  server_tool_use: ServerToolUse;
}

export interface UsageBucket {
  starting_at: string;
  ending_at: string;
  results: UsageResult[];
}

export interface UsageReport {
  data: UsageBucket[];
  has_more: boolean;
  next_page: string | null;
}

// --- Per-model spend summary we derive from the raw data ---

export interface ModelSpendSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

// --- API client ---

/**
 * Fetch usage data from the Anthropic Admin API.
 * Requires an Admin API key (sk-ant-admin...).
 *
 * We proxy through our own Next.js API route to avoid CORS issues
 * (browser can't hit api.anthropic.com directly due to CORS headers).
 */
export async function fetchUsageReport(
  adminKey: string,
  options?: {
    startingAt?: string; // RFC 3339
    endingAt?: string; // RFC 3339
    bucketWidth?: "1d" | "1h" | "1m";
    groupBy?: string[];
    models?: string[];
  }
): Promise<UsageReport> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams();
  params.set(
    "starting_at",
    options?.startingAt ?? thirtyDaysAgo.toISOString()
  );
  if (options?.endingAt) {
    params.set("ending_at", options.endingAt);
  }
  params.set("bucket_width", options?.bucketWidth ?? "1d");

  // Always group by model so we get per-model breakdowns
  const groupBy = options?.groupBy ?? ["model"];
  for (const g of groupBy) {
    params.append("group_by[]", g);
  }

  if (options?.models) {
    for (const m of options.models) {
      params.append("models[]", m);
    }
  }

  // Call our API route proxy to avoid CORS
  const res = await fetch(`/api/anthropic-usage?${params.toString()}`, {
    headers: {
      "x-admin-key": adminKey,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        "This doesn't look like an Admin key — check your Anthropic Console and try again."
      );
    }
    if (res.status === 403) {
      throw new Error(
        "This key doesn't have permission to access usage data. Make sure it's an Admin key, not a standard API key."
      );
    }
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Validate that a key is an Admin key by making a small usage request.
 * Returns the usage report on success so we don't waste the call.
 */
export async function validateAdminKey(
  adminKey: string
): Promise<{ valid: true; report: UsageReport } | { valid: false; error: string }> {
  try {
    // Request just the last 7 days to keep it fast
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const report = await fetchUsageReport(adminKey, {
      startingAt: sevenDaysAgo,
      bucketWidth: "1d",
      groupBy: ["model"],
    });

    return { valid: true, report };
  } catch (err) {
    return {
      valid: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to validate key. Check your connection and try again.",
    };
  }
}

/**
 * Aggregate a usage report into per-model summaries.
 */
export function summarizeByModel(report: UsageReport): ModelSpendSummary[] {
  const byModel = new Map<string, ModelSpendSummary>();

  for (const bucket of report.data) {
    for (const result of bucket.results) {
      const model = result.model ?? "unknown";
      const existing = byModel.get(model) ?? {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
      };

      existing.inputTokens += result.uncached_input_tokens;
      existing.outputTokens += result.output_tokens;
      existing.cacheReadTokens += result.cache_read_input_tokens;
      existing.cacheWriteTokens +=
        (result.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (result.cache_creation?.ephemeral_1h_input_tokens ?? 0);
      existing.totalTokens =
        existing.inputTokens +
        existing.outputTokens +
        existing.cacheReadTokens +
        existing.cacheWriteTokens;

      byModel.set(model, existing);
    }
  }

  return Array.from(byModel.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens
  );
}

/**
 * Quick check: does this look like an Admin key format?
 */
export function looksLikeAdminKey(key: string): boolean {
  return key.startsWith("sk-ant-admin");
}
