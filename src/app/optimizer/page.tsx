"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import CostSummary from "@/components/optimizer/CostSummary";
import PresetSelector from "@/components/optimizer/PresetSelector";
import AgentSelector from "@/components/optimizer/AgentSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";
import { RolloutTarget } from "@/components/optimizer/DiffPreview";
import StickyApplyBar from "@/components/optimizer/StickyApplyBar";
// Billing API setup removed — rate card provides estimates without any API keys

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
  console.log("[Optimizer] extractAgentLeverValues:", agentId, { model: agent.model, heartbeat: hb });

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

/** Map BroadClaw lever values to config values for openclaw config set.
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
  const [loaded, setPageLoaded] = useState(false);
  useEffect(() => { setPageLoaded(true); }, []);
  const { client, connected, activeGateway, agents, availableModels } = useGateway();
  const [baseConfig, setBaseConfig] = useState<LeverValue>({ ...fallbackDefaults });
  // originalConfig: the config that generated the Actual spend — persisted to localStorage
  // so it survives reconnects and page remounts. Only reset when user explicitly clicks "Reset baseline".
  const [originalConfig, setOriginalConfigState] = useState<LeverValue | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("broadclaw-original-config");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const setOriginalConfig = (config: LeverValue) => {
    setOriginalConfigState(config);
    try {
      localStorage.setItem("broadclaw-original-config", JSON.stringify(config));
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

  const agentCount = connected && agents.length > 0 ? agents.length : 1;

  // Default the agent selector to the default agent once agents load
  useEffect(() => {
    if (!agentInitialized && defaultAgentId && agents.length > 0) {
      setSelectedAgentId(defaultAgentId);
      setAgentInitialized(true);
    }
  }, [agentInitialized, defaultAgentId, agents]);

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
        console.log("[Optimizer] Config from CLI:", cfg);

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

  // Visible sections/levers based on tune mode
  const visibleLeverKeys = useMemo(() => {
    if (!tuneMode) return null;
    return new Set(tuneModes[tuneMode].leverKeys);
  }, [tuneMode]);

  const visibleSections = useMemo(() => {
    if (!visibleLeverKeys) return sections;
    return sections
      .map((s) => ({
        ...s,
        leverKeys: s.leverKeys.filter((k) => visibleLeverKeys.has(k)),
      }))
      .filter((s) => s.leverKeys.length > 0);
  }, [visibleLeverKeys]);

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

      // Log exactly what we're sending
      console.log("[Optimizer] Applying config changes:", { profile, changes });

      // Call the API route which shells out to openclaw CLI
      const res = await fetch("/api/config-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, changes, restart: true }),
      });

      const result = await res.json();
      console.log("[Optimizer] Config apply result:", result);

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
            if (data.config) {
              console.log("[Optimizer] Post-apply config re-read:", data.config);
            }
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

  return (
    <div className="p-8" data-page="optimizer">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Token Optimizer</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? `Reading live config from ${activeGateway?.name ?? "your gateway"}`
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
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
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
                  onClick={() => setTuneMode(null)}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  Show all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Cost & Model Routing (moves the number) ─── */}
      <div className="rounded-xl border border-border bg-surface/50 p-5 space-y-4">
        <CostSummary
          percentChange={overallPercentChange}
          hasChanges={hasChanges}
        />

        {/* Agent scope selector */}
        {connected && agents.length > 0 && (
          <AgentSelector
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelect={handleAgentSelect}
          />
        )}

        {/* Model levers — these drive projected cost */}
        <div data-section="model-routing">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Model Routing</h2>
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {(() => {
                const modelKeys = sections.find((s) => s.id === "model-routing")?.leverKeys ?? [];
                const anyChanged = modelKeys.some((k) => Math.abs(leverCostDeltaPercents[k] ?? 0) > 0.5);
                if (!anyChanged) return "—";
                const totalPercent = Math.round(overallPercentChange);
                return `${totalPercent > 0 ? "+" : ""}${totalPercent}% token cost`;
              })()}
            </span>
          </div>
          <div className="grid gap-3">
            {(sections.find((s) => s.id === "model-routing")?.leverKeys ?? [])
              .map((key) => levers.find((l) => l.key === key)!)
              .filter(Boolean)
              .map((lever) => (
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
                    tuneMode ? tuneModes[tuneMode].rationale[lever.key] : undefined
                  }
                  onChange={handleChange}
                />
              ))}
          </div>
        </div>
      </div>

      {/* ─── Performance Tuning (doesn't move the number) ─── */}
      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Performance Tuning</h2>
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

            // Filter by tune mode if active
            const visible = tuneMode
              ? sectionLevers.filter((l) => tuneModes[tuneMode].leverKeys.includes(l.key))
              : sectionLevers;

            if (visible.length === 0) return null;

            return (
              <div key={section.id} data-section={section.id}>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">{section.label}</h3>
                </div>
                <div className="grid gap-3">
                  {visible.map((lever) => (
                    <LeverCard
                      key={lever.key}
                      lever={lever}
                      value={values[lever.key]}
                      isModelLever={false}
                      costDeltaPercent={0}
                      inherited={inheritedLevers.has(lever.key)}
                      filteredOptions={getFilteredOptions(lever)}
                      rationale={
                        tuneMode ? tuneModes[tuneMode].rationale[lever.key] : undefined
                      }
                      onChange={handleChange}
                    />
                  ))}
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
