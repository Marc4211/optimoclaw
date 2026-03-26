import { RatesConfig, ModelRate, ProviderInfo } from "@/types/rates";

const STORAGE_KEY = "broadclaw-rates";

// --- Default published rates (March 2026) ---

export const defaultAnthropicRates: ModelRate[] = [
  {
    model: "claude-sonnet",
    displayName: "Claude Sonnet",
    provider: "anthropic",
    inputPerMillion: 3,
    outputPerMillion: 15,
  },
  {
    model: "claude-haiku",
    displayName: "Claude Haiku",
    provider: "anthropic",
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
  },
];

export const defaultOpenAIRates: ModelRate[] = [
  {
    model: "gpt-4o",
    displayName: "GPT-4o",
    provider: "openai",
    inputPerMillion: 2.5,
    outputPerMillion: 10,
  },
  {
    model: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    provider: "openai",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
];

export const allDefaultRates: ModelRate[] = [
  ...defaultAnthropicRates,
  ...defaultOpenAIRates,
];

// --- Provider info for API key flow ---

export const providers: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    dashboardUrl: "https://console.anthropic.com",
    keyPageUrl: "https://console.anthropic.com/settings/keys",
    instructions: [
      "Go to console.anthropic.com and sign in",
      "Click Settings in the left sidebar",
      "Click API Keys",
      "Click Create Key and name it something like \"BroadClaw read-only\"",
      "Copy the key and paste it below",
    ],
    scopeGuidance:
      "A standard API key is sufficient. BroadClaw only reads billing usage data — it never makes API calls on your behalf.",
  },
  {
    id: "openai",
    name: "OpenAI",
    dashboardUrl: "https://platform.openai.com",
    keyPageUrl: "https://platform.openai.com/api-keys",
    instructions: [
      "Go to platform.openai.com and sign in",
      "Click the gear icon (Settings) in the top right",
      "Navigate to API Keys",
      "Click Create new secret key",
      "Copy the key and paste it below",
    ],
    scopeGuidance:
      "If available, use a restricted key with read-only billing permissions. BroadClaw only needs to read your usage data.",
  },
];

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

// --- Simulated API key validation ---

export async function validateApiKey(
  provider: string,
  _key: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Replace with real API validation
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // For now, always fail gracefully to demonstrate the fallback flow
  return {
    success: false,
    error:
      "Billing API access is not yet available. Use manual rate entry instead.",
  };
}
