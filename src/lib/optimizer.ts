import {
  LeverDefinition,
  LeverValue,
  Preset,
  CostEstimate,
  ConfigDiff,
  ModelOption,
  FrequencyOption,
} from "@/types/optimizer";

// --- Lever definitions ---

export const levers: LeverDefinition[] = [
  {
    key: "heartbeatModel",
    label: "Heartbeat Model",
    description:
      "Which model handles agent heartbeat checks. Local Ollama is free, but less capable. This is typically the biggest cost lever.",
    type: "select",
    options: [
      { value: "local-ollama", label: "Local Ollama" },
      { value: "claude-haiku", label: "Claude Haiku" },
      { value: "claude-sonnet", label: "Claude Sonnet" },
    ],
    configPath: "heartbeat.model",
  },
  {
    key: "heartbeatFrequency",
    label: "Heartbeat Frequency",
    description:
      "How often each agent polls the gateway. Less frequent = lower cost, but slower to detect issues.",
    type: "select",
    options: [
      { value: "off", label: "Off" },
      { value: "60min", label: "Every 60 min" },
      { value: "30min", label: "Every 30 min" },
      { value: "15min", label: "Every 15 min" },
    ],
    configPath: "heartbeat.interval",
  },
  {
    key: "defaultModel",
    label: "Default Session Model",
    description:
      "The default model for new agent sessions. Haiku is cheaper and faster; Sonnet is more capable.",
    type: "select",
    options: [
      { value: "claude-haiku", label: "Claude Haiku" },
      { value: "claude-sonnet", label: "Claude Sonnet" },
    ],
    configPath: "defaults.model",
  },
  {
    key: "compactionModel",
    label: "Compaction Model",
    description:
      "Which model summarizes conversation history when context gets long. Local is free but lower quality.",
    type: "select",
    options: [
      { value: "local-ollama", label: "Local Ollama" },
      { value: "claude-haiku", label: "Claude Haiku" },
    ],
    configPath: "compaction.model",
  },
  {
    key: "compactionThreshold",
    label: "Compaction Threshold",
    description:
      "Token count at which conversation history gets summarized. Lower = more frequent compaction, saves tokens long-term but costs more short-term.",
    type: "slider",
    min: 20000,
    max: 200000,
    step: 10000,
    formatValue: (v: number) => `${(v / 1000).toFixed(0)}k tokens`,
    configPath: "compaction.threshold",
  },
  {
    key: "subagentConcurrency",
    label: "Subagent Concurrency",
    description:
      "Maximum number of subagents that can run simultaneously. More concurrency = faster execution but higher peak cost.",
    type: "slider",
    min: 1,
    max: 10,
    step: 1,
    formatValue: (v: number) => `${v} agent${v === 1 ? "" : "s"}`,
    configPath: "subagents.maxConcurrent",
  },
];

// --- Mock current config (simulates reading from gateway) ---

export const mockCurrentConfig: LeverValue = {
  heartbeatModel: "claude-sonnet",
  heartbeatFrequency: "30min",
  defaultModel: "claude-sonnet",
  compactionModel: "claude-haiku",
  compactionThreshold: 100000,
  subagentConcurrency: 5,
};

// --- Preset profiles ---

