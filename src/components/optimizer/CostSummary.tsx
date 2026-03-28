"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCost } from "@/lib/optimizer";
import { ProviderSpend } from "@/types/rates";

interface CostSummaryProps {
  /** Fixed actual spend from billing API — does NOT change with levers. Optional. */
  actualCost: number | null;
  /** Source of actualCost: "admin-api" or "gateway" */
  actualSource?: "admin-api" | "gateway";
  /** Estimated cost from rate card × config — updates as user changes levers */
  projectedCost: number;
  hasChanges: boolean;
  /** Per-provider spend breakdown (from optional billing API connections) */
  providerSpend?: ProviderSpend[];
}

export default function CostSummary({
  actualCost,
  actualSource,
  projectedCost,
  hasChanges,
  providerSpend,
}: CostSummaryProps) {
  const hasActual = actualCost !== null && actualCost > 0;
  const delta = hasChanges && hasActual ? projectedCost - actualCost : 0;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;

  // Build source label from connected providers (billing API = optional context)
  const connectedProviders = (providerSpend ?? [])
    .filter((s) => s.source === "admin-api" && s.monthlyEstimate > 0)
    .map((s) => {
      const name = s.provider === "anthropic" ? "Anthropic" : s.provider === "openai" ? "OpenAI" : s.provider;
      return name;
    });

  const sourceLabel = connectedProviders.length > 0
    ? `${connectedProviders.join(" + ")} billing`
    : actualSource === "gateway"
      ? "from gateway"
      : "last 30 days";

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
              Actual ({sourceLabel})
            </p>
            <p className="font-mono text-lg font-semibold">
              {formatCost(actualCost)}
              <span className="text-xs font-normal text-muted-foreground">
                /mo
              </span>
            </p>
            {/* Per-provider breakdown when multiple providers */}
            {providerSpend && providerSpend.filter(s => s.monthlyEstimate > 0).length > 1 && (
              <div className="mt-1 space-y-0.5">
                {providerSpend
                  .filter((s) => s.monthlyEstimate > 0)
                  .map((s) => (
                    <p key={s.provider} className="text-[10px] text-muted-foreground/70">
                      {s.provider === "anthropic" ? "Anthropic" : s.provider === "openai" ? "OpenAI" : s.provider}:{" "}
                      {formatCost(s.monthlyEstimate)}/mo
                      {s.source === "admin-api" ? "" : " (est.)"}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Separator between actual and projected */}
        {hasActual && (
          <div className="text-muted-foreground">&rarr;</div>
        )}

        {/* Estimated / Projected — always visible, updates with lever changes */}
        <div>
          <p className="text-xs text-muted-foreground">
            {hasActual && hasChanges ? "Projected" : "Estimated"}
          </p>
          <p className="font-mono text-lg font-semibold">
            {formatCost(projectedCost)}
            <span className="text-xs font-normal text-muted-foreground">
              /mo
            </span>
          </p>
          {!hasActual && (
            <p className="text-[10px] text-muted-foreground/60">
              Based on published rates
            </p>
          )}
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
