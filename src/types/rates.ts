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
}

export interface ProviderInfo {
  id: Provider;
  name: string;
  dashboardUrl: string;
  keyPageUrl: string;
  instructions: string[];
  scopeGuidance: string;
}
