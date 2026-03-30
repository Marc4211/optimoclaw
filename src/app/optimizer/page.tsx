"use client";

import { Suspense, useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, Plug } from "lucide-react";
import { LeverValue, ContextLoadOption } from "@/types/optimizer";
import { OpenClawConfig } from "@/types";
import {
  levers,
  fallbackDefaults,
  presets,
  presetOverrides,
  sections,
  tuneModes,
  TuneMode,
  calculateCost,
  calculateDiff,
  getFilteredOptions,
} from "@/lib/optimizer";
import { useGateway } from "@/contexts/GatewayContext";
import LeverCard from "@/components/optimizer/LeverCard";
import CostSummary, { ModelTokenUsage } from "@/components/optimizer/CostSummary";
import ContextUtilizationChart, { ContextUtilizationData } from "@/components/optimizer/ContextUtilizationChart";
import CacheEfficiencyChart, { CacheBreakdownData } from "@/components/optimizer/CacheEfficiencyChart";
import PresetSelector from "@/components/optimizer/PresetSelector";
import AgentSelector from "@/components/optimizer/AgentSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";
import { RolloutTarget } from "@/components/optimizer/DiffPreview";
import StickyApplyBar from "@/components/optimizer/StickyApplyBar";

// --- Config extraction helpers ---

function extractLeverValues(config: OpenClawConfig): LeverValue {
  const defaults = config?.agents?.defaults;
  return {
    // Model values are full strings from the gateway (e.g. "anthropic/claude-haiku-4-5-20251001")
    heartbeatModel: defaults?.heartbeat?.model ?? fallbackDefaults.heartbeatModel,
    heartbeatFrequency: mapFrequency(defaults?.heartbeat?.every) ?? fallbackDefaults.heartbeatFrequency,
    defaultModel: defaults?.model?.primary ?? fallbackDefaults.defaultModel,
    compactionModel: defaults?.compaction?.model ?? fallbackDefaults.compactionModel,
    compactionThreshold: fallbackDefaults.compactionThreshold,
    subagentConcurrency: defaults?.subagents?.maxConcurrent ?? fallbackDefaults.subagentConcurrency,
    sessionContextLoading: mapContextLoad((config as Record<string, unknown>)?.sessionContextLoading as string) ?? fallbackDefaults.sessionContextLoading,
    memoryFileScope: ((config as Record<string, unknown>)?.memoryFileScope as number) ?? fallbackDefaults.memoryFileScope,
    rateLimitDelay: ((config as Record<string, unknown>)?.rateLimitDelay as number) ?? fallbackDefaults.rateLimitDelay,
    searchBatchLimit: ((config as Record<string, unknown>)?.searchBatchLimit as number) ?? fallbackDefaults.searchBatchLimit,
  };
}

function mapFrequency(every?: string): "off" | "60m" | "30m" | "15m" | undefined {
  if (!every) return undefined;
  const lower = every.toLowerCase();
  if (lower === "off" || lower === "none" || lower === "0" || lower === "disabled") return "off";
  if (lower === "15m" || lower === "15min") return "15m";
  if (lower === "30m" || lower === "30min") return "30m";
  if (lower === "60m" || lower === "1h" || lower === "60min") return "60m";
  return undefined;
}

function mapContextLoad(v?: string): ContextLoadOption | undefined {
  if (!v) return undefined;
  const lower = v.toLowerCase();
  if (lower === "lean") return "lean";
  if (lower === "standard") return "standard";
  if (lower === "full") return "full";
  return undefined;
}

/**
 * Extract lever values for a specific agent, falling back to defaults.
 * Returns { values, inherited } where inherited tracks which levers
 * have no per-agent override (using the default value).
 */
