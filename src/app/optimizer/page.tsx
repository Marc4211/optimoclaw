"use client";

import { useState, useMemo, useCallback } from "react";
import { LeverValue } from "@/types/optimizer";
import {
  levers,
  mockCurrentConfig,
  presets,
  calculateCost,
  calculateDiff,
} from "@/lib/optimizer";
import { useRates } from "@/contexts/RatesContext";
import LeverCard from "@/components/optimizer/LeverCard";
import CostSummary from "@/components/optimizer/CostSummary";
import PresetSelector from "@/components/optimizer/PresetSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";
import RateSetupCard from "@/components/rates/RateSetupCard";

export default function OptimizerPage() {
  const { hasRates, loaded, models } = useRates();
  const [values, setValues] = useState<LeverValue>({ ...mockCurrentConfig });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);

  const currentCost = useMemo(
    () => calculateCost(mockCurrentConfig, hasRates ? models : undefined),
    [hasRates, models]
  );
  const projectedCost = useMemo(
    () => calculateCost(values, hasRates ? models : undefined),
    [values, hasRates, models]
  );

  const diffs = useMemo(
    () => calculateDiff(mockCurrentConfig, values),
    [values]
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
      const withOriginal = { ...mockCurrentConfig };
      const withChanged = {
        ...mockCurrentConfig,
        [lever.key]: values[lever.key],
      };
      deltas[lever.key] =
        calculateCost(withChanged, rates).total -
        calculateCost(withOriginal, rates).total;
    }
    return deltas;
  }, [values, hasRates, models]);

  function handleApply() {
    setShowDiff(true);
  }

  function handleConfirm() {
    setShowDiff(false);
    setApplied(true);
  }

  function handleReset() {
    setValues({ ...mockCurrentConfig });
    setApplied(false);
  }

  // Wait for localStorage check before deciding what to show
  if (!loaded) return null;

  // Show onboarding if no rates configured
  if (!hasRates) {
    return <RateSetupCard />;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Token Optimizer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adjust deployment settings to optimize cost and performance.
        </p>
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
              Changes applied
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
