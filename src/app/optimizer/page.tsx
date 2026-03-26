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

// --- Page component ---

export default function OptimizerPage() {
  const { hasRates, loaded, models, config: ratesConfig } = useRates();
  const { client, connected, activeGateway, agents, gatewayUsage } = useGateway();
  const [baseConfig, setBaseConfig] = useState<LeverValue>({ ...mockCurrentConfig });
  const [values, setValues] = useState<LeverValue>({ ...mockCurrentConfig });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [hasLocalModel, setHasLocalModel] = useState(false);
  const [tuneMode, setTuneMode] = useState<TuneMode | null>(null);
  const [showTuneChooser, setShowTuneChooser] = useState(false);

  const adminApiMonthly = ratesConfig?.realSpend?.monthlyEstimate ?? 0;
  const perModelUsage = ratesConfig?.realSpend?.perModel;
  const agentCount = connected && agents.length > 0 ? agents.length : 5;

  // Compute actual cost from gateway usage × manual rates (fallback when no Admin API)
  const gatewayDerivedMonthly = useMemo(() => {
    if (adminApiMonthly > 0) return 0; // Admin API takes precedence
    if (!gatewayUsage.loaded || gatewayUsage.perModel.length === 0) return 0;
    if (!hasRates || models.length === 0) return 0;

    let totalCost = 0;
    for (const mu of gatewayUsage.perModel) {
      // Match gateway model name to our rate table
      const lower = mu.model.toLowerCase();
      let rate = models.find((r) => lower.includes(r.model.replace("claude-", "")));
      if (!rate) rate = models.find((r) => lower.includes("haiku") && r.model === "claude-haiku");
      if (!rate) rate = models.find((r) => lower.includes("sonnet") && r.model === "claude-sonnet");
      if (rate) {
        totalCost +=
          (mu.inputTokens * rate.inputPerMillion) / 1_000_000 +
          (mu.outputTokens * rate.outputPerMillion) / 1_000_000;
      }
    }
    // The gateway usage covers the session lifetime, not necessarily 30 days.
    // Return as-is — the label will say "from gateway" not "last 30 days".
    return totalCost;
  }, [adminApiMonthly, gatewayUsage, hasRates, models]);

  // The actual baseline: prefer Admin API, fall back to gateway-derived
  const realBaselineMonthly = adminApiMonthly > 0 ? adminApiMonthly : gatewayDerivedMonthly;

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

        const extracted = extractLeverValues(config);
        setBaseConfig(extracted);
        setValues(extracted);
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

  const projectedCost = useMemo(
    () => calculateCost(values, hasRates ? models : undefined, costOptions),
    [values, hasRates, models, costOptions]
  );

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

  // Per-lever cost deltas
  const leverCostDeltas = useMemo(() => {
    const rates = hasRates ? models : undefined;
    const deltas: Record<string, number> = {};
    for (const lever of levers) {
      const withOriginal = { ...baseConfig };
      const withChanged = { ...baseConfig, [lever.key]: values[lever.key] };
      const origCost = calculateCost(withOriginal, rates, costOptions).total;
      const changedCost = calculateCost(withChanged, rates, costOptions).total;
      deltas[lever.key] = changedCost - origCost;
    }
    // Debug: always log cost calculation details
    console.log("[Optimizer] Cost deltas:", deltas);
    console.log("[Optimizer] Base cost:", calculateCost(baseConfig, rates, costOptions).total.toFixed(2));
    console.log("[Optimizer] Projected cost:", calculateCost(values, rates, costOptions).total.toFixed(2));
    console.log("[Optimizer] Rates:", hasRates, models?.map((m) => `${m.model}:$${m.inputPerMillion}/$${m.outputPerMillion}`));
    console.log("[Optimizer] costOptions:", JSON.stringify(costOptions));
    return deltas;
  }, [values, baseConfig, hasRates, models, costOptions]);

  // Per-section summed cost deltas
  const sectionCostDeltas = useMemo(() => {
    const result: Record<string, number> = {};
    for (const section of sections) {
      let sum = 0;
      for (const key of section.leverKeys) {
        sum += leverCostDeltas[key] ?? 0;
      }
      result[section.id] = sum;
    }
    return result;
  }, [leverCostDeltas]);

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

  async function handleConfirmWithRollout(rolloutTarget: RolloutTarget) {
    setShowDiff(false);

    if (connected && client) {
      setApplying(true);
      try {
        for (const diff of diffs) {
          const lever = levers.find((l) => l.configPath === diff.field);
          if (lever) {
            const params: Record<string, unknown> = {
              path: diff.field,
              value: values[lever.key],
            };
            if (rolloutTarget.type === "single" && rolloutTarget.agentId) {
              params.agentId = rolloutTarget.agentId;
            }
            await client.request("config.set", params);
          }
        }
        await client.applyConfig(true);
        setBaseConfig({ ...values });
        setApplied(true);
      } catch (err) {
        console.error("Config write failed:", err);
      } finally {
        setApplying(false);
      }
    } else {
      setBaseConfig({ ...values });
      setApplied(true);
    }
  }

  function handleReset() {
    setValues({ ...baseConfig });
    setApplied(false);
  }

  if (!loaded) return null;
  if (!hasRates) return <RateSetupCard />;

  return (
    <div className="p-8">
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
              {adminApiMonthly === 0 && gatewayDerivedMonthly > 0 && (
                <> &middot; ~${gatewayDerivedMonthly.toFixed(0)} est. (from gateway usage &times; your rates)</>
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
          actualSource={adminApiMonthly > 0 ? "admin-api" : gatewayDerivedMonthly > 0 ? "gateway" : undefined}
          projectedCost={projectedCost.total}
          hasChanges={hasChanges}
          onApply={handleApply}
          onReset={handleReset}
        />

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
              <div key={section.id}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">{section.label}</h2>
                  <span
                    className={`font-mono text-xs font-medium ${
                      sectionCostDeltas[section.id] < -0.01
                        ? "text-success"
                        : sectionCostDeltas[section.id] > 0.01
                          ? "text-danger"
                          : "text-muted-foreground"
                    }`}
                  >
                    {sectionCostDeltas[section.id] > 0 ? "+" : ""}
                    {formatCost(sectionCostDeltas[section.id])}/mo
                  </span>
                </div>
                <div className="grid gap-3">
                  {sectionLevers.map((lever) => (
                    <LeverCard
                      key={lever.key}
                      lever={lever}
                      value={values[lever.key]}
                      costDelta={leverCostDeltas[lever.key]}
                      filteredOptions={getFilteredOptions(lever, hasLocalModel)}
                      rationale={
                        tuneMode
                          ? tuneModes[tuneMode].rationale[lever.key]
                          : undefined
                      }
                      onChange={handleChange}
                    />
                  ))}
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
          onConfirm={handleConfirmWithRollout}
          onCancel={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
