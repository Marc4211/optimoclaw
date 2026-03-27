export type ModelOption = "local-ollama" | "claude-haiku" | "claude-sonnet" | "claude-opus";
export type FrequencyOption = "off" | "60m" | "30m" | "15m";
export type ContextLoadOption = "lean" | "standard" | "full";

export interface LeverValue {
  heartbeatModel: ModelOption;
  heartbeatFrequency: FrequencyOption;
  defaultModel: "claude-haiku" | "claude-sonnet" | "claude-opus";
  compactionModel: ModelOption;
  compactionThreshold: number; // 20000–200000
  subagentConcurrency: number; // 1–10
  sessionContextLoading: ContextLoadOption;
  memoryFileScope: number; // days: 1–30
  rateLimitDelay: number; // seconds: 1–15
  searchBatchLimit: number; // 1–20
}

export interface LeverDefinition {
  key: keyof LeverValue;
  label: string;
  description: string;
  impact: string;
  guidance: string;
  type: "select" | "slider";
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (v: number) => string;
  configPath: string; // path in openclaw.json
  /** If true, only show "Local Ollama" option when live config has an ollama model */
  localModelGuarded?: boolean;
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
