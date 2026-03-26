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
import LeverCard from "@/components/optimizer/LeverCard";
import CostSummary from "@/components/optimizer/CostSummary";
import PresetSelector from "@/components/optimizer/PresetSelector";
import DiffPreview from "@/components/optimizer/DiffPreview";

export default function OptimizerPage() {
  const [values, setValues] = useState<LeverValue>({ ...mockCurrentConfig });
  const [showDiff, setShowDiff] = useState(false);
  const [applied, setApplied] = useState(false);

  const currentCost = useMemo(
    () => calculateCost(mockCurrentConfig),
    []
  );
  const projectedCost = useMemo(() => calculateCost(values), [values]);

  const diffs = useMemo(
    () => calculateDiff(mockCurrentConfig, values),
    [values]
  );
  const hasChanges = diffs.length > 0;

  // Check which preset matches current values, if any
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

  // Calculate per-lever cost deltas
  const leverCostDeltas = useMemo(() => {
    const deltas: Record<string, number> = {};
    for (const lever of levers) {
      // Calculate cost with just this lever changed vs original
      const withOriginal = {
        ...mockCurrentConfig,
      };
      const withChanged = {
        ...mockCurrentConfig,
        [lever.key]: values[lever.key],
      };
      deltas[lever.key] =
        calculateCost(withChanged).total - calculateCost(withOriginal).total;
    }
    return deltas;
  }, [values]);

  function handleApply() {
    setShowDiff(true);
  }

  function handleConfirm() {
    // TODO: Write config to gateway
    setShowDiff(false);
    setApplied(true);
  }

  function handleReset() {
    setValues({ ...mockCurrentConfig });
    setApplied(false);
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