function extractAgentLeverValues(
  config: OpenClawConfig,
  agentId: string
): { values: LeverValue; inherited: Set<string> } {
  const defaults = extractLeverValues(config);
  const agentEntry = config?.agents?.list?.find((a) => a.name === agentId);
  const inherited = new Set<string>();

  if (!agentEntry) {
    // No per-agent config — everything is inherited
    for (const lever of levers) inherited.add(lever.key);
    return { values: defaults, inherited };
  }

  const agent = agentEntry as Record<string, unknown>;
  const hb = agent.heartbeat as Record<string, unknown> | undefined;
  const agentValues = { ...defaults };

  // Per-agent model — full string passthrough
  if (agent.model) {
    agentValues.defaultModel = String(agent.model);
  } else {
    inherited.add("defaultModel");
  }

  // Per-agent heartbeat
  if (hb?.model) {
    agentValues.heartbeatModel = String(hb.model);
  } else {
    inherited.add("heartbeatModel");
  }

  if (hb?.every) {
    const f = mapFrequency(hb.every as string);
    if (f) agentValues.heartbeatFrequency = f;
  } else {
    inherited.add("heartbeatFrequency");
  }

  // Levers not typically overridden per-agent — mark as inherited
  for (const key of ["compactionModel", "compactionThreshold", "subagentConcurrency", "sessionContextLoading", "memoryFileScope", "rateLimitDelay", "searchBatchLimit"]) {
    if (!(key in agent)) inherited.add(key);
  }

  return { values: agentValues, inherited };
}

// --- Lever value → real OpenClaw config value mapping ---

/** Map OptimoClaw lever values to config values for openclaw config set.
 *  Model values are already full strings from the gateway — no mapping needed.
 *  Only frequency needs a small transform (off → disabled). */
function leverValueToConfig(key: string, value: string | number): string | number {
  if (key === "heartbeatFrequency") {
    const v = String(value);
    if (v === "off") return "disabled";
    return v;
  }
  // Model values and everything else pass through as-is
  return value;
}

// Model levers — only these get cost numbers (sourced from Admin API per-model spend)
const MODEL_LEVER_KEYS = new Set(["defaultModel", "heartbeatModel", "compactionModel"]);

// --- Page component ---

export default function OptimizerPage() {
  return (
    <Suspense>
      <OptimizerPageInner />
    </Suspense>
  );
}

