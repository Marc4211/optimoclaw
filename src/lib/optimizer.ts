import {
  LeverDefinition,
  LeverValue,
  Preset,
  CostEstimate,
  ConfigDiff,
  ModelOption,
  FrequencyOption,
  ContextLoadOption,
} from "@/types/optimizer";
import { ModelRate } from "@/types/rates";
import { getRateForModel } from "@/lib/rates";

// --- Lever definitions ---
// Copy sourced from LEVER_COPY.md — description, impact, guidance verbatim.

export const levers: LeverDefinition[] = [
  {
    key: "heartbeatModel",
    label: "Heartbeat Model",
    description:
      "The model your agents use for routine check-ins. Heartbeats run frequently and don't need to be smart — they just check task queues and surface alerts.",
    impact:
      "One of the highest single-lever cost wins available. A local or cheap model here can save $5–15/month depending on frequency.",
    guidance:
      "Use a local or lightweight model almost always. Only bump this up if your heartbeat logic is complex or makes real judgment calls.",
    type: "select",
    options: [
      { value: "local-ollama", label: "Local Ollama" },
      { value: "claude-haiku", label: "Claude Haiku" },
      { value: "claude-sonnet", label: "Claude Sonnet" },
    ],
    configPath: "agents.defaults.heartbeat.model",
    localModelGuarded: true,
  },
  {
    key: "heartbeatFrequency",
    label: "Heartbeat Frequency",
    description:
      "How often agents check in. More frequent means faster response to completed tasks and blockers. Less frequent means lower cost and fewer interruptions.",
    impact:
      "Direct multiplier on heartbeat cost. Cutting frequency in half roughly halves heartbeat spend.",
    guidance:
      "30 minutes is the sweet spot for most setups. Go lower if you have time-sensitive workflows. Go higher if cost is a priority and your work isn't urgent.",
    type: "select",
    options: [
      { value: "off", label: "Off" },
      { value: "60m", label: "Every 60 min" },
      { value: "30m", label: "Every 30 min" },
      { value: "15m", label: "Every 15 min" },
    ],
    configPath: "agents.defaults.heartbeat.every",
  },
  {
    key: "defaultModel",
    label: "Default Model",
    description:
      "The model used when no specific model is assigned to a task. Everything falls back to this.",
    impact:
      "This is your baseline cost driver. A heavier model costs more per call and adds latency but handles complexity better. A lighter model is fast and cheap but may miss nuance on harder tasks.",
    guidance:
      "Sonnet is a good default for most setups. Consider Haiku if most of your agent work is routine. Reserve Opus for specific tasks, not as a default.",
    type: "select",
    options: [
      { value: "claude-haiku", label: "Claude Haiku" },
      { value: "claude-sonnet", label: "Claude Sonnet" },
    ],
    configPath: "agents.defaults.model.primary",
  },
  {
    key: "compactionThreshold",
    label: "Compaction Threshold",
    description:
      "How much conversation history accumulates before it gets compressed. Controls when the system summarizes old context to free up space.",
    impact:
      "Lower threshold = more aggressive compaction = smaller context window = lower cost. Higher threshold = more history preserved = richer context = higher cost.",
    guidance:
      "If your agents seem to forget things mid-session, raise this. If costs are high and context quality isn't a concern, lower it.",
    type: "slider",
    min: 20000,
    max: 200000,
    step: 10000,
    formatValue: (v: number) => `${(v / 1000).toFixed(0)}k tokens`,
    configPath: "agents.defaults.compaction.threshold",
  },
  {
    key: "compactionModel",
    label: "Compaction Model",
    description:
      "The model used to compress conversation history into summaries. Runs periodically in the background, not on every message.",
    impact:
      "Doesn't need to be your best model — it just needs to summarize accurately. Using a lighter model here saves money without meaningfully affecting quality.",
    guidance:
      "A mid-tier model is usually the right call. Haiku or a local model works well for most setups.",
    type: "select",
    options: [
      { value: "local-ollama", label: "Local Ollama" },
      { value: "claude-haiku", label: "Claude Haiku" },
    ],
    configPath: "agents.defaults.compaction.model",
    localModelGuarded: true,
  },
  {
    key: "subagentConcurrency",
    label: "Subagent Concurrency",
    description:
      "How many subagents can run at the same time. Higher means faster parallel work. Lower means sequential, predictable execution.",
    impact:
      "Higher concurrency increases speed but also increases simultaneous API calls and can cause cost spikes or rate limit errors.",
    guidance:
      "Raise this for research-heavy or multi-step parallel workflows. Lower it if you're hitting rate limits or seeing unexpected cost spikes.",
    type: "slider",
    min: 1,
    max: 10,
    step: 1,
    formatValue: (v: number) => `${v} agent${v === 1 ? "" : "s"}`,
    configPath: "agents.defaults.subagents.maxConcurrent",
  },
  {
    key: "sessionContextLoading",
    label: "Session Context Loading",
    description:
      "Which files are loaded into context at the start of every session. The more files loaded, the more tokens spent before a single message is processed.",
    impact:
      "One of the largest hidden cost drivers in OpenClaw. Loading everything (full memory, session history, all prior tool outputs) can 3–5x your input token cost per call versus lean loading.",
    guidance:
      "Lean loading (identity, soul, today's memory file only) works for most sessions. Full loading is only needed when an agent needs deep historical context to make decisions.",
    type: "select",
    options: [
      { value: "lean", label: "Lean" },
      { value: "standard", label: "Standard" },
      { value: "full", label: "Full" },
    ],
    configPath: "agents.defaults.sessionContextLoading",
  },
  {
    key: "memoryFileScope",
    label: "Memory File Scope",
    description:
      "How many days of daily memory files get loaded into context each session. Agents write memory logs daily — loading a year of history costs significantly more than loading the last week.",
    impact:
      "Direct multiplier on input token cost for any agent that uses daily memory files. Most sessions only need recent context — older files rarely change decisions.",
    guidance:
      "7 days is a good default. Go down to 3 days if cost is a priority. Go up to 30+ days only for agents that need to reference historical decisions regularly.",
    type: "slider",
    min: 1,
    max: 30,
    step: 1,
    formatValue: (v: number) => `${v} day${v === 1 ? "" : "s"}`,
    configPath: "agents.defaults.memoryFileScope",
  },
  {
    key: "rateLimitDelay",
    label: "Rate Limit Delay",
    description:
      "The minimum time between consecutive API calls. A small buffer prevents burst usage that can trigger provider rate limits and cause errors.",
    impact:
      "Too low and you risk rate limit errors that stall workflows. Too high and agents feel sluggish on fast tasks.",
    guidance:
      "5 seconds between calls is a safe default. Reduce to 2–3 seconds if your workflows are time-sensitive and you have a higher-tier API plan. Increase if you're hitting 429 errors.",
    type: "slider",
    min: 1,
    max: 15,
    step: 1,
    formatValue: (v: number) => `${v} sec${v === 1 ? "" : "s"}`,
    configPath: "agents.defaults.rateLimitDelay",
  },
  {
    key: "searchBatchLimit",
    label: "Search Batch Limit",
    description:
      "The maximum number of web searches an agent can run before taking a short break. Prevents runaway search loops that inflate costs.",
    impact:
      "Uncapped search is one of the easiest ways to accidentally run up a bill. A batch limit adds a natural brake.",
    guidance:
      "5 searches per batch with a 2-minute cooldown works well for most research tasks. Lower this if you want tighter cost control.",
    type: "slider",
    min: 1,
    max: 20,
    step: 1,
    formatValue: (v: number) => `${v} search${v === 1 ? "" : "es"}`,
    configPath: "agents.defaults.searchBatchLimit",
  },
];