export const presets: Preset[] = [
  {
    id: "lean",
    label: "Lean",
    description: "Minimize cost",
    values: {
      heartbeatModel: "local-ollama",
      heartbeatFrequency: "60min",
      defaultModel: "claude-haiku",
      compactionModel: "local-ollama",
      compactionThreshold: 50000,
      subagentConcurrency: 2,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Cost and quality",
    values: {
      heartbeatModel: "claude-haiku",
      heartbeatFrequency: "30min",
      defaultModel: "claude-haiku",
      compactionModel: "claude-haiku",
      compactionThreshold: 100000,
      subagentConcurrency: 4,
    },
  },
  {
    id: "quality",
    label: "Quality",
    description: "Maximize capability",
    values: {
      heartbeatModel: "claude-sonnet",
      heartbeatFrequency: "15min",
      defaultModel: "claude-sonnet",
      compactionModel: "claude-haiku",
      compactionThreshold: 150000,
      subagentConcurrency: 8,
    },
  },
];

// --- Cost calculation ---

// Prices per million tokens
const MODEL_COSTS: Record<ModelOption, { input: number; output: number }> = {
  "local-ollama": { input: 0, output: 0 },
  "claude-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet": { input: 3, output: 15 },
};

const FREQUENCY_MULTIPLIER: Record<FrequencyOption, number> = {
  off: 0,
  "60min": 24,
  "30min": 48,
  "15min": 96,
};

// Estimated tokens per operation
const HEARTBEAT_TOKENS = 2000; // ~2k tokens per heartbeat check
const SESSION_TOKENS_PER_DAY = 50000; // ~50k tokens per active session per day
const COMPACTION_TOKENS = 10000; // ~10k tokens per compaction

export function calculateCost(values: LeverValue): CostEstimate {
  const agentCount = 5; // assume 5 agents (matches mock data)
  let dailyInput = 0;
  let dailyOutput = 0;

  // Heartbeat cost: frequency × agents × tokens per beat
  const beatsPerDay = FREQUENCY_MULTIPLIER[values.heartbeatFrequency];
  const hbModel = MODEL_COSTS[values.heartbeatModel];
  dailyInput += beatsPerDay * agentCount * HEARTBEAT_TOKENS * hbModel.input / 1_000_000;
  dailyOutput += beatsPerDay * agentCount * (HEARTBEAT_TOKENS * 0.3) * hbModel.output / 1_000_000;

  // Session cost: concurrency × daily tokens
  const sessionModel = MODEL_COSTS[values.defaultModel];
  const dailySessionTokens = SESSION_TOKENS_PER_DAY * values.subagentConcurrency;
  dailyInput += dailySessionTokens * sessionModel.input / 1_000_000;
  dailyOutput += (dailySessionTokens * 0.2) * sessionModel.output / 1_000_000;

  // Compaction cost: more compaction at lower thresholds
  const compactionsPerDay = Math.max(1, Math.round(200000 / values.compactionThreshold));
  const compModel = MODEL_COSTS[values.compactionModel];
  dailyInput += compactionsPerDay * agentCount * COMPACTION_TOKENS * compModel.input / 1_000_000;
  dailyOutput += compactionsPerDay * agentCount * (COMPACTION_TOKENS * 0.5) * compModel.output / 1_000_000;

  const monthlyInput = dailyInput * 30;
  const monthlyOutput = dailyOutput * 30;

  return {
    monthlyInput,
    monthlyOutput,
    total: monthlyInput + monthlyOutput,
  };
}

// --- Diff calculation ---

const DISPLAY_LABELS: Record<string, (v: string) => string> = {
  heartbeatModel: (v) => ({ "local-ollama": "Local Ollama", "claude-haiku": "Claude Haiku", "claude-sonnet": "Claude Sonnet" }[v] ?? v),
  heartbeatFrequency: (v) => ({ off: "Off", "60min": "Every 60 min", "30min": "Every 30 min", "15min": "Every 15 min" }[v] ?? v),
  defaultModel: (v) => ({ "claude-haiku": "Claude Haiku", "claude-sonnet": "Claude Sonnet" }[v] ?? v),
  compactionModel: (v) => ({ "local-ollama": "Local Ollama", "claude-haiku": "Claude Haiku" }[v] ?? v),
  compactionThreshold: (v) => `${(Number(v) / 1000).toFixed(0)}k tokens`,
  subagentConcurrency: (v) => `${v} agent${Number(v) === 1 ? "" : "s"}`,
};

export function calculateDiff(
  original: LeverValue,
  current: LeverValue
): ConfigDiff[] {
  const diffs: ConfigDiff[] = [];

  for (const lever of levers) {
    const key = lever.key;
    const from = String(original[key]);
    const to = String(current[key]);
    if (from !== to) {
      const fmt = DISPLAY_LABELS[key] ?? ((v: string) => v);
      diffs.push({
        field: lever.configPath,
        label: lever.label,
        from: fmt(from),
        to: fmt(to),
      });
    }
  }

  return diffs;
}

export function formatCost(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 0.01) return "$0.00";
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${abs.toFixed(2)}`;
}