function OptimizerPageInner() {
  const [loaded, setPageLoaded] = useState(false);
  useEffect(() => { setPageLoaded(true); }, []);
  const searchParams = useSearchParams();
  const agentFromUrl = searchParams.get("agent");
  const { client, connected, activeGateway, agents, availableModels } = useGateway();
  const [baseConfig, setBaseConfig] = useState<LeverValue>({ ...fallbackDefaults });
  // originalConfig: the config that generated the Actual spend — persisted to localStorage
  // so it survives reconnects and page remounts. Only reset when user explicitly clicks "Reset baseline".
  const [originalConfig, setOriginalConfigState] = useState<LeverValue | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("optimoclaw-original-config");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const setOriginalConfig = (config: LeverValue) => {
    setOriginalConfigState(config);
    try {
      localStorage.setItem("optimoclaw-original-config", JSON.stringify(config));
    } catch { /* non-critical */ }
  };
  const [values, setValues] = useState<LeverValue>({ ...fallbackDefaults });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [tuneMode, setTuneMode] = useState<TuneMode | null>(null);
  const [hasLosslessClaw, setHasLosslessClaw] = useState(false);
  // Billing setup removed — rate card is the primary cost source
  const [showTuneChooser, setShowTuneChooser] = useState(false);
  // Default to the default agent (isDefault: true from snapshot), not "Global defaults"
  const defaultAgentId = agents.find((a) => a.id === (client?.snapshot?.sessionDefaults as Record<string, unknown>)?.defaultAgentId)?.id
    ?? agents[0]?.id
    ?? null;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentInitialized, setAgentInitialized] = useState(false);
  const [inheritedLevers, setInheritedLevers] = useState<Set<string>>(new Set());
  const [lastConfig, setLastConfig] = useState<OpenClawConfig | null>(null);
  const [tokensByModel, setTokensByModel] = useState<ModelTokenUsage[]>([]);
  const [contextUtilization, setContextUtilization] = useState<ContextUtilizationData | null>(null);
  const [cacheBreakdown, setCacheBreakdown] = useState<CacheBreakdownData | null>(null);

  const agentCount = connected && agents.length > 0 ? agents.length : 1;

  // Initialize agent selector: prefer ?agent= URL param, fall back to default agent
  useEffect(() => {
    if (!agentInitialized && agents.length > 0) {
      const urlAgent = agentFromUrl
        ? agents.find((a) => a.name === agentFromUrl || a.id === agentFromUrl)
        : null;
      const initialId = urlAgent?.id ?? defaultAgentId;
      if (initialId) {
        setSelectedAgentId(initialId);
        setAgentInitialized(true);
      }
    }
  }, [agentInitialized, agentFromUrl, defaultAgentId, agents]);

  // Load real config via CLI route (bypasses WebSocket scope restrictions)
  useEffect(() => {
    if (!connected || !client) return;

    let cancelled = false;
    setLoadingConfig(true);

    // Detect profile from snapshot configPath
    const configPath = (client.snapshot?.configPath as string) ?? "";
    const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
    const profile = profileMatch ? profileMatch[1] : "";

    fetch(`/api/config-get?profile=${encodeURIComponent(profile)}&agentCount=${agents.length}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.config) return;
        const cfg = data.config as Record<string, string>;

        // Check if LosslessClaw plugin is installed
        const lcmEnabled = cfg["plugins.entries.lossless-claw.enabled"];
        const hasLosslessClaw = lcmEnabled === "true" || !!cfg["plugins.entries.lossless-claw.config.summaryModel"];

        // Build OpenClawConfig from the flat key-value pairs
        const config: OpenClawConfig = {
          _hasLosslessClaw: hasLosslessClaw,
          agents: {
            defaults: {
              model: cfg["agents.defaults.model.primary"]
                ? { primary: cfg["agents.defaults.model.primary"] }
                : undefined,
              heartbeat: {
                every: cfg["agents.defaults.heartbeat.every"] ?? "30m",
                model: cfg["agents.defaults.heartbeat.model"] ?? "",
              },
              compaction: {
                // Compaction model is a LosslessClaw plugin setting, not core config
                // Falls back to agents.defaults.model.primary if not set
                model: cfg["plugins.entries.lossless-claw.config.summaryModel"]
                  ?? cfg["agents.defaults.model.primary"] ?? "",
                threshold: cfg["agents.defaults.compaction.threshold"]
                  ? Number(cfg["agents.defaults.compaction.threshold"])
                  : undefined,
              },
              subagents: {
                maxConcurrent: cfg["agents.defaults.subagents.maxConcurrent"]
                  ? Number(cfg["agents.defaults.subagents.maxConcurrent"])
                  : undefined,
              },
            },
            list: [],
          },
        };

        // Build agents list from per-agent keys
        const agentKeys = Object.keys(cfg).filter((k) => k.startsWith("agents.list["));
        const agentIndices = new Set(
          agentKeys.map((k) => {
            const m = k.match(/agents\.list\[(\d+)\]/);
            return m ? Number(m[1]) : -1;
          }).filter((i) => i >= 0)
        );

        for (const idx of Array.from(agentIndices).sort()) {
          const heartbeatEvery = cfg[`agents.list[${idx}].heartbeat.every`];
          const heartbeatModel = cfg[`agents.list[${idx}].heartbeat.model`];
          config.agents!.list!.push({
            name: cfg[`agents.list[${idx}].name`] ?? `agent${idx}`,
            model: cfg[`agents.list[${idx}].model.primary`] ?? "",
            heartbeat: (heartbeatEvery || heartbeatModel) ? {
              every: heartbeatEvery ?? "",
              model: heartbeatModel ?? "",
            } : undefined,
          });
        }

        // Set lastConfig — the re-extract useEffect will handle
        // extracting the correct values based on selectedAgentId
        setLastConfig(config);
        setHasLosslessClaw(hasLosslessClaw);
      })
      .catch((err) => {
        console.warn("[Optimizer] CLI config read failed, falling back to snapshot:", err);
        // Fall back to snapshot extraction
        client.getConfig().then((rawResponse) => {
          if (cancelled) return;
          const config: OpenClawConfig =
            (rawResponse as Record<string, unknown>)?.config
              ? ((rawResponse as Record<string, unknown>).config as OpenClawConfig)
              : rawResponse;
          setLastConfig(config);
        }).catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, client]);

  // Fetch session token data for model usage sorting
  useEffect(() => {
    if (!connected || !client) return;

    let cancelled = false;
    const configPath = (client.snapshot?.configPath as string) ?? "";
    const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
    const profile = profileMatch ? profileMatch[1] : "";

    fetch(`/api/sessions?profile=${encodeURIComponent(profile)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.summary) return;

        // Token usage by model (for routing sort)
        if (data.summary.byModel) {
          setTokensByModel(
            data.summary.byModel.map((m: { model: string; totalTokens: number; sessionCount: number }) => ({
              model: m.model,
              totalTokens: m.totalTokens,
              sessionCount: m.sessionCount,
            }))
          );
        }

        // Context utilization data
        if (data.summary.contextUtilization) {
          setContextUtilization(data.summary.contextUtilization as ContextUtilizationData);
        }

        // Cache breakdown data
        if (data.summary.cacheBreakdown) {
          setCacheBreakdown(data.summary.cacheBreakdown as CacheBreakdownData);
        }
      })
      .catch(() => {
        // Non-critical — charts just won't render
      });

    return () => { cancelled = true; };
  }, [connected, client]);

  // Re-extract lever values when selectedAgentId or lastConfig changes
  // This handles the case where config loads after agent is already selected
  useEffect(() => {
    if (!lastConfig) return;
    if (selectedAgentId) {
      const { values: agentValues, inherited } = extractAgentLeverValues(lastConfig, selectedAgentId);
      setBaseConfig(agentValues);
      setValues(agentValues);
      setInheritedLevers(inherited);
      // Set originalConfig once — this represents what generated the Actual spend
      if (!originalConfig) setOriginalConfig(agentValues);
    } else {
      const extracted = extractLeverValues(lastConfig);
      setBaseConfig(extracted);
      setValues(extracted);
      setInheritedLevers(new Set());
      if (!originalConfig) setOriginalConfig(extracted);
    }
  }, [lastConfig, selectedAgentId]);

  // Cost calculation options — uses rate card pricing × config settings
  const costOptions = useMemo(
    () => ({ agentCount }),
    [agentCount]
  );

  // Overall percentage change from base config
  const overallPercentChange = useMemo(() => {
    const baseCost = calculateCost(baseConfig, undefined, costOptions).total;
    const currentCost = calculateCost(values, undefined, costOptions).total;
    if (baseCost === 0) return 0;
    return ((currentCost - baseCost) / baseCost) * 100;
  }, [values, baseConfig, costOptions]);

  const diffs = useMemo(
    () => calculateDiff(baseConfig, values),
    [baseConfig, values]
  );
  const hasChanges = diffs.length > 0;

  // Build agent list with correct primary models from CLI config (not snapshot heartbeat models)
  const configAgents = useMemo(() => {
    const list = lastConfig?.agents?.list;
    if (!list || list.length === 0) return agents; // fall back to snapshot agents
    return list.map((a: { name?: string; model?: string }) => ({
      id: a.name ?? "",
      name: a.name ?? "",
      model: a.model ?? "",
      status: "online" as const,
      sessionCount: 0,
      tokenUsage: 0,
    }));
  }, [lastConfig, agents]);

  const activePresetId = useMemo(() => {
    for (const preset of presets) {
      const match = (Object.keys(preset.values) as (keyof LeverValue)[]).every(
        (key) => preset.values[key] === values[key]
      );
      if (match) return preset.id;
    }
    return null;
  }, [values]);

  const handleChange = useCallback(
    (key: keyof LeverValue, value: string | number) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setApplied(false);
    },
    []
  );

  // Handle agent selection change — re-extract config for the chosen agent
  const handleAgentSelect = useCallback(
    (agentId: string | null) => {
      setSelectedAgentId(agentId);
      setApplied(false);

      if (!lastConfig) return;

      if (agentId === null) {
        // Global defaults
        const extracted = extractLeverValues(lastConfig);
        setBaseConfig(extracted);
        setValues(extracted);
        setInheritedLevers(new Set());
      } else {
        // Per-agent config
        const { values: agentValues, inherited } = extractAgentLeverValues(lastConfig, agentId);
        setBaseConfig(agentValues);
        setValues(agentValues);
        setInheritedLevers(inherited);
      }
    },
    [lastConfig]
  );

  // Selected agent name for display
  const selectedAgentName = useMemo(() => {
    if (!selectedAgentId) return "Global defaults";
    return agents.find((a) => a.id === selectedAgentId)?.name ?? selectedAgentId;
  }, [selectedAgentId, agents]);

  // Per-lever percentage deltas — only for model levers, only when changed from base.
  // Shows relative impact: "switching from Sonnet to Haiku = -80%"
  const leverCostDeltaPercents = useMemo(() => {
    const deltas: Record<string, number> = {};
    const baseCost = calculateCost(baseConfig, undefined, costOptions).total;
    for (const lever of levers) {
      if (!MODEL_LEVER_KEYS.has(lever.key)) {
        deltas[lever.key] = 0;
        continue;
      }
      if (String(values[lever.key]) !== String(baseConfig[lever.key])) {
        const withChanged = { ...baseConfig, [lever.key]: values[lever.key] };
        const changedCost = calculateCost(withChanged, undefined, costOptions).total;
        deltas[lever.key] = baseCost > 0 ? ((changedCost - baseCost) / baseCost) * 100 : 0;
      } else {
        deltas[lever.key] = 0;
      }
    }
    return deltas;
  }, [values, baseConfig, costOptions]);

  function handleApply() {
    setShowDiff(true);
  }

  async function handleConfirmWithRollout(_rolloutTarget: RolloutTarget) {
    setShowDiff(false);
    setApplying(true);

    try {
      // Build the list of config key/value changes for the CLI
      const changes: Array<{ key: string; value: string | number }> = [];
      for (const diff of diffs) {
        const lever = levers.find((l) => l.configPath === diff.field);
        if (lever) {
          // If targeting a specific agent, rewrite per-agent config paths
          let configKey = diff.field;
          const agentId = selectedAgentId;

          // These levers are global-only — never rewrite to per-agent paths
          const GLOBAL_ONLY_PATHS = new Set([
            "agents.defaults.subagents.maxConcurrent",
            "agents.defaults.compaction.threshold",
            "agents.defaults.sessionContextLoading",
            "agents.defaults.memoryFileScope",
            "agents.defaults.rateLimitDelay",
            "agents.defaults.searchBatchLimit",
            "plugins.entries.lossless-claw.config.summaryModel",
          ]);

          if (agentId && !GLOBAL_ONLY_PATHS.has(configKey)) {
            // Find the agent's index from the CLI config data (more reliable than snapshot)
            const agentIndex = lastConfig?.agents?.list?.findIndex(
              (a) => a.name === agentId
            ) ?? -1;
            if (agentIndex >= 0) {
              // agents.defaults.heartbeat.model → agents.list[0].heartbeat.model
              configKey = configKey.replace(
                "agents.defaults.",
                `agents.list[${agentIndex}].`
              );
            }
          }
          changes.push({
            key: configKey,
            value: leverValueToConfig(lever.key, values[lever.key]),
          });
        }
      }

      // Detect the openclaw profile from the gateway config path in snapshot
      const configPath = (client?.snapshot?.configPath as string) ?? "";
      let profile: string | undefined;
      const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
      if (profileMatch) {
        profile = profileMatch[1];
      }

      // Call the API route which shells out to openclaw CLI
      const res = await fetch("/api/config-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, changes, restart: true }),
      });

      const result = await res.json();

      if (result.success) {
        setBaseConfig({ ...values });
        setApplied(true);
        // Check if restart failed — config was saved but gateway needs manual restart
        if (result.restart && !result.restart.ok) {
          alert(`Config saved successfully, but gateway restart failed.\n\n${result.restart.error}\n\nIf your gateway is running in foreground (gateway run), you'll need to restart it manually.`);
        }

        // Re-read config from CLI after a short delay to confirm the write
        // (the gateway needs a moment to restart and reload config)
        setTimeout(async () => {
          try {
            const configPath = (client?.snapshot?.configPath as string) ?? "";
            const pm = configPath.match(/\.openclaw-([^/]+)\//);
            const p = pm ? pm[1] : "";
            const r = await fetch(`/api/config-get?profile=${encodeURIComponent(p)}`);
            const data = await r.json();
            // Config confirmed — no-op, just verifying the write landed
          } catch { /* non-critical */ }
        }, 3000);
      } else {
        const failedChanges = (result.results ?? [])
          .filter((r: { ok: boolean }) => !r.ok)
          .map((r: { key: string; error?: string }) => `${r.key}: ${r.error}`)
          .join("\n");
        alert(`Some config changes failed:\n${failedChanges}`);
      }
    } catch (err) {
      console.error("Config apply failed:", err);
      alert(`Failed to apply changes: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setApplying(false);
    }
  }

  function handleReset() {
    setValues({ ...baseConfig });
    setApplied(false);
  }

  if (!loaded) return null;

  if (!connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <SlidersHorizontal size={28} className="text-primary" />
        </div>
        <h1 className="text-lg font-semibold">Token Optimizer</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          The Token Optimizer reads your live OpenClaw config and session data to show exactly which models your agents are using, how much context they&apos;re consuming, and where you can reduce cost or improve performance.
        </p>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground/70">
          Connect a gateway to unlock model routing insights, cache efficiency analysis, and one-click config tuning across all your agents.
        </p>
        <Link
          href="/connect"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plug size={16} />
          Connect Gateway
        </Link>
      </div>
    );
  }

  return (
    <div className="px-12 py-10 max-w-7xl mx-auto" data-page="optimizer">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-normal tracking-tight">Token Optimizer</h1>
              {connected && (
                <span className="px-2.5 py-0.5 bg-success/10 text-success rounded text-xs font-normal">
                  Live
                </span>
              )}
            </div>
            <p className="text-[15px] text-muted-foreground">
              {connected
                ? <>Reading live config from <span className="text-foreground/70">{activeGateway?.name ?? "your gateway"}</span></>
                : "Using default settings. Connect a gateway for live config."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {loadingConfig && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Loading config...
              </span>
            )}
            {/* Tune mode controls */}
            {tuneMode === null ? (
              <div className="relative">
                <button
                  onClick={() => setShowTuneChooser((p) => !p)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-normal text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  Help me tune this
                </button>
                {showTuneChooser && (
                  <div className="absolute right-0 top-full z-10 mt-1 flex gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                    {(Object.entries(tuneModes) as [TuneMode, typeof tuneModes.cost][]).map(
                      ([mode, def]) => (
                        <button
                          key={mode}
                          onClick={() => {
                            setTuneMode(mode);
                            setShowTuneChooser(false);
                            // Apply suggested values for this tune mode
                            const suggested = tuneModes[mode].suggestedValues;
                            if (Object.keys(suggested).length > 0) {
                              setValues((prev) => ({ ...prev, ...suggested }));
                            }
                          }}
                          className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          {def.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {tuneModes[tuneMode].label}
                </span>
                <button
                  onClick={() => {
                    setTuneMode(null);
                    // Restore lever values back to what the gateway has
                    setValues({ ...baseConfig });
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Model Routing ─── */}
      <div className="space-y-6" data-section="model-routing">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-normal tracking-tight">Model Routing</h2>
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {(() => {
              const modelKeys = sections.find((s) => s.id === "model-routing")?.leverKeys ?? [];
              const anyChanged = modelKeys.some((k) => Math.abs(leverCostDeltaPercents[k] ?? 0) > 0.5);
              if (!anyChanged) return "";
              const totalPercent = Math.round(overallPercentChange);
              return `${totalPercent > 0 ? "+" : ""}${totalPercent}% token cost`;
            })()}
          </span>
        </div>

        {/* Your Model Routing overview + why no dollar figures */}
        <CostSummary
          percentChange={overallPercentChange}
          hasChanges={hasChanges}
          agents={configAgents}
          globalDefaultModel={baseConfig.defaultModel as string}
          tokensByModel={tokensByModel}
        />

        {/* Agent scope selector */}
        {connected && agents.length > 0 && (
          <AgentSelector
            agents={agents}
            selectedAgentId={selectedAgentId}
            defaultAgentId={defaultAgentId}
            onSelect={handleAgentSelect}
          />
        )}

        {/* Model levers — 3-column grid: Agent's Model, Heartbeat Model, Compaction Model */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(sections.find((s) => s.id === "model-routing")?.leverKeys ?? [])
            .map((key) => levers.find((l) => l.key === key)!)
            .filter(Boolean)
            .map((lever) => {
              const isSuggested = !tuneMode || tuneModes[tuneMode].leverKeys.includes(lever.key);
              return (
                <LeverCard
                  key={lever.key}
                  lever={lever}
                  labelOverride={
                    lever.key === "defaultModel" && selectedAgentId
                      ? `${selectedAgentName}'s Model`
                      : undefined
                  }
                  value={values[lever.key]}
                  isModelLever={true}
                  costDeltaPercent={leverCostDeltaPercents[lever.key]}
                  inherited={inheritedLevers.has(lever.key)}
                  dimmed={!!tuneMode && !isSuggested}
                  tagOverride={lever.key === "compactionModel" && hasLosslessClaw ? "LosslessClaw feature" : undefined}
                  disabled={lever.key === "compactionModel" && !hasLosslessClaw}
                  disabledMessage={
                    lever.key === "compactionModel" && !hasLosslessClaw
                      ? "Requires LosslessClaw plugin for context compaction. Install it to control compaction costs and reduce token spend on long conversations."
                      : undefined
                  }
                  modelOptions={availableModels}
                  filteredOptions={getFilteredOptions(lever)}
                  rationale={
                    isSuggested && tuneMode ? tuneModes[tuneMode].rationale[lever.key] : undefined
                  }
                  onChange={handleChange}
                />
              );
            })}
        </div>
      </div>

      {/* ─── Session Insights — Context & Cache analysis ─── */}
      {(contextUtilization?.sessions?.length ?? 0) > 0 || (cacheBreakdown?.tokenTotal ?? 0) > 0 ? (
        <div className="mt-12 space-y-6" data-section="session-insights">
          <h2 className="text-xl font-normal tracking-tight">Session Insights</h2>
          <div className="rounded-xl border border-border bg-surface/50 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {contextUtilization && contextUtilization.sessions.length > 0 && (
                <ContextUtilizationChart data={contextUtilization} />
              )}
              {cacheBreakdown && cacheBreakdown.tokenTotal > 0 && (
                <CacheEfficiencyChart data={cacheBreakdown} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ─── Performance Tuning ─── */}
      <div className="mt-12 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-normal tracking-tight">Performance Tuning</h2>
          <div className="flex items-center gap-2">
            <PresetSelector
              presets={presets}
              activePresetId={activePresetId}
              onSelect={(preset) => {
                setValues((prev) => ({ ...prev, ...(presetOverrides[preset.id] ?? {}) }));
                setApplied(false);
              }}
            />
          </div>
        </div>

        {/* Non-model sections */}
        {sections
          .filter((s) => s.id !== "model-routing")
          .map((section) => {
            const sectionLevers = section.leverKeys
              .map((key) => levers.find((l) => l.key === key)!)
              .filter(Boolean);

            if (sectionLevers.length === 0) return null;

            return (
              <div key={section.id} data-section={section.id}>
                <div className="mb-3">
                  <h3 className="text-[15px] font-normal text-muted-foreground">{section.label}</h3>
                </div>
                <div className="grid gap-3">
                  {sectionLevers.map((lever) => {
                    const isSuggested = !tuneMode || tuneModes[tuneMode].leverKeys.includes(lever.key);
                    return (
                      <LeverCard
                        key={lever.key}
                        lever={lever}
                        value={values[lever.key]}
                        isModelLever={false}
                        costDeltaPercent={0}
                        inherited={inheritedLevers.has(lever.key)}
                        dimmed={!!tuneMode && !isSuggested}
                        filteredOptions={getFilteredOptions(lever)}
                        rationale={
                          isSuggested && tuneMode ? tuneModes[tuneMode].rationale[lever.key] : undefined
                        }
                        onChange={handleChange}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Spacer for sticky bar */}
      {hasChanges && <div className="h-16" />}

      {/* Sticky bottom bar — appears when changes are pending */}
      <StickyApplyBar
        changeCount={diffs.length}
        changes={diffs}
        applying={applying}
        gatewayName={activeGateway?.name}
        onApply={handleApply}
        onReset={handleReset}
      />

      {/* Applied confirmation */}
      {applied && !hasChanges && (
        <div className="fixed bottom-4 right-4 z-30 rounded-lg bg-success/10 border border-success/20 px-4 py-2 text-sm font-medium text-success">
          Changes applied to {activeGateway?.name ?? "gateway"}
        </div>
      )}

      {/* Apply modal */}
      {showDiff && (
        <DiffPreview
          diffs={diffs}
          gatewayName={activeGateway?.name}
          agents={agents}
          selectedAgentId={selectedAgentId}
          selectedAgentName={selectedAgentName}
          onConfirm={handleConfirmWithRollout}
          onCancel={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
