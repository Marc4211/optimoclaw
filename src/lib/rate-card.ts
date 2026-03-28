/**
 * Published model rate card — baked into BroadClaw.
 *
 * Source of truth for cost estimation. All prices are $/million tokens (MTok),
 * exactly as published on the provider pricing pages:
 *   - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 *   - OpenAI:    https://developers.openai.com/api/docs/pricing
 *
 * Last verified: 27 March 2026
 *
 * Ollama / local models are always $0 — no entry needed.
 *
 * IMPORTANT: "cachedInputPerMillion" = the cache *read/hit* price (what you
 * pay when the cache is warm). Anthropic calls this "Cache Hits & Refreshes",
 * OpenAI calls it "Cached Input". Cache *write* prices are higher but only
 * apply on the first request — we use the read price for estimates since
 * most agent traffic hits warm caches.
 */

export interface RateCardEntry {
  /** Display name shown in UI */
  displayName: string;
  /** Provider identifier */
  provider: "anthropic" | "openai" | "ollama";
  /** Input tokens — $/million */
  inputPerMillion: number;
  /** Cached input read/hit — $/million */
  cachedInputPerMillion: number;
  /** Output tokens — $/million */
  outputPerMillion: number;
}

// ---------------------------------------------------------------------------
// Anthropic rate card
// Source: https://platform.claude.com/docs/en/about-claude/pricing
// ---------------------------------------------------------------------------

const anthropicRates: Record<string, RateCardEntry> = {
  // Claude Opus 4.6 — $5 input, $0.50 cache hit, $25 output
  "claude-opus-4-6": {
    displayName: "Claude Opus 4.6",
    provider: "anthropic",
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 25,
  },

  // Claude Opus 4.5 — $5 input, $0.50 cache hit, $25 output
  "claude-opus-4-5": {
    displayName: "Claude Opus 4.5",
    provider: "anthropic",
    inputPerMillion: 5,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 25,
  },

  // Claude Opus 4.1 — $15 input, $1.50 cache hit, $75 output
  "claude-opus-4-1": {
    displayName: "Claude Opus 4.1",
    provider: "anthropic",
    inputPerMillion: 15,
    cachedInputPerMillion: 1.5,
    outputPerMillion: 75,
  },

  // Claude Opus 4 — $15 input, $1.50 cache hit, $75 output
  "claude-opus-4": {
    displayName: "Claude Opus 4",
    provider: "anthropic",
    inputPerMillion: 15,
    cachedInputPerMillion: 1.5,
    outputPerMillion: 75,
  },

  // Claude Sonnet 4.6 — $3 input, $0.30 cache hit, $15 output
  "claude-sonnet-4-6": {
    displayName: "Claude Sonnet 4.6",
    provider: "anthropic",
    inputPerMillion: 3,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15,
  },

  // Claude Sonnet 4.5 — $3 input, $0.30 cache hit, $15 output
  "claude-sonnet-4-5": {
    displayName: "Claude Sonnet 4.5",
    provider: "anthropic",
    inputPerMillion: 3,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15,
  },

  // Claude Sonnet 4 — $3 input, $0.30 cache hit, $15 output
  "claude-sonnet-4": {
    displayName: "Claude Sonnet 4",
    provider: "anthropic",
    inputPerMillion: 3,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15,
  },

  // Claude Haiku 4.5 — $1 input, $0.10 cache hit, $5 output
  "claude-haiku-4-5": {
    displayName: "Claude Haiku 4.5",
    provider: "anthropic",
    inputPerMillion: 1,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 5,
  },

  // Claude Haiku 3.5 — $0.80 input, $0.08 cache hit, $4 output
  "claude-haiku-3-5": {
    displayName: "Claude 3.5 Haiku",
    provider: "anthropic",
    inputPerMillion: 0.8,
    cachedInputPerMillion: 0.08,
    outputPerMillion: 4,
  },

  // Claude Haiku 3 (legacy) — $0.25 input, $0.03 cache hit, $1.25 output
  "claude-haiku-3": {
    displayName: "Claude 3 Haiku",
    provider: "anthropic",
    inputPerMillion: 0.25,
    cachedInputPerMillion: 0.03,
    outputPerMillion: 1.25,
  },
};

// ---------------------------------------------------------------------------
// OpenAI rate card
// Source: https://developers.openai.com/api/docs/pricing
// ---------------------------------------------------------------------------

