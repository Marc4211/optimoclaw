"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp, Minus, ChevronDown, Info } from "lucide-react";
import { lookupRate } from "@/lib/rate-card";

interface ModelTokenBreakdown {
  model: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AgentTokenBreakdown {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  models: string[];
}

export interface SessionSummary {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  sessionCount: number;
  byModel: ModelTokenBreakdown[];
  byAgent: AgentTokenBreakdown[];
}

interface CostSummaryProps {
  /** Percentage change from base config. 0 = no change, -30 = 30% cheaper, +50 = 50% more expensive */
  percentChange: number;
  hasChanges: boolean;
  /** Token usage summary from active sessions — shown when no changes are pending */
  sessionSummary?: SessionSummary | null;
  /** Whether session data is still loading */
  sessionsLoading?: boolean;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CostSummary({
  percentChange,
  hasChanges,
  sessionSummary,
  sessionsLoading,
}: CostSummaryProps) {
  const isUp = percentChange > 0.5;
  const isDown = percentChange < -0.5;
  const [showWhyNoDollars, setShowWhyNoDollars] = useState(false);

  // --- No changes state: show token breakdown + explainer ---
  if (!hasChanges) {
    const hasSessions = sessionSummary && sessionSummary.sessionCount > 0;

    return (
      <div className="space-y-3">
        {/* Token usage breakdown */}
        <div className="rounded-lg border border-border bg-surface p-4">
          {sessionsLoading ? (
            <div className="space-y-3">
              <div className="h-4 w-48 animate-pulse rounded bg-muted/30" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted/20" />
            </div>
          ) : hasSessions ? (
            <div className="space-y-4">
              {/* Header with totals */}
              <div>
                <p className="text-xs font-medium text-muted-foreground">Active Session Tokens</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="font-mono text-2xl font-semibold text-foreground">
                    {formatTokens(sessionSummary!.totalTokens)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    across {sessionSummary!.sessionCount} session{sessionSummary!.sessionCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                  <span>
                    <span className="font-medium text-foreground/70">{formatTokens(sessionSummary!.totalInput)}</span> input
                  </span>
                  <span>
                    <span className="font-medium text-foreground/70">{formatTokens(sessionSummary!.totalOutput)}</span> output
                  </span>
                </div>
              </div>

              {/* By-model breakdown */}
              {sessionSummary!.byModel.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    By Model
                  </p>
                  <div className="space-y-1.5">
                    {sessionSummary!.byModel
                      .sort((a, b) => b.totalTokens - a.totalTokens)
                      .map((m) => {
                        const rate = lookupRate(`${m.modelProvider}/${m.model}`);
                        const pct = sessionSummary!.totalTokens > 0
                          ? (m.totalTokens / sessionSummary!.totalTokens) * 100
                          : 0;
                        return (
                          <div key={m.model} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground/90">
                                  {rate?.displayName ?? m.model}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                  {m.modelProvider}
                                </span>
                              </div>
                              {/* Bar */}
                              <div className="mt-0.5 h-1.5 w-full rounded-full bg-muted/20">
                                <div
                                  className="h-full rounded-full bg-primary/40"
                                  style={{ width: `${Math.max(2, pct)}%` }}
                                />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="font-mono text-xs font-medium text-foreground/80">
                                {formatTokens(m.totalTokens)}
                              </span>
                              <span className="ml-1 font-mono text-[10px] text-muted-foreground/50">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* By-agent breakdown */}
              {sessionSummary!.byAgent.length > 1 && (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    By Agent
                  </p>
                  <div className="space-y-1.5">
                    {sessionSummary!.byAgent
                      .sort((a, b) => b.totalTokens - a.totalTokens)
                      .map((a) => {
                        const pct = sessionSummary!.totalTokens > 0
                          ? (a.totalTokens / sessionSummary!.totalTokens) * 100
                          : 0;
                        return (
                          <div key={a.agentId} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium text-foreground/90 capitalize">
                                  {a.agentId}
                                </span>
                                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                                  {a.models.length} model{a.models.length !== 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="mt-0.5 h-1.5 w-full rounded-full bg-muted/20">
                                <div
                                  className="h-full rounded-full bg-success/40"
                                  style={{ width: `${Math.max(2, pct)}%` }}
                                />
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="font-mono text-xs font-medium text-foreground/80">
                                {formatTokens(a.totalTokens)}
                              </span>
                              <span className="ml-1 font-mono text-[10px] text-muted-foreground/50">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/50">
                Active sessions only · adjust the levers below to see estimated impact
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Adjust the levers below to see estimated impact on token costs.
            </p>
          )}
        </div>

        {/* "Why no dollar figures?" collapsible */}
        <button
          onClick={() => setShowWhyNoDollars((p) => !p)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-border/50 bg-surface/50 px-3 py-2 text-left text-xs text-muted-foreground/70 transition-colors hover:bg-surface hover:text-muted-foreground"
        >
          <Info size={13} className="shrink-0" />
          <span className="flex-1">Why don&apos;t we show dollar figures?</span>
          <ChevronDown
            size={13}
            className={`shrink-0 transition-transform ${showWhyNoDollars ? "rotate-180" : ""}`}
          />
        </button>
        {showWhyNoDollars && (
          <div className="rounded-lg border border-border/50 bg-surface/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground/80">
            <p className="mb-2">
              <span className="font-medium text-foreground/70">There is no reliable way to deliver an accurate dollar figure for a single gateway.</span>
            </p>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>
                Provider bills include costs that aren&apos;t reflected in token counts — web search
                tool calls, code execution, cache write premiums, retry overhead, and other
                per-request charges.
              </li>
              <li>
                If you run multiple gateways (or other projects) on the same API key, the
                provider&apos;s billing total covers everything — there&apos;s no way to isolate
                what one gateway actually cost.
              </li>
              <li>
                Token-based estimates systematically undercount. In testing, a $170 Anthropic bill
                corresponded to just $15 in token-calculated costs — an 11× gap.
              </li>
            </ul>
            <p className="mt-2">
              Instead, we show <span className="font-medium text-foreground/70">percentage impact</span> when
              you change model routing. This tells you the relative savings or increase accurately,
              since the rate-card ratios between models are exact — even when absolute dollar amounts aren&apos;t.
            </p>
          </div>
        )}
      </div>
    );
  }

  // --- Changes pending: show percentage impact ---
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
