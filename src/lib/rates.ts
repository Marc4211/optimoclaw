import { RatesConfig, ModelRate } from "@/types/rates";

const STORAGE_KEY = "optimoclaw-rates";

// --- Default published rates (March 2026) ---

export const defaultAnthropicRates: ModelRate[] = [
  {
    model: "claude-opus",
    displayName: "Claude Opus 4.6",
    provider: "anthropic",
    inputPerMillion: 5,
    outputPerMillion: 25,
  },
  {
    model: "claude-sonnet",
    displayName: "Claude Sonnet 4.6",
    provider: "anthropic",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    model: "claude-haiku",
    displayName: "Claude Haiku 4.5",
    provider: "anthropic",
    inputPerMillion: 1,
    outputPerMillion: 5,
  },
];

export const defaultOpenAIRates: ModelRate[] = [
  {
    model: "gpt-5.4",
    displayName: "GPT-5.4",
    provider: "openai",
    inputPerMillion: 2.5,
    outputPerMillion: 15,
  },
  {
    model: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    provider: "openai",
    inputPerMillion: 0.75,
    outputPerMillion: 4.5,
  },
  {
    model: "gpt-5.3-codex",
    displayName: "GPT-5.3 Codex",
    provider: "openai",
    inputPerMillion: 1.75,
    outputPerMillion: 14,
  },
];

export const allDefaultRates: ModelRate[] = [
  ...defaultAnthropicRates,
  ...defaultOpenAIRates,
];


// --- Provider definitions ---

import { ProviderInfo, Provider } from "@/types/rates";

export const providers: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    dashboardUrl: "console.anthropic.com",
    keyPageUrl: "https://console.anthropic.com/settings/admin-keys",
    instructions: [
      "Go to console.anthropic.com and sign in",
      "Navigate to Settings → Admin API Keys",
      "Create a new Admin key (not a standard API key)",
      "Copy the key — you won't be able to see it again",
    ],
    scopeGuidance:
      "Requires an Admin API key with billing read access. Standard API keys cannot access usage data.",
  },
  {
    id: "openai",
    name: "OpenAI",
    dashboardUrl: "platform.openai.com",
    keyPageUrl: "https://platform.openai.com/api-keys",
    instructions: [
      "Go to platform.openai.com and sign in",
      "Navigate to API Keys",
      "Create a new secret key",
      "Copy the key — you won't be able to see it again",
    ],
    scopeGuidance:
      "Requires a key with billing and usage read permissions.",
  },
];

export async function validateApiKey(
  provider: Provider,
  key: string
): Promise<{ success: boolean; error?: string }> {
  if (provider === "anthropic") {
    try {
      const res = await fetch("/api/anthropic-usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      if (res.ok) {
        return { success: true };
      }
      const data = await res.json().catch(() => ({}));
      return {
        success: false,
        error: data.error ?? "This doesn't look like an Admin key — check your Console and try again.",
      };
    } catch {
      return {
        success: false,
        error: "Failed to reach the Anthropic API. Check your network connection.",
      };
    }
  }
  return {
    success: false,
    error: "Billing API access is not yet available for this provider. Use manual rate entry instead.",
  };
}

// --- localStorage helpers ---

export function saveRatesConfig(config: RatesConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadRatesConfig(): RatesConfig | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as RatesConfig;
  } catch {
    return null;
  }
}

export function clearRatesConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// --- Rate lookup helper ---

export function getRateForModel(
  rates: ModelRate[],
  modelKey: string
): ModelRate | null {
  return rates.find((r) => r.model === modelKey) ?? null;
}

