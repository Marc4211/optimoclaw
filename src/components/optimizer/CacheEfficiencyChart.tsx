"use client";

import { Zap, CheckCircle2 } from "lucide-react";

export interface CacheBreakdownData {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  tokenTotal: number;
  cacheReadPercent: number;
  cacheWritePercent: number;
  freshInputPercent: number;
  outputPercent: number;
}

interface Props {
  data: CacheBreakdownData;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Token type cost multipliers relative to base input price */
const COST_LABELS: Record<string, { label: string; multiplier: string; color: string; stroke: string }> = {
  cacheRead: {
    label: "Cache Read",
    multiplier: "0.1x input cost",
    color: "bg-emerald-500",
    stroke: "rgb(16 185 129)",
  },
  cacheWrite: {
    label: "Cache Write",
    multiplier: "1.25x input cost",
    color: "bg-orange-500",
    stroke: "rgb(249 115 22)",
  },
  output: {
    label: "Output",
    multiplier: "varies by model",
    color: "bg-gray-600",
    stroke: "rgb(107 114 128)",
  },
};

/**
 * Analyze cache breakdown and return a structured insight.
 *
 * Each insight is OptimoClaw-lever-aware: it either points to a specific
 * lever the user can change, honestly says there's no lever for it, or
 * confirms things are already optimal. No dangling diagnoses.
 */
function getInsight(data: CacheBreakdownData): {
  label: string;
  status: string;
  meaning: string;
  action: string;
  /** Which lever to reference, if any — used for future "jump to lever" linking */
  lever: string | null;
  color: "success" | "warning" | "danger" | "muted";
} {
  if (data.tokenTotal === 0) {
    return {
      label: "No data",
      status: "Waiting for sessions",
      meaning: "No active sessions with token data available.",
      action: "Data will appear once agents start running.",
      lever: null,
      color: "muted",
    };
  }

  const cacheReadPct = data.cacheReadPercent;
  const cacheWritePct = data.cacheWritePercent;

  // Excellent caching (>90% reads)
  if (cacheReadPct > 90) {
    return {
      label: "Excellent cache efficiency",
      status: "Already optimal",
      meaning: `${cacheReadPct.toFixed(0)}% of your tokens are cache reads — the cheapest token type at just 10% of the base input price.`,
      action: "Nothing to change. This is the best-case scenario for cache efficiency.",
      lever: null,
      color: "success",
    };
  }

  // Good caching (60–90% reads)
  if (cacheReadPct > 60) {
    return {
      label: "Good cache efficiency",
      status: "Already optimal",
      meaning: `${cacheReadPct.toFixed(0)}% of tokens are cache reads (10% of input cost). Most of your input is served from cache.`,
      action: "Nothing to change in OptimoClaw. This ratio naturally improves as sessions stay alive longer between conversations.",
      lever: null,
      color: "success",
    };
  }

  // High cache writes (>20%)
  if (cacheWritePct > 20) {
    return {
      label: "Write-heavy snapshot",
      status: "Likely transient",
      meaning: `${cacheWritePct.toFixed(0)}% of tokens are cache writes (1.25× input cost). This is normal when sessions have recently started — cache gets written once, then subsequent messages read from it at 10% cost.`,
      action: "Check again after a few exchanges. If this persists across multiple checks, Session Context Loading and Memory File Scope control how much gets written per session start, and Heartbeat Frequency controls how often sessions restart.",
      lever: null,
      color: "muted",
    };
  }

  // Low cache hit rate (<40% reads)
  if (cacheReadPct < 40) {
    return {
      label: "Low cache reads",
      status: "Likely transient",
      meaning: `Only ${cacheReadPct.toFixed(0)}% of tokens are cache reads. This is typical right after sessions start — the ratio shifts toward reads as conversations mature and subsequent messages hit warm cache.`,
      action: "Check again after a few exchanges. If this persists, Heartbeat Frequency and Session Context Loading in Performance Tuning below affect how often sessions cold-start and how much context each start loads.",
      lever: null,
      color: "muted",
    };
  }

  // Moderate (40–60% reads, writes under 20%)
  return {
    label: "Moderate caching",
    status: "Normal for active sessions",
    meaning: `${cacheReadPct.toFixed(0)}% cache reads, ${cacheWritePct.toFixed(0)}% cache writes. A mix of warm and cold cache — typical for sessions with moderate activity.`,
    action: "This ratio shifts toward more cache reads as sessions stay alive longer between interactions.",
    lever: null,
    color: "muted",
  };
}

export default function CacheEfficiencyChart({ data }: Props) {
  if (data.tokenTotal === 0) return null;

  const insight = getInsight(data);

  // Build donut segments: cache read, cache write, output
  // Combine freshInput into cacheWrite for donut (both are non-cached input costs)
  // or keep them separate — here we show the three main segments matching the reference
  const donutTotal = data.totalCacheRead + data.totalCacheWrite + data.totalOutput;
  const cacheReadFrac = donutTotal > 0 ? data.totalCacheRead / donutTotal : 0;
  const cacheWriteFrac = donutTotal > 0 ? data.totalCacheWrite / donutTotal : 0;
  const outputFrac = donutTotal > 0 ? data.totalOutput / donutTotal : 0;

  const R = 70;
  const CIRCUMFERENCE = 2 * Math.PI * R;

  // Segments drawn clockwise from top (offset by -25% to start at 12 o'clock)
  const segments = [
    { key: "cacheRead", frac: cacheReadFrac, tokens: data.totalCacheRead, ...COST_LABELS.cacheRead },
    { key: "cacheWrite", frac: cacheWriteFrac, tokens: data.totalCacheWrite, ...COST_LABELS.cacheWrite },
    { key: "output", frac: outputFrac, tokens: data.totalOutput, ...COST_LABELS.output },
  ].filter((s) => s.frac > 0.005);

  // Calculate stroke-dasharray and stroke-dashoffset for each segment
  let accumulatedFrac = 0;
  const arcs = segments.map((seg) => {
    const dashLen = CIRCUMFERENCE * seg.frac;
    const gapLen = CIRCUMFERENCE - dashLen;
    const offset = CIRCUMFERENCE * (0.25 - accumulatedFrac);
    accumulatedFrac += seg.frac;
    return { ...seg, dashLen, gapLen, offset };
  });

  const insightColorMap = {
    success: {
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/5",
      icon: "text-emerald-400",
      heading: "text-emerald-300",
      body: "text-emerald-300/70",
    },
    warning: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/5",
      icon: "text-amber-400",
      heading: "text-amber-300",
      body: "text-amber-300/70",
    },
    danger: {
      border: "border-red-500/20",
      bg: "bg-red-500/5",
      icon: "text-red-400",
      heading: "text-red-300",
      body: "text-red-300/70",
    },
    muted: {
      border: "border-border",
      bg: "bg-surface/50",
      icon: "text-muted-foreground",
      heading: "text-foreground/80",
      body: "text-muted-foreground/70",
    },
  };