// --- Mock current config (simulates reading from gateway) ---

export const mockCurrentConfig: LeverValue = {
  heartbeatModel: "claude-sonnet",
  heartbeatFrequency: "30m",
  defaultModel: "claude-sonnet",
  compactionModel: "claude-haiku",
  compactionThreshold: 100000,
  subagentConcurrency: 5,
  sessionContextLoading: "standard",
  memoryFileScope: 7,
  rateLimitDelay: 5,
  searchBatchLimit: 5,
};

// --- Preset profiles (aligned with LEVER_COPY.md spec table) ---

export const presets: Preset[] = [
  {
    id: "lean",
    label: "Lean",
    description: "Minimize cost",
    values: {
      heartbeatModel: "local-ollama",
      heartbeatFrequency: "60m",
      defaultModel: "claude-haiku",
      compactionModel: "local-ollama",
      compactionThreshold: 50000,
      subagentConcurrency: 1,
      sessionContextLoading: "lean",
      memoryFileScope: 3,
      rateLimitDelay: 8,
      searchBatchLimit: 3,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Cost and quality",
    values: {
      heartbeatModel: "claude-haiku",
      heartbeatFrequency: "30m",
      defaultModel: "claude-sonnet",
      compactionModel: "claude-haiku",
      compactionThreshold: 100000,
      subagentConcurrency: 2,
      sessionContextLoading: "standard",
      memoryFileScope: 7,
      rateLimitDelay: 5,
      searchBatchLimit: 5,
    },
  },
  {
    id: "quality",
    label: "Quality",
    description: "Maximize capability",
    values: {
      heartbeatModel: "claude-sonnet",
      heartbeatFrequency: "15m",
      defaultModel: "claude-sonnet",
      compactionModel: "claude-haiku",
      compactionThreshold: 150000,
      subagentConcurrency: 4,
      sessionContextLoading: "full",
      memoryFileScope: 30,
      rateLimitDelay: 2,
      searchBatchLimit: 10,
    },
  },
];

// --- Local model detection ---

/**
 * Check if the live gateway config or snapshot contains a local/ollama model.
 * Used to gate the "Local Ollama" option — only show it if the user
 * has already configured one. Never offer it speculatively.
 *
 * Checks the full JSON string for any occurrence of "ollama" — this catches
 * model strings like "ollama/llama3.2:3b" in any position in the config.
 */
export function configHasLocalModel(
  configJson?: Record<string, unknown>,
  snapshot?: Record<string, unknown>
): boolean {
  // Check the config itself
  if (configJson) {
    const json = JSON.stringify(configJson).toLowerCase();
    if (json.includes("ollama") || json.includes("local-ollama")) return true;
  }
  // Also check the raw snapshot — the config extraction may not capture
  // all model references (e.g. per-agent overrides, fallback models)
  if (snapshot) {
    const json = JSON.stringify(snapshot).toLowerCase();
    if (json.includes("ollama")) return true;
  }
  return false;
}

/**
 * Filter lever options based on whether a local model exists in the config.
 * For localModelGuarded levers, removes the "local-ollama" option if no
 * local model is detected, preventing users from selecting a non-existent model.
 */
export function getFilteredOptions(
  lever: LeverDefinition,
  hasLocalModel: boolean
): { value: string; label: string }[] | undefined {
  if (!lever.options) return undefined;
  if (!lever.localModelGuarded || hasLocalModel) return lever.options;
  return lever.options.filter((o) => o.value !== "local-ollama");
}

// --- Cost calculation ---

// Default prices per million tokens (used when no custom rates provided)
const DEFAULT_MODEL_COSTS: Record<ModelOption, { input: number; output: number }> = {
  "local-ollama": { input: 0, output: 0 },
  "claude-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet": { input: 3, output: 15 },
};

const FREQUENCY_MULTIPLIER: Record<FrequencyOption, number> = {
  off: 0,
  "60m": 24,
  "30m": 48,
  "15m": 96,
};

const CONTEXT_LOAD_MULTIPLIER: Record<ContextLoadOption, number> = {
  lean: 1,
  standard: 2,
  full: 4,
};

// Estimated tokens per operation
const HEARTBEAT_TOKENS = 2000;
const SESSION_TOKENS_PER_DAY = 50000;
const COMPACTION_TOKENS = 10000;
const MEMORY_TOKENS_PER_DAY = 3000; // ~3k tokens per day of memory files

function getModelCost(
  modelKey: ModelOption,
  customRates?: ModelRate[]
): { input: number; output: number } {
  if (modelKey === "local-ollama") return { input: 0, output: 0 };
  if (customRates) {
    const rate = getRateForModel(customRates, modelKey);
    if (rate) {
      return { input: rate.inputPerMillion, output: rate.outputPerMillion };
    }
  }
  return DEFAULT_MODEL_COSTS[modelKey];
}

/**
 * Calculate relative cost for a lever configuration.
 *
 * When realBaselineMonthly is provided (from Admin API spend data),
 * we anchor the calculation: the base config = realBaselineMonthly,
 * and we compute deltas as proportional changes from that baseline.
 *
 * Without a baseline, we use the theoretical model.
 */
export function calculateCost(
  values: LeverValue,
  customRates?: ModelRate[],
  options?: { agentCount?: number; realBaselineMonthly?: number; baseValues?: LeverValue }
): CostEstimate {
  const agentCount = options?.agentCount ?? 5;
  const rawCost = calculateRawCost(values, customRates, agentCount);

  // If we have real baseline spend, anchor to it
  if (options?.realBaselineMonthly && options?.baseValues) {
    const baseCost = calculateRawCost(options.baseValues, customRates, agentCount);
    if (baseCost.total > 0) {
      // Scale: if raw model says base = $50 and real = $111,
      // then scale factor = 111/50 = 2.22x
      // projected config raw = $40 → projected real = $40 * 2.22 = $88.80
      const scaleFactor = options.realBaselineMonthly / baseCost.total;
      return {
        monthlyInput: rawCost.monthlyInput * scaleFactor,
        monthlyOutput: rawCost.monthlyOutput * scaleFactor,
        total: rawCost.total * scaleFactor,
      };
    }
  }

  return rawCost;
}

function calculateRawCost(
  values: LeverValue,
  customRates: ModelRate[] | undefined,
  agentCount: number
): CostEstimate {
  let dailyInput = 0;
  let dailyOutput = 0;

  // Heartbeat cost: frequency × agents × tokens per beat
  const beatsPerDay = FREQUENCY_MULTIPLIER[values.heartbeatFrequency];
  const hbModel = getModelCost(values.heartbeatModel, customRates);
  dailyInput += beatsPerDay * agentCount * HEARTBEAT_TOKENS * hbModel.input / 1_000_000;
  dailyOutput += beatsPerDay * agentCount * (HEARTBEAT_TOKENS * 0.3) * hbModel.output / 1_000_000;

  // Session cost: concurrency × daily tokens × context load multiplier
  const sessionModel = getModelCost(values.defaultModel, customRates);
  const contextMultiplier = CONTEXT_LOAD_MULTIPLIER[values.sessionContextLoading];
  const dailySessionTokens = SESSION_TOKENS_PER_DAY * values.subagentConcurrency * contextMultiplier;
  dailyInput += dailySessionTokens * sessionModel.input / 1_000_000;
  dailyOutput += (dailySessionTokens * 0.2) * sessionModel.output / 1_000_000;

  // Compaction cost: more compaction at lower thresholds
  const compactionsPerDay = Math.max(1, Math.round(200000 / values.compactionThreshold));
  const compModel = getModelCost(values.compactionModel, customRates);
  dailyInput += compactionsPerDay * agentCount * COMPACTION_TOKENS * compModel.input / 1_000_000;
  dailyOutput += compactionsPerDay * agentCount * (COMPACTION_TOKENS * 0.5) * compModel.output / 1_000_000;

  // Memory file scope cost: more days loaded = more input tokens per session
  const memoryTokens = values.memoryFileScope * MEMORY_TOKENS_PER_DAY * agentCount;
  dailyInput += memoryTokens * sessionModel.input / 1_000_000;

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
  heartbeatFrequency: (v) => ({ off: "Off", "60m": "Every 60 min", "30m": "Every 30 min", "15m": "Every 15 min" }[v] ?? v),
  defaultModel: (v) => ({ "claude-haiku": "Claude Haiku", "claude-sonnet": "Claude Sonnet" }[v] ?? v),
  compactionModel: (v) => ({ "local-ollama": "Local Ollama", "claude-haiku": "Claude Haiku" }[v] ?? v),
  compactionThreshold: (v) => `${(Number(v) / 1000).toFixed(0)}k tokens`,
  subagentConcurrency: (v) => `${v} agent${Number(v) === 1 ? "" : "s"}`,
  sessionContextLoading: (v) => ({ lean: "Lean", standard: "Standard", full: "Full" }[v] ?? v),
  memoryFileScope: (v) => `${v} day${Number(v) === 1 ? "" : "s"}`,
  rateLimitDelay: (v) => `${v} sec${Number(v) === 1 ? "" : "s"}`,
  searchBatchLimit: (v) => `${v} search${Number(v) === 1 ? "" : "es"}`,
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
