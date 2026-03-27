"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { LeverValue, ModelOption, ContextLoadOption } from "@/types/optimizer";
import { OpenClawConfig } from "@/types";
import {
  levers,
  mockCurrentConfig,
  presets,
  sections,
  tuneModes,
  TuneMode,
  calculateCost,
  calculateDiff,
  configHasLocalModel,
  getFilteredOptions,
  formatCost,
} from "@/lib/optimizer";
import { useRates } from "@/contexts/RatesContext";
import { useGateway } from "@/contexts/GatewayContext";
import LeverCard from "@/components/optimizer/LeverCard";
import CostSummary from "@/components/optimizer/CostSummary";
import PresetSelector from "@/components/optimizer/PresetSelector";
import AgentSelector from "@/components/optimizer/AgentSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";
import { RolloutTarget } from "@/components/optimizer/DiffPreview";
import RateSetupCard from "@/components/rates/RateSetupCard";

// --- Config extraction helpers ---

function extractLeverValues(config: OpenClawConfig): LeverValue {
  const defaults = config?.agents?.defaults;
  return {
    heartbeatModel: mapModel(defaults?.heartbeat?.model) ?? mockCurrentConfig.heartbeatModel,
    heartbeatFrequency: mapFrequency(defaults?.heartbeat?.every) ?? mockCurrentConfig.heartbeatFrequency,
    defaultModel: (mapModel(defaults?.model?.primary) as "claude-haiku" | "claude-sonnet" | undefined) ?? mockCurrentConfig.defaultModel,
    compactionModel: (mapModel(defaults?.compaction?.model) as "local-ollama" | "claude-haiku" | undefined) ?? mockCurrentConfig.compactionModel,
    compactionThreshold: mockCurrentConfig.compactionThreshold,
    subagentConcurrency: defaults?.subagents?.maxConcurrent ?? mockCurrentConfig.subagentConcurrency,
    sessionContextLoading: mapContextLoad((config as Record<string, unknown>)?.sessionContextLoading as string) ?? mockCurrentConfig.sessionContextLoading,
    memoryFileScope: ((config as Record<string, unknown>)?.memoryFileScope as number) ?? mockCurrentConfig.memoryFileScope,
    rateLimitDelay: ((config as Record<string, unknown>)?.rateLimitDelay as number) ?? mockCurrentConfig.rateLimitDelay,
    searchBatchLimit: ((config as Record<string, unknown>)?.searchBatchLimit as number) ?? mockCurrentConfig.searchBatchLimit,
  };
}