const openaiRates: Record<string, RateCardEntry> = {
  // GPT-5.4 — $2.50 input, $0.25 cached, $15.00 output
  "gpt-5.4": {
    displayName: "GPT-5.4",
    provider: "openai",
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15,
  },

  // GPT-5.4 Mini — $0.75 input, $0.075 cached, $4.50 output
  "gpt-5.4-mini": {
    displayName: "GPT-5.4 Mini",
    provider: "openai",
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 4.5,
  },

  // GPT-5.4 Nano — $0.20 input, $0.02 cached, $1.25 output
  "gpt-5.4-nano": {
    displayName: "GPT-5.4 Nano",
    provider: "openai",
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.25,
  },

  // GPT-5.4 Pro — $30 input, no caching, $180 output
  "gpt-5.4-pro": {
    displayName: "GPT-5.4 Pro",
    provider: "openai",
    inputPerMillion: 30,
    cachedInputPerMillion: 30, // no cache discount listed
    outputPerMillion: 180,
  },

  // GPT-4.1 — $2.00 input, $0.50 cached, $8.00 output
  "gpt-4.1": {
    displayName: "GPT-4.1",
    provider: "openai",
    inputPerMillion: 2,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 8,
  },

  // GPT-5.3 Codex — $1.75 input, $0.175 cached, $14.00 output
  "gpt-5.3-codex": {
    displayName: "GPT-5.3 Codex",
    provider: "openai",
    inputPerMillion: 1.75,
    cachedInputPerMillion: 0.175,
    outputPerMillion: 14,
  },

  // GPT-5.3 Chat — $1.75 input, $0.175 cached, $14.00 output
  "gpt-5.3-chat-latest": {
    displayName: "GPT-5.3 Chat",
    provider: "openai",
    inputPerMillion: 1.75,
    cachedInputPerMillion: 0.175,
    outputPerMillion: 14,
  },
};

// ---------------------------------------------------------------------------
// Combined rate card
// ---------------------------------------------------------------------------

/** All published rates, keyed by model slug */
export const RATE_CARD: Record<string, RateCardEntry> = {
  ...anthropicRates,
  ...openaiRates,
};

// ---------------------------------------------------------------------------
// Alias map — OpenClaw model strings → rate card keys
// ---------------------------------------------------------------------------
// OpenClaw's model IDs don't always match provider canonical names.
// This map handles versioned strings, dated suffixes, friendly names,
// and other variants that resolve to the same pricing tier.
//
// Aliases are checked BEFORE substring matching, so they take priority.
// Add new aliases here when OpenClaw introduces new model string formats.

