"use client";

import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatCost } from "@/lib/optimizer";

interface SessionSummary {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  sessionCount: number;
  byModel: Array<{ model: string; inputTokens: number; outputTokens: number; totalTokens: number }>;
  byAgent: Array<{ agentId: string; inputTokens: number; outputTokens: number; totalTokens: number; models: string[] }>;
}

interface CostSummaryProps {
  /** Estimated spend from real gateway token usage × rate card. Null if not loaded yet. */
  actualCost: number | null;
  /** Source of actualCost */
  actualSource?: "gateway";
  /** Projected cost when levers change — rate card × modified config */
  projectedCost: number;
  hasChanges: boolean;
  /** Session summary from gateway for token breakdown */
  sessionSummary?: SessionSummary | null;
  /** Whether sessions are still loading */
  sessionsLoading?: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CostSummary({
  actualCost,
  projectedCost,
  hasChanges,
  sessionSummary,
  sessionsLoading,
}: CostSummaryProps) {
  const hasActual = actualCost !== null && actualCost > 0;
  const displayCost = hasChanges ? projectedCost : (actualCost ?? projectedCost);
  const delta = hasChanges && hasActual ? projectedCost - actualCost : 0;
  const isUp = delta > 0.01;
  const isDown = delta < -0.01;

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4"
      data-cost={displayCost.toFixed(2)}
    >
      <div className="flex flex-wrap items-center gap-6">
        {/* Primary cost — from real tokens when available */}
        <div>
          <p className="text-xs text-muted-foreground">
            {sessionsLoading
              ? "Loading token data..."
              : hasChanges
                ? "Projected"
                : hasActual
                  ? "Estimated Spend"
                  : "Estimated"}
          </p>
          {sessionsLoading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-muted/50 mt-1" />
          ) : (
            <p className="font-mono text-2xl font-semibold">
              {formatCost(displayCost)}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            {sessionsLoading
              ? "Fetching from gateway..."
              : hasActual
                ? "Real token usage \u00d7 published rates"
                : "Config estimate \u00d7 published rates"}
          </p>
        </div>

        {/* Delta when levers change */}
        {hasChanges && hasActual && (
          <>
            <div className="text-muted-foreground">&rarr;</div>
            <div>
              <p className="text-xs text-muted-foreground">With changes</p>
              <p className="font-mono text-lg font-semibold">
                {formatCost(projectedCost)}
              </p>
            </div>
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

      {/* Token breakdown from gateway sessions */}
      {sessionSummary && sessionSummary.totalTokens > 0 && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{formatTokens(sessionSummary.totalTokens)}</span> total tokens
            </span>
            <span>
              <span className="font-medium text-foreground">{formatTokens(sessionSummary.totalInput)}</span> input
            </span>
            <span>
              <span className="font-medium text-foreground">{formatTokens(sessionSummary.totalOutput)}</span> output
            </span>
            <span>
              <span className="font-medium text-foreground">{sessionSummary.sessionCount}</span> sessions
            </span>
          </div>
          {sessionSummary.byModel.length > 0 && (
            <div className="mt-2 space-y-1">
              {sessionSummary.byModel.slice(0, 4).map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between text-[11px] text-muted-foreground"
                >
                  <span className="font-mono truncate max-w-[200px]">{m.model}</span>
                  <span>{formatTokens(m.totalTokens)} tokens</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
