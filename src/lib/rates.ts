import { RatesConfig, ModelRate } from "@/types/rates";

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

