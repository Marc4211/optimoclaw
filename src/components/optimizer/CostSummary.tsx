"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp, Minus, ChevronDown, Info } from "lucide-react";
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

function formatRate(input: number, output: number): string {
  return `$${input}/$${output} per MTok`;
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

    return (
      <div className="space-y-3">
        {/* Model routing overview */}
        <div
          className="rounded-lg border border-border bg-surface p-4"
          data-section="model-routing"
          data-model-count={groups.length}
          data-agent-count={entries.length}
          aria-label={`Model routing: ${groups.length} models across ${entries.length} agents`}
        >
          {entries.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Your Model Routing</p>
              <div className="space-y-2" data-list="model-routes">
                {groups.map((group) => {
                  const rate = lookupRate(group.model);
                  const agentCount = group.agents.length;
                  return (
                    <div
                      key={group.model}
                      className="flex items-start gap-3"
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
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground/90">
                            {rate?.displayName ?? group.model.split("/").pop() ?? group.model}
                          </span>
                          {rate && (
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">
                              {formatRate(rate.inputPerMillion, rate.outputPerMillion)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground/70">
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
                          <span className="font-mono text-xs font-medium text-foreground/70">
                            {formatTokens(group.tokens)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted/30 px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                            {agentCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground/50">
                Adjust model routing below to see estimated cost impact
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
