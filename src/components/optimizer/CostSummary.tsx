"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp, Minus, ChevronDown, Info, AlertCircle } from "lucide-react";
import { lookupRate } from "@/lib/rate-card";
import { Agent } from "@/types";

/** Token usage aggregated by model — from the sessions API */
export interface ModelTokenUsage {
  model: string;
  totalTokens: number;
  sessionCount: number;
}

interface CostSummaryProps {
  /** Percentage change from base config. 0 = no change, -30 = 30% cheaper, +50 = 50% more expensive */
  percentChange: number;
  hasChanges: boolean;
  /** Agents with their current model assignments */
  agents: Agent[];
  /** The global default model string */
  globalDefaultModel?: string;
  /** Token usage by model for sorting — most-used model first */
  tokensByModel?: ModelTokenUsage[];
}

function formatCostShort(perMillion: number): string {
  if (perMillion === 0) return "$0";
  return `$${perMillion}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CostSummary({
  percentChange,
  hasChanges,
  agents,
  globalDefaultModel,
  tokensByModel,
}: CostSummaryProps) {
  const isUp = percentChange > 0.5;
  const isDown = percentChange < -0.5;
  const [showWhyNoDollars, setShowWhyNoDollars] = useState(false);

  // --- No changes state: show model routing overview + explainer ---
  if (!hasChanges) {
    // Build model routing entries — group agents by their effective model
    const entries = agents.map((a) => ({
      name: a.name,
      model: a.model,
      isDefault: globalDefaultModel ? a.model === globalDefaultModel : false,
    }));

    // Build a token usage lookup from session data (model string → total tokens)
    const tokenLookup = new Map<string, number>();
    if (tokensByModel) {
      for (const m of tokensByModel) {
        tokenLookup.set(m.model, m.totalTokens);
      }
    }

    // Group by model for a compact view
    const byModel = new Map<string, { model: string; agents: string[]; hasDefault: boolean; tokens: number }>();
    for (const entry of entries) {
      const key = entry.model || "unknown";
      const existing = byModel.get(key);
      if (existing) {
        existing.agents.push(entry.name);
        if (entry.isDefault) existing.hasDefault = true;
      } else {
        // Match token data — try exact match, then substring match
        let tokens = tokenLookup.get(key) ?? 0;
        if (tokens === 0) {
          for (const [tModel, tTokens] of tokenLookup) {
            if (key.includes(tModel) || tModel.includes(key)) {
              tokens = tTokens;
              break;
            }
          }
        }
        byModel.set(key, {
          model: key,
          agents: [entry.name],
          hasDefault: entry.isDefault,
          tokens,
        });
      }
    }

    // Sort by token usage (most tokens first). Fall back to cost tier if no usage data.
    const hasTokenData = Array.from(byModel.values()).some((g) => g.tokens > 0);
    const groups = Array.from(byModel.values()).sort((a, b) => {
      if (hasTokenData) return b.tokens - a.tokens;
      const rateA = lookupRate(a.model);
      const rateB = lookupRate(b.model);
      return (rateB?.outputPerMillion ?? 0) - (rateA?.outputPerMillion ?? 0);
    });

    // Determine "Recommended" model: cheapest non-free model with the most agents
    const recommendedModel = (() => {
      const nonFree = groups.filter((g) => {
        const rate = lookupRate(g.model);
        return rate && (rate.inputPerMillion > 0 || rate.outputPerMillion > 0);
      });
      if (nonFree.length === 0) return null;
      // Sort by agent count descending, then by cost ascending
      const sorted = [...nonFree].sort((a, b) => {
        const diff = b.agents.length - a.agents.length;
        if (diff !== 0) return diff;
        const rateA = lookupRate(a.model);
        const rateB = lookupRate(b.model);
        return (rateA?.outputPerMillion ?? 0) - (rateB?.outputPerMillion ?? 0);
      });
      return sorted[0]?.model ?? null;
    })();

    return (
      <div className="space-y-3">
        {/* Model routing overview — outer card */}
        <div
          className="rounded-lg border border-border bg-surface p-5"
          data-section="model-routing"
          data-model-count={groups.length}
          data-agent-count={entries.length}
          aria-label={`Model routing: ${groups.length} models across ${entries.length} agents`}
        >
          {entries.length > 0 ? (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">Your Model Routing</p>

              {/* Inner darker card with model rows */}
              <div
                className="rounded-md border border-border/50 bg-background"
                data-list="model-routes"
              >
                {groups.map((group, index) => {
                  const rate = lookupRate(group.model);
                  const agentCount = group.agents.length;
                  const isRecommended = group.model === recommendedModel;
                  return (
                    <div key={group.model}>
                      <div
                        className="flex items-center justify-between p-4 transition-colors hover:bg-surface-hover"
                        data-model={group.model}
                        data-model-display={rate?.displayName ?? group.model}
                        data-agents={group.agents.join(",")}
                        data-agent-count={agentCount}
                        data-tokens={group.tokens}
                        data-is-default={group.hasDefault}
                        data-input-cost-per-mtok={rate?.inputPerMillion ?? "unknown"}
                        data-output-cost-per-mtok={rate?.outputPerMillion ?? "unknown"}
                        aria-label={`${rate?.displayName ?? group.model}: ${agentCount} agent${agentCount !== 1 ? "s" : ""}, ${group.tokens > 0 ? formatTokens(group.tokens) + " tokens" : "no token data"}${group.hasDefault ? ", global default" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-foreground">
                              {rate?.displayName ?? group.model.split("/").pop() ?? group.model}
                            </span>
                            {rate && (
                              <span className="text-xs text-muted-foreground/50">
                                {formatCostShort(rate.inputPerMillion)} / {formatCostShort(rate.outputPerMillion)}
                              </span>
                            )}
                            {isRecommended && (
                              <span className="rounded px-2 py-0.5 bg-success/10 text-success text-[11px]">
                                Recommended
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[13px] text-muted-foreground/60">
                            {agentCount === 1 ? (
                              <span className="capitalize">{group.agents[0]}</span>
                            ) : agentCount <= 3 ? (
                              group.agents.map((name, i) => (
                                <span key={name}>
                                  {i > 0 && ", "}
                                  <span className="capitalize">{name}</span>
                                </span>
                              ))
                            ) : (
                              <span>{agentCount} agents</span>
                            )}
                            {group.hasDefault && agentCount > 0 && (
                              <span className="text-muted-foreground/40"> · global default</span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {group.tokens > 0 ? (
                            <div>
                              <div className="text-xl text-foreground">
                                {group.tokens.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-muted-foreground/50">tokens</div>
                            </div>
                          ) : (
                            <span className="rounded-full bg-muted/30 px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                              {agentCount}
                            </span>
                          )}
                        </div>
                      </div>
                      {index < groups.length - 1 && (
                        <div className="border-b border-border/50" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* "Why no dollar figures?" collapsible button */}
              <button
                onClick={() => setShowWhyNoDollars((p) => !p)}
                className="mt-4 flex w-full items-center gap-2 rounded-md border border-border/50 bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover"
              >
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-muted-foreground/50 transition-transform ${showWhyNoDollars ? "rotate-180" : ""}`}
                />
                <span className="flex-1 text-[13px] text-muted-foreground">
                  Why don&apos;t we show dollar figures?
                </span>
              </button>

              {showWhyNoDollars && (
                <div className="mt-3 rounded-lg border border-warning/20 bg-background p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-warning" />
                    <div>
                      <h4 className="text-sm text-warning mb-2">Cost Estimation Complexity</h4>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        Provider bills include costs that aren&apos;t reflected in token counts — web
                        search tool calls, code execution, cache write premiums, retry overhead, and
                        other per-request charges. Token-based estimates systematically undercount. In
                        testing, a $170 Anthropic bill corresponded to just $15 in token-calculated
                        costs — an 11x gap. We show percentage impact instead, since the rate-card
                        ratios between models are exact even when absolute dollar amounts aren&apos;t.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Adjust the levers below to see estimated impact on token costs.
            </p>
          )}
        </div>

        {/* Subtle blue info box */}
        <div className="flex items-start gap-3 rounded-md border border-blue-500/20 bg-blue-500/5 p-3">
          <Info size={16} className="shrink-0 mt-0.5 text-blue-400" />
          <p className="text-[13px] text-blue-300/80">
            Adjust model routing below to see estimated cost impact
          </p>
        </div>
      </div>
    );
  }

  // --- Changes pending: show percentage impact ---
  const direction = isDown ? "decrease" : isUp ? "increase" : "neutral";
  return (
    <div
      className="rounded-lg border border-border bg-surface p-4"
      data-section="cost-impact"
      data-percent-change={percentChange.toFixed(1)}
      data-direction={direction}
      aria-label={`Estimated token cost impact: ${Math.abs(percentChange) < 0.5 ? "no significant change" : `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(0)}% ${direction}`}`}
    >
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
