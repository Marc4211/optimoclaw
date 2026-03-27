"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCost } from "@/lib/optimizer";

interface CostSummaryProps {
  /** Fixed actual spend — does NOT change with levers */
  actualCost: number | null;
  /** Source of actualCost: "admin-api" or "gateway" */
  actualSource?: "admin-api" | "gateway";
  /** Projected/estimated cost — updates as user changes levers */
  projectedCost: number;
  hasChanges: boolean;
}

export default function CostSummary({
  actualCost,
  actualSource,
  projectedCost,
  hasChanges,
}: CostSummaryProps) {
  const hasActual = actualCost !== null && actualCost > 0;
  const delta = hasChanges && hasActual ? projectedCost - actualCost : 0;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4"
      data-actual={hasActual ? actualCost!.toFixed(2) : ""}
      data-projected={projectedCost.toFixed(2)}
      data-delta={hasChanges && hasActual ? delta.toFixed(2) : ""}
    >
      <div className="flex flex-wrap items-center gap-6">
        {/* Actual — fixed, never moves with levers */}
        {hasActual && (
          <div>
            <p className="text-xs text-muted-foreground">
              {actualSource === "gateway"
                ? "Actual (from gateway)"
                : "Actual (last 30 days)"}
            </p>
            <p className="font-mono text-lg font-semibold">
              {formatCost(actualCost)}
              <span className="text-xs font-normal text-muted-foreground">
                /mo
              </span>
            </p>
          </div>
        )}

        {/* Separator between actual and projected */}
        {hasActual && (
          <div className="text-muted-foreground">&rarr;</div>
        )}

        {/* Projected — always visible, updates with lever changes */}
        <div>
          <p className="text-xs text-muted-foreground">
            {hasActual ? "Projected" : "Estimated"}
          </p>
          <p className="font-mono text-lg font-semibold">
            {formatCost(projectedCost)}
            <span className="text-xs font-normal text-muted-foreground">
              /mo
            </span>
          </p>
        </div>

        {/* Delta — only when actual is available and levers changed */}
        {hasChanges && hasActual && (
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
        )}
      </div>

      {/* Apply/Reset moved to sticky bottom bar */}
    </div>
  );
}
