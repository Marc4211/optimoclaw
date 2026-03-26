"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCost } from "@/lib/optimizer";

interface CostSummaryProps {
  /** Fixed actual spend from Admin API — does NOT change with levers */
  actualCost: number | null;
  /** Projected cost — updates as user changes levers */
  projectedCost: number;
  hasChanges: boolean;
  onApply: () => void;
  onReset: () => void;
}

export default function CostSummary({
  actualCost,
  projectedCost,
  hasChanges,
  onApply,
  onReset,
}: CostSummaryProps) {
  // Delta is only meaningful when we have actual spend to compare against
  const baseline = actualCost ?? projectedCost;
  const delta = hasChanges ? projectedCost - baseline : 0;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-6">
        {/* Actual — fixed, from Admin API */}
        <div>
          <p className="text-xs text-muted-foreground">
            {actualCost !== null ? "Actual (last 30 days)" : "Estimated"}
          </p>
          <p className="font-mono text-lg font-semibold">
            {formatCost(baseline)}
            <span className="text-xs font-normal text-muted-foreground">
              /mo
            </span>
          </p>
        </div>

        {/* Projected — only shows when levers have been changed */}
        {hasChanges && (
          <>
            <div className="text-muted-foreground">&rarr;</div>
            <div>
              <p className="text-xs text-muted-foreground">Projected</p>
              <p className="font-mono text-lg font-semibold">
                {formatCost(projectedCost)}
                <span className="text-xs font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
            </div>

            {/* Delta */}
            <div>
              <p className="text-xs text-muted-foreground">Delta</p>
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
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30"
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}