function mapModel(model?: string): ModelOption | undefined {
  if (!model) return undefined;
  const lower = model.toLowerCase();
  if (lower.includes("ollama") || lower.startsWith("local")) return "local-ollama";
  if (lower.includes("haiku")) return "claude-haiku";
  if (lower.includes("sonnet")) return "claude-sonnet";
  if (lower.includes("opus")) return "claude-opus";
  return undefined;
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

  // Per-agent model
  const agentModel = mapModel(agent.model as string | undefined);
  if (agentModel) {
    agentValues.defaultModel = agentModel as typeof agentValues.defaultModel;
  } else {
    inherited.add("defaultModel");
  }

  // Per-agent heartbeat
  if (hb?.model) {
    const m = mapModel(hb.model as string);
    if (m) agentValues.heartbeatModel = m;
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

/** Map BroadClaw internal lever values back to the actual config strings
 *  the OpenClaw gateway expects. */
function leverValueToConfig(key: string, value: string | number): string | number {
  // Model keys → full Anthropic model identifiers
  if (key === "defaultModel" || key === "heartbeatModel" || key === "compactionModel") {
    const v = String(value);
    if (v === "claude-sonnet") return "anthropic/claude-sonnet-4-6";
    if (v === "claude-haiku") return "anthropic/claude-haiku-4-5-20251001";
    if (v === "claude-opus") return "anthropic/claude-opus-4-6";
    if (v === "local-ollama") return "ollama/llama3.2:3b";
    return v; // pass through unknown values
  }
  // Frequency — pass through as-is (e.g. "30m", "off", "disabled")
  if (key === "heartbeatFrequency") {
    const v = String(value);
    if (v === "off") return "disabled";
    return v;
  }
  // Numeric and other values — pass through
  return value;
}

// Model levers — only these get cost numbers (sourced from Admin API per-model spend)
const MODEL_LEVER_KEYS = new Set(["defaultModel", "heartbeatModel", "compactionModel"]);

// --- Page component ---

export default function OptimizerPage() {
  const { hasRates, loaded, models, config: ratesConfig } = useRates();
  const { client, connected, activeGateway, agents } = useGateway();
  const [baseConfig, setBaseConfig] = useState<LeverValue>({ ...mockCurrentConfig });
  const [values, setValues] = useState<LeverValue>({ ...mockCurrentConfig });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [hasLocalModel, setHasLocalModel] = useState(false);
  const [tuneMode, setTuneMode] = useState<TuneMode | null>(null);
  const [showTuneChooser, setShowTuneChooser] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [inheritedLevers, setInheritedLevers] = useState<Set<string>>(new Set());
  const [lastConfig, setLastConfig] = useState<OpenClawConfig | null>(null);

  const adminApiMonthly = ratesConfig?.realSpend?.monthlyEstimate ?? 0;
  const perModelUsage = ratesConfig?.realSpend?.perModel;
  const agentCount = connected && agents.length > 0 ? agents.length : 5;

  // The actual baseline: from Admin API real spend data only
  const realBaselineMonthly = adminApiMonthly;

  // Load real config from gateway when connected
  useEffect(() => {
    if (!connected || !client) return;

    let cancelled = false;
    setLoadingConfig(true);

    client
      .getConfig()
      .then((rawResponse) => {
        if (cancelled) return;
        const config: OpenClawConfig =
          (rawResponse as Record<string, unknown>)?.config
            ? ((rawResponse as Record<string, unknown>).config as OpenClawConfig)
            : rawResponse;

        setLastConfig(config);
        const extracted = extractLeverValues(config);
        setBaseConfig(extracted);
        setValues(extracted);
        setInheritedLevers(new Set());
        setHasLocalModel(
          configHasLocalModel(
            config as Record<string, unknown>,
            client.snapshot ?? undefined
          )
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, client]);

  // Cost calculation options — anchored to real spend when available
  const costOptions = useMemo(
    () =>
      realBaselineMonthly > 0
        ? { agentCount, realBaselineMonthly, baseValues: baseConfig, perModel: perModelUsage }
        : { agentCount },
    [agentCount, realBaselineMonthly, baseConfig, perModelUsage]
  );

  // Check if any model levers have changed
  const modelLeverChanged = useMemo(() => {
    for (const key of MODEL_LEVER_KEYS) {
      if (String(values[key as keyof LeverValue]) !== String(baseConfig[key as keyof LeverValue])) {
        return true;
      }
    }
    return false;
  }, [values, baseConfig]);

  // Projected cost: equals actual when no model levers changed.
  // Only diverges when a model lever is changed (the only thing we can price).
  const projectedCost = useMemo(() => {
    if (!modelLeverChanged && realBaselineMonthly > 0) {
      return { monthlyInput: 0, monthlyOutput: 0, total: realBaselineMonthly };
    }
    return calculateCost(values, hasRates ? models : undefined, costOptions);
  }, [values, hasRates, models, costOptions, modelLeverChanged, realBaselineMonthly]);

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

  // Per-lever cost deltas — only for model levers, only when changed from base.
  // Uses Admin API per-model spend × rate difference, not fabricated estimates.
  const leverCostDeltas = useMemo(() => {
    const rates = hasRates ? models : undefined;
    const deltas: Record<string, number> = {};
    for (const lever of levers) {
      if (!MODEL_LEVER_KEYS.has(lever.key)) {
        deltas[lever.key] = 0;
        continue;
      }
      if (String(values[lever.key]) !== String(baseConfig[lever.key])) {
        const withOriginal = { ...baseConfig };
        const withChanged = { ...baseConfig, [lever.key]: values[lever.key] };
        const origCost = calculateCost(withOriginal, rates, costOptions).total;
        const changedCost = calculateCost(withChanged, rates, costOptions).total;
        deltas[lever.key] = changedCost - origCost;
      } else {
        deltas[lever.key] = 0;
      }
    }
    return deltas;
  }, [values, baseConfig, hasRates, models, costOptions]);

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
          // If targeting a specific agent, rewrite the config path to agents.list[index].*
          let configKey = diff.field;
          const agentId = selectedAgentId;
          if (agentId) {
            // Find the agent's index in the agents.list array from the snapshot
            const snapshot = client?.snapshot;
            const health = snapshot?.health as Record<string, unknown> | undefined;
            const snapshotAgents = (health?.agents as Array<Record<string, unknown>>) ?? [];
            const agentIndex = snapshotAgents.findIndex(
              (a) => String(a.agentId) === agentId
            );
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
  if (!hasRates) return <RateSetupCard />;

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
              {adminApiMonthly > 0 && (
                <> &middot; ${adminApiMonthly.toFixed(0)}/mo actual (last 30 days)</>
              )}
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

      <div className="space-y-4">
        {/* Cost summary */}
        <CostSummary
          actualCost={realBaselineMonthly > 0 ? realBaselineMonthly : null}
          actualSource={adminApiMonthly > 0 ? "admin-api" : undefined}
          projectedCost={projectedCost.total}
          hasChanges={hasChanges}
          onApply={handleApply}
          onReset={handleReset}
        />

        {/* Agent scope selector */}
        {connected && agents.length > 0 && (
          <AgentSelector
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelect={handleAgentSelect}
          />
        )}

        {/* Presets + status */}
        <div className="flex items-center justify-between">
          <PresetSelector
            presets={presets}
            activePresetId={activePresetId}
            onSelect={(preset) => {
              setValues({ ...preset.values });
              setApplied(false);
            }}
          />
          {applied && (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              {connected
                ? `Changes applied to ${activeGateway?.name ?? "gateway"}`
                : "Changes applied"}
            </span>
          )}
          {applying && (
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning animate-pulse">
              Applying to {activeGateway?.name ?? "gateway"}...
            </span>
          )}
        </div>

        {/* Section-grouped levers */}
        <div className="space-y-6">
          {visibleSections.map((section) => {
            const sectionLevers = section.leverKeys
              .map((key) => levers.find((l) => l.key === key)!)
              .filter(Boolean);

            return (
              <div key={section.id} data-section={section.id} data-section-cost={(() => {
                if (section.id !== "model-routing") return null;
                const d = section.leverKeys.reduce((sum, k) => sum + (leverCostDeltas[k] ?? 0), 0);
                return Math.abs(d) < 0.01 ? null : d.toFixed(2);
              })()}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{section.label}</h2>
                  <span className="font-mono text-xs font-medium text-muted-foreground">
                    {(() => {
                      if (section.id !== "model-routing") return "—";
                      const sectionDelta = section.leverKeys.reduce((sum, k) => sum + (leverCostDeltas[k] ?? 0), 0);
                      if (Math.abs(sectionDelta) < 0.01) return "—";
                      return `${sectionDelta > 0 ? "+" : ""}${formatCost(sectionDelta)}/mo`;
                    })()}
                  </span>
                </div>
                <div className="grid gap-3">
                  {sectionLevers.map((lever) => {
                    // Override "Default Model" label when specific agent selected
                    const labelOverride =
                      lever.key === "defaultModel" && selectedAgentId
                        ? `${selectedAgentName}'s Model`
                        : undefined;

                    return (
                      <LeverCard
                        key={lever.key}
                        lever={lever}
                        labelOverride={labelOverride}
                        value={values[lever.key]}
                        isModelLever={MODEL_LEVER_KEYS.has(lever.key)}
                        costDelta={leverCostDeltas[lever.key]}
                        inherited={inheritedLevers.has(lever.key)}
                        filteredOptions={getFilteredOptions(lever, hasLocalModel)}
                        rationale={
                          tuneMode
                            ? tuneModes[tuneMode].rationale[lever.key]
                            : undefined
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
      </div>

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
