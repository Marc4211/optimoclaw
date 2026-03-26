export type Provider = "anthropic" | "openai";

export interface ModelRate {
  model: string;
  displayName: string;
  provider: Provider;
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface RatesConfig {
  source: "manual" | "api-key";
  provider?: Provider;
  models: ModelRate[];
  configuredAt: string; // ISO timestamp
  // Admin API spend data — present when source is "api-key"
  realSpend?: {
    totalUsd: number; // actual spend from cost report
    periodDays: number; // how many days the spend covers
    monthlyEstimate: number; // totalUsd / periodDays * 30
  };
}

export interface ProviderInfo {
  id: Provider;
  name: string;
  dashboardUrl: string;
  keyPageUrl: string;
  instructions: string[];
  scopeGuidance: string;
}
