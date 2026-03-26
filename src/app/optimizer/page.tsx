"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { LeverValue } from "@/types/optimizer";
import { OpenClawConfig } from "@/types";
import {
  levers,
  mockCurrentConfig,
  presets,
  calculateCost,
  calculateDiff,
} from "@/lib/optimizer";
import { useRates } from "@/contexts/RatesContext";
import { useGateway } from "@/contexts/GatewayContext";
import LeverCard from "@/components/optimizer/LeverCard";
import CostSummary from "@/components/optimizer/CostSummary";
import PresetSelector from "@/components/optimizer/PresetSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";
import RateSetupCard from "@/components/rates/RateSetupCard";

// Extract lever values from real openclaw.json config
function extractLeverValues(config: OpenClawConfig): LeverValue {
  const defaults = config?.agents?.defaults;
  return {
    heartbeatModel: mapModel(defaults?.heartbeat?.model) ?? mockCurrentConfig.heartbeatModel,
    heartbeatFrequency: mapFrequency(defaults?.heartbeat?.every) ?? mockCurrentConfig.heartbeatFrequency,
    defaultModel: mapModel(defaults?.model?.primary) as "claude-haiku" | "claude-sonnet" ?? mockCurrentConfig.defaultModel,
    compactionModel: mapModel(defaults?.compaction?.model) as "local-ollama" | "claude-haiku" ?? mockCurrentConfig.compactionModel,
    compactionThreshold: mockCurrentConfig.compactionThreshold, // TTL doesn't map directly to token count
    subagentConcurrency: defaults?.maxConcurrentSubagents ?? defaults?.maxConcurrent ?? mockCurrentConfig.subagentConcurrency,
  };
}

function mapModel(model?: string): string | undefined {
  if (!model) return undefined;
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return "claude-haiku";
  if (lower.includes("sonnet")) return "claude-sonnet";
  if (lower.includes("ollama") || lower.includes("local")) return "local-ollama";
  return undefined;
}

function mapFrequency(every?: string): "off" | "60m" | "30m" | "15m" | undefined {
  if (!every) return undefined;
  const lower = every.toLowerCase();
  if (lower === "off" || lower === "none" || lower === "0") return "off";
  if (lower === "15m" || lower === "15min") return "15m";
  if (lower === "30m" || lower === "30min") return "30m";
  if (lower === "60m" || lower === "1h" || lower === "60min") return "60m";
  return undefined;
}

export default function OptimizerPage() {
  const { hasRates, loaded, models } = useRates();
  const { client, connected } = useGateway();
  const [baseConfig, setBaseConfig] = useState<LeverValue>({ ...mockCurrentConfig });
  const [values, setValues] = useState<LeverValue>({ ...mockCurrentConfig });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Load real config from gateway when connected
  useEffect(() => {
    if (!connected || !client) return;

    let cancelled = false;
    setLoadingConfig(true);

    client
      .getConfig()
      .then((config) => {
        if (cancelled) return;
        const extracted = extractLeverValues(config);
        setBaseConfig(extracted);
        setValues(extracted);
      })
      .catch(() => {
        // Fall back to mock config
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, client]);

  const currentCost = useMemo(
    () => calculateCost(baseConfig, hasRates ? models : undefined),
    [baseConfig, hasRates, models]
  );
  const projectedCost = useMemo(
    () => calculateCost(values, hasRates ? models : undefined),
    [values, hasRates, models]
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

  const leverCostDeltas = useMemo(() => {
    const rates = hasRates ? models : undefined;
    const deltas: Record<string, number> = {};
    for (const lever of levers) {
      const withOriginal = { ...baseConfig };
      const withChanged = {
        ...baseConfig,
        [lever.key]: values[lever.key],
      };
      deltas[lever.key] =
        calculateCost(withChanged, rates).total -
        calculateCost(withOriginal, rates).total;
    }
    return deltas;
  }, [values, baseConfig, hasRates, models]);

  function handleApply() {
    setShowDiff(true);
  }

  async function handleConfirm() {
    setShowDiff(false);

    if (connected && client) {
      setApplying(true);
      try {
        // Build the patch from diffs
        const patch: Record<string, unknown> = {};
        for (const diff of diffs) {
          // Set each changed field path
          const lever = levers.find((l) => l.configPath === diff.field);
          if (lever) {
            // For nested paths, we'd need to build the object tree
            // For now, use config.set for each field
            await client.request("config.set", {
              path: diff.field,
              value: values[lever.key],
            });
          }
        }
        // Apply and restart
        await client.applyConfig(true);
        setBaseConfig({ ...values });
        setApplied(true);
      } catch (err) {
        // If write fails, still show success for the UI change
        console.error("Config write failed:", err);
      } finally {
        setApplying(false);
      }
    } else {
      // Mock mode — just update local state
      setBaseConfig({ ...values });
      setApplied(true);
    }
  }

  function handleReset() {
    setValues({ ...baseConfig });
    setApplied(false);
  }

  // Wait for localStorage check
  if (!loaded) return null;

  // Show onboarding if no rates configured
  if (!hasRates) {
    return <RateSetupCard />;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Token Optimizer</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? "Reading live config from your gateway."
                : "Using default settings. Connect a gateway for live config."}
            </p>
          </div>
          {loadingConfig && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Loading config...
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <CostSummary
          currentCost={currentCost.total}
          projectedCost={projectedCost.total}
          hasChanges={hasChanges}
          onApply={handleApply}
          onReset={handleReset}
        />

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
              {connected ? "Changes applied to gateway" : "Changes applied"}
            </span>
          )}
          {applying && (
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning animate-pulse">
              Applying to gateway...
            </span>
          )}
        </div>

        <div className="grid gap-3">
          {levers.map((lever) => (
            <LeverCard
              key={lever.key}
              lever={lever}
              value={values[lever.key]}
              costDelta={leverCostDeltas[lever.key]}
              onChange={handleChange}
            />
          ))}
        </div>
      </div>

      {showDiff && (
        <DiffPreview
          diffs={diffs}
          onConfirm={handleConfirm}
          onCancel={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