const MODEL_ALIASES: Record<string, string> = {
  // -----------------------------------------------------------------------
  // Anthropic — dated / versioned strings from OpenClaw's models.list
  // -----------------------------------------------------------------------
  "claude-opus-4-6-20260327": "claude-opus-4-6",
  "claude-opus-4-5-20250620": "claude-opus-4-5",
  "claude-opus-4-1-20250527": "claude-opus-4-1",
  "claude-opus-4-20250514": "claude-opus-4",
  "claude-sonnet-4-6-20260327": "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250620": "claude-sonnet-4-5",
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  "claude-3-5-haiku-20241022": "claude-haiku-3-5",
  "claude-3-5-sonnet-20241022": "claude-sonnet-4",  // maps to Sonnet 4 tier
  "claude-3-5-sonnet-20240620": "claude-sonnet-4",
  "claude-3-haiku-20240307": "claude-haiku-3",

  // Anthropic — friendly / shorthand names OpenClaw might use
  "claude-sonnet": "claude-sonnet-4-6",
  "claude-haiku": "claude-haiku-4-5",
  "claude-opus": "claude-opus-4-6",
  "sonnet-4": "claude-sonnet-4",
  "sonnet-4.5": "claude-sonnet-4-5",
  "sonnet-4.6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5",
  "opus-4": "claude-opus-4",
  "opus-4.1": "claude-opus-4-1",
  "opus-4.5": "claude-opus-4-5",
  "opus-4.6": "claude-opus-4-6",

  // -----------------------------------------------------------------------
  // OpenAI — versioned / variant strings
  // -----------------------------------------------------------------------
  "gpt-5.3": "gpt-5.3-codex",
  "gpt-5.3-chat": "gpt-5.3-chat-latest",
  "gpt5.4": "gpt-5.4",
  "gpt5.4-mini": "gpt-5.4-mini",
  "gpt5.4-nano": "gpt-5.4-nano",
  "gpt5.4-pro": "gpt-5.4-pro",
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up the rate for a full model string (e.g. "anthropic/claude-sonnet-4-6").
 *
 * Strategy:
 *  1. Local / Ollama → $0
 *  2. Strip provider prefix, check alias map
 *  3. Exact key match in RATE_CARD
 *  4. Substring match against rate card keys (longest match wins)
 *  5. Fallback keyword match (opus/sonnet/haiku/gpt-4o)
 *  6. Unknown → null (cost shows as $0, honestly labeled)
 *
 * This is intentionally generous with matching — we're producing estimates,
 * and "close enough to the right pricing tier" is better than $0.
 */
export function lookupRate(modelString: string): RateCardEntry | null {
  const lower = modelString.toLowerCase().trim();

  // 1. Local / Ollama models are always free
  if (lower.includes("ollama") || lower.startsWith("local")) {
    return {
      displayName: "Local Model",
      provider: "ollama",
      inputPerMillion: 0,
      cachedInputPerMillion: 0,
      outputPerMillion: 0,
    };
  }

  // Strip provider prefix (e.g. "anthropic/" or "openai/")
  const stripped = lower.replace(/^(anthropic|openai)\//, "");

  // 2. Alias map — handles versioned/dated strings
  const aliasKey = MODEL_ALIASES[stripped];
  if (aliasKey && RATE_CARD[aliasKey]) return RATE_CARD[aliasKey];

  // 3. Exact match in rate card
  if (RATE_CARD[stripped]) return RATE_CARD[stripped];

  // 4. Substring match — longest rate card key found in the string wins
  //    e.g. "claude-haiku-4-5-20251001" contains "claude-haiku-4-5" (len 16)
  //    AND "claude-haiku-3-5" would NOT match, so longest wins correctly.
  let bestMatch: RateCardEntry | null = null;
  let bestLen = 0;

  for (const [key, entry] of Object.entries(RATE_CARD)) {
    if (stripped.includes(key) && key.length > bestLen) {
      bestMatch = entry;
      bestLen = key.length;
    }
  }

  if (bestMatch) return bestMatch;

  // 5. Fallback keyword matching — last resort for unusual strings
  //    Order matters: more specific patterns first (gpt-5.4-nano before gpt-5.4)
  const fallbackPatterns: Array<{ match: string; key: string }> = [
    { match: "opus", key: "claude-opus-4-6" },
    { match: "sonnet", key: "claude-sonnet-4-6" },
    { match: "haiku", key: "claude-haiku-4-5" },
    { match: "gpt-5.4-pro", key: "gpt-5.4-pro" },
    { match: "gpt-5.4-nano", key: "gpt-5.4-nano" },
    { match: "gpt-5.4-mini", key: "gpt-5.4-mini" },
    { match: "gpt-5.4", key: "gpt-5.4" },
    { match: "gpt-5.3", key: "gpt-5.3-codex" },
  ];

  for (const { match, key } of fallbackPatterns) {
    if (lower.includes(match)) return RATE_CARD[key];
  }

  // 6. Unknown model — return null, don't fabricate
  return null;
}

/**
 * Check if a model string resolves to a known rate.
 * UI can use this to show "unknown model — estimate unavailable" warnings.
 */
export function hasKnownRate(modelString: string): boolean {
  return lookupRate(modelString) !== null;
}

/**
 * Get the cost for a given number of tokens at the given model's rate.
 *
 * Returns { inputCost, cachedInputCost, outputCost, total } in USD.
 */
export function calculateTokenCost(
  modelString: string,
  tokens: {
    input: number;
    cachedInput?: number;
    output: number;
  }
): { inputCost: number; cachedInputCost: number; outputCost: number; total: number } {
  const rate = lookupRate(modelString);
  if (!rate) {
    return { inputCost: 0, cachedInputCost: 0, outputCost: 0, total: 0 };
  }

  // Cached input tokens are a subset of input — they're charged at the
  // discounted rate, so we subtract them from the regular input count.
  const cachedInput = tokens.cachedInput ?? 0;
  const regularInput = Math.max(0, tokens.input - cachedInput);

  const inputCost = (regularInput / 1_000_000) * rate.inputPerMillion;
  const cachedInputCost = (cachedInput / 1_000_000) * rate.cachedInputPerMillion;
  const outputCost = (tokens.output / 1_000_000) * rate.outputPerMillion;

  return {
    inputCost,
    cachedInputCost,
    outputCost,
    total: inputCost + cachedInputCost + outputCost,
  };
}

/**
 * Get the input+output rate for cost estimation (used by optimizer).
 * Returns { input, output } in $/million tokens.
 */
export function getModelRate(modelString: string): { input: number; output: number } {
  const rate = lookupRate(modelString);
  if (!rate) return { input: 0, output: 0 };
  return { input: rate.inputPerMillion, output: rate.outputPerMillion };
}

/**
 * List all models in the rate card for a given provider.
 */
export function listRatesForProvider(provider: "anthropic" | "openai"): Array<{ key: string; entry: RateCardEntry }> {
  return Object.entries(RATE_CARD)
    .filter(([, entry]) => entry.provider === provider)
    .map(([key, entry]) => ({ key, entry }));
}