  const insightStyles = insightColorMap[insight.color];

  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      data-section="cache-efficiency"
      data-cache-read-percent={data.cacheReadPercent.toFixed(1)}
      data-cache-write-percent={data.cacheWritePercent.toFixed(1)}
      data-fresh-input-percent={data.freshInputPercent.toFixed(1)}
      data-output-percent={data.outputPercent.toFixed(1)}
      data-total-cache-read={data.totalCacheRead}
      data-total-cache-write={data.totalCacheWrite}
      data-total-input={data.totalInput}
      data-total-output={data.totalOutput}
      data-token-total={data.tokenTotal}
      data-status={insight.label.toLowerCase().replace(/\s+/g, "-")}
      data-insight={insight.meaning}
      aria-label={`Cache efficiency: ${data.cacheReadPercent.toFixed(0)}% cache reads, ${data.cacheWritePercent.toFixed(0)}% cache writes, ${data.freshInputPercent.toFixed(0)}% fresh input, ${data.outputPercent.toFixed(0)}% output. ${insight.label}: ${insight.meaning} ${insight.action}`}
    >
      {/* Header: title + large cached % with icon */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[15px] text-muted-foreground mb-2 font-normal">
            Cache Efficiency
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-normal text-foreground">
              {data.cacheReadPercent.toFixed(0)}%
            </span>
            <span className="text-[13px] text-muted-foreground/60">cached</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-md bg-muted/10 flex items-center justify-center border border-border">
          <Zap className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      {/* Donut Chart and Legend */}
      <div className="flex items-start gap-8 mb-6" data-list="cache-segments">
        {/* SVG Donut */}
        <div className="relative w-40 h-40 flex-shrink-0">
          <svg className="w-full h-full" viewBox="0 0 160 160">
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={arc.stroke}
                strokeWidth="20"
                strokeDasharray={`${arc.dashLen} ${arc.gapLen}`}
                strokeDashoffset={arc.offset}
                className={arc.key === "output" ? "opacity-60" : "opacity-80"}
              />
            ))}
            {/* Center hole — uses surface color for theme compatibility */}
            <circle
              cx="80"
              cy="80"
              r="50"
              className="fill-surface"
            />
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 pt-2">
          {arcs.map((seg) => (
            <div
              key={seg.key}
              className="flex items-start justify-between"
              data-token-type={seg.key}
              data-tokens={seg.tokens}
              data-percent={(seg.frac * 100).toFixed(1)}
              data-cost-multiplier={seg.multiplier}
              aria-label={`${seg.label}: ${formatTokens(seg.tokens)} tokens (${(seg.frac * 100).toFixed(1)}%), ${seg.multiplier}`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${seg.color} flex-shrink-0`} />
                <p className="text-[13px] text-foreground font-normal">{seg.label}</p>
              </div>
              <div className="text-right">
                <p className="text-[13px] text-muted-foreground font-normal">
                  {formatTokens(seg.tokens)}
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  {seg.multiplier}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic insight box — structured as status / meaning / action */}
      <div
        className={`p-3 ${insightStyles.bg} border ${insightStyles.border} rounded-md`}
        data-insight-label={insight.label}
        data-insight-status={insight.status}
        data-insight-meaning={insight.meaning}
        data-insight-action={insight.action}
      >
        <div className="flex items-start gap-2">
          <CheckCircle2 className={`w-4 h-4 ${insightStyles.icon} flex-shrink-0 mt-0.5`} />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h4 className={`text-[13px] font-medium ${insightStyles.heading}`}>
                {insight.label}
              </h4>
              <span className={`text-[11px] ${insightStyles.body}`}>
                — {insight.status}
              </span>
            </div>
            <p className={`text-[12px] ${insightStyles.body} leading-relaxed`}>
              {insight.meaning}
            </p>
            <p className={`text-[12px] ${insightStyles.heading} leading-relaxed`}>
              → {insight.action}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/40">
        {formatTokens(data.tokenTotal)} total tokens across active sessions ·
        Cache ratio shifts naturally as sessions mature — check multiple times before acting
      </p>
    </div>
  );
}
