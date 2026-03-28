export type Provider = "anthropic" | "openai" | "ollama";

export interface ModelRate {
  model: string;
  displayName: string;
  provider: Provider;
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Per-provider billing data */
export interface ProviderSpend {
  provider: Provider;
  source: "admin-api" | "manual" | "free";
  totalUsd: number;
  periodDays: number;
  monthlyEstimate: number;
  perModel?: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

export interface RatesConfig {
  source: "manual" | "api-key";
  provider?: Provider;
  models: ModelRate[];
  configuredAt: string; // ISO timestamp
  // Legacy single-provider spend — kept for backwards compatibility
  realSpend?: {
    totalUsd: number;
    periodDays: number;
    monthlyEstimate: number;
    perModel?: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
  // Multi-provider billing data
  providerSpend?: ProviderSpend[];
}

export interface ProviderInfo {
  id: Provider;
  name: string;
  dashboardUrl: string;
  keyPageUrl: string;
  instructions: string[];
  scopeGuidance: string;
}
