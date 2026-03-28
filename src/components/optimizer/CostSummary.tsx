"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface CostSummaryProps {
  /** Percentage change from base config. 0 = no change, -30 = 30% cheaper, +50 = 50% more expensive */
  percentChange: number;
  hasChanges: boolean;
}

export default function CostSummary({
  percentChange,
  hasChanges,
}: CostSummaryProps) {
  const isUp = percentChange > 0.5;
  const isDown = percentChange < -0.5;

  if (!hasChanges) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">
          Adjust the levers below to see estimated impact on token costs.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Estimated Token Cost Impact</p>
          <p
            className={`flex items-center gap-1.5 font-mono text-2xl font-semibold ${
              isDown
                ? "text-success"
                : isUp
                  ? "text-danger"
                  : "text-muted-foreground"
            }`}
          >
            {isDown ? (
              <TrendingDown size={20} />
            ) : isUp ? (
              <TrendingUp size={20} />
            ) : (
              <Minus size={20} />
            )}
            {percentChange > 0 ? "+" : ""}
            {Math.abs(percentChange) < 0.5
              ? "No significant change"
              : `${percentChange.toFixed(0)}%`}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            Relative to current config, based on published model rates
          </p>
        </div>
      </div>
    </div>
  );
}
