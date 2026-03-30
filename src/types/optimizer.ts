// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

export type FrequencyOption = "off" | "60m" | "30m" | "15m";
export type ContextLoadOption = "lean" | "standard" | "full";

export interface LeverValue {
  /** Full model string, e.g. "anthropic/claude-haiku-4-5-20251001" or "ollama/llama3.2:3b" */
  heartbeatModel: string;
  heartbeatFrequency: FrequencyOption;
  /** Full model string */
  defaultModel: string;
  /** Full model string */
  compactionModel: string;
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
  /** Static options for non-model select levers (frequency, context loading) */
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
