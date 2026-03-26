"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCost } from "@/lib/optimizer";

interface CostSummaryProps {
  currentCost: number;
  projectedCost: number;
  hasChanges: boolean;
  onApply: () => void;
  onReset: () => void;
}

export default function CostSummary({
  currentCost,
  projectedCost,
  hasChanges,
  onApply,
  onReset,
}: CostSummaryProps) {
  const delta = projectedCost - currentCost;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-muted-foreground">Current</p>
          <p className="font-mono text-lg font-semibold">
            {formatCost(currentCost)}
            <span className="text-xs font-normal text-muted-foreground">
              /mo
            </span>
          </p>
        </div>

        {hasChanges && (
          <>
            <div className="text-muted-foreground">→</div>
            <div>
              <p className="text-xs text-muted-foreground">Projected</p>
              <p className="font-mono text-lg font-semibold">
                {formatCost(projectedCost)}
                <span className="text-xs font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Change</p>
              <p
                className={`flex items-center gap-1 font-mono text-lg font-semibold ${
                  isDown
                    ? "text-success"
                    : isUp
                      ? "text-danger"
                      : "text-muted-foreground"
                }`}
              >
                {isDown ? (
                  <TrendingDown size={16} />
                ) : isUp ? (
                  <TrendingUp size={16} />
                ) : (
                  <Minus size={16} />
                )}
                {delta > 0 ? "+" : ""}
                {formatCost(delta)}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasChanges && (
          <button
            onClick={onReset}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Reset
          </button>
        )}
        <button
          onClick={onApply}
          disabled={!hasChanges}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}
