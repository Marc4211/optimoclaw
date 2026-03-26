export type ModelOption = "local-ollama" | "claude-haiku" | "claude-sonnet";
export type FrequencyOption = "off" | "60m" | "30m" | "15m";

export interface LeverValue {
  heartbeatModel: ModelOption;
  heartbeatFrequency: FrequencyOption;
  defaultModel: "claude-haiku" | "claude-sonnet";
  compactionModel: "local-ollama" | "claude-haiku";
  compactionThreshold: number; // 20000–200000
  subagentConcurrency: number; // 1–10
}

export interface LeverDefinition {
  key: keyof LeverValue;
  label: string;
  description: string;
  type: "select" | "slider";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (v: number) => string;
  configPath: string; // path in openclaw.json
}

export interface Preset {
  id: "lean" | "balanced" | "quality";
  label: string;
  description: string;
  values: LeverValue;
}

export interface CostEstimate {
  monthlyInput: number;
  monthlyOutput: number;
  total: number;
}

export interface ConfigDiff {
  field: string;
  label: string;
  from: string;
  to: string;
}
