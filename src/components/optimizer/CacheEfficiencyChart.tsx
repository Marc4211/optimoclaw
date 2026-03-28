"use client";

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
const COST_LABELS: Record<string, { label: string; multiplier: string; color: string }> = {
  cacheRead: {
    label: "Cache Read",
    multiplier: "0.1x input cost",
    color: "bg-emerald-400/80",
  },
  cacheWrite: {
    label: "Cache Write",
    multiplier: "1.25x input cost",
    color: "bg-amber-400/80",
  },
  freshInput: {
    label: "Fresh Input",
    multiplier: "1x input cost",
    color: "bg-blue-400/80",
  },
  output: {
    label: "Output",
    multiplier: "varies by model",
    color: "bg-violet-400/80",
  },
};

/** Analyze cache breakdown and return a dynamic insight */
function getInsight(data: CacheBreakdownData): {
  label: string;
  detail: string;
  color: "success" | "warning" | "danger" | "muted";
} {
  if (data.tokenTotal === 0) {
    return {
      label: "No data",
      detail: "No active sessions with token data available.",
      color: "muted",
    };
  }

  const cacheReadPct = data.cacheReadPercent;
  const cacheWritePct = data.cacheWritePercent;
  const freshPct = data.freshInputPercent;

  // Excellent caching
  if (cacheReadPct > 90) {
    return {
      label: "Excellent cache efficiency",
      detail: `${cacheReadPct.toFixed(0)}% of tokens are cache reads — the cheapest token type at 10% of input cost. Your sessions are heavily leveraging cached context, meaning most input tokens cost a fraction of their list price. This is the ideal pattern.`,
      color: "success",
    };
  }

  // Good caching
  if (cacheReadPct > 60) {
    return {
      label: "Good cache efficiency",
      detail: `${cacheReadPct.toFixed(0)}% of tokens are cache reads (10% of input cost). Cache is working well. The remaining ${(freshPct + cacheWritePct).toFixed(0)}% is fresh input and cache writes, which are more expensive. Longer-lived sessions tend to improve this ratio.`,
      color: "success",
    };
  }

  // High cache writes — expensive
  if (cacheWritePct > 20) {
    return {
      label: "High cache write ratio",
      detail: `${cacheWritePct.toFixed(0)}% of tokens are cache writes, which cost 1.25x input price. This typically happens with frequent session refreshes or short-lived sessions that keep re-caching context. Longer session lifetimes or cache-ttl pruning can shift more tokens to cheaper cache reads.`,
      color: "warning",
    };
  }

  // Low cache hit rate
  if (cacheReadPct < 40) {
    return {
      label: "Low cache utilization",
      detail: `Only ${cacheReadPct.toFixed(0)}% of tokens are cache reads. Most input is being sent fresh at full price. Check that prompt caching is enabled and that sessions persist long enough to benefit from cached context. Each new session starts cold and must re-cache everything.`,
      color: "warning",
    };
  }

  // Moderate — nothing notable
  return {
    label: "Moderate caching",
    detail: `${cacheReadPct.toFixed(0)}% cache reads, ${cacheWritePct.toFixed(0)}% cache writes, ${freshPct.toFixed(0)}% fresh input. There may be room to improve cache utilization — longer session lifetimes and proper cache TTL configuration can shift more tokens to the cheapest tier.`,
    color: "muted",
  };
}

export default function CacheEfficiencyChart({ data }: Props) {
  if (data.tokenTotal === 0) return null;

  const insight = getInsight(data);

  // Build segments for the stacked bar
  const segments = [
    {
      key: "cacheRead",
      percent: data.cacheReadPercent,
      tokens: data.totalCacheRead,
      ...COST_LABELS.cacheRead,
    },
    {
      key: "cacheWrite",
      percent: data.cacheWritePercent,
      tokens: data.totalCacheWrite,
      ...COST_LABELS.cacheWrite,
    },
    {
      key: "freshInput",
      percent: data.freshInputPercent,
      tokens: data.totalInput,
      ...COST_LABELS.freshInput,
    },
    {
      key: "output",
      percent: data.outputPercent,
      tokens: data.totalOutput,
      ...COST_LABELS.output,
    },
  ].filter((s) => s.percent > 0.5); // Only show segments with meaningful %

  const insightBorder = {
    success: "border-emerald-500/30",
    warning: "border-amber-500/30",
    danger: "border-red-500/30",
    muted: "border-border",
  }[insight.color];

  const insightDot = {
    success: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-red-400",
    muted: "bg-muted-foreground",
  }[insight.color];

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4"
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
      data-insight={insight.detail}
      aria-label={`Cache efficiency: ${data.cacheReadPercent.toFixed(0)}% cache reads, ${data.cacheWritePercent.toFixed(0)}% cache writes, ${data.freshInputPercent.toFixed(0)}% fresh input, ${data.outputPercent.toFixed(0)}% output. ${insight.label}: ${insight.detail}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Cache Efficiency
        </p>
        <span className="font-mono text-lg font-semibold text-foreground">
          {data.cacheReadPercent.toFixed(0)}%
          <span className="ml-1 text-xs font-normal text-muted-foreground">cached</span>
        </span>
      </div>

      {/* Stacked bar */}
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted/20">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.color} transition-all`}
            style={{ width: `${seg.percent}%` }}
            title={`${seg.label}: ${formatTokens(seg.tokens)} (${seg.percent.toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5" data-list="cache-segments">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="flex items-center gap-2"
            data-token-type={seg.key}
            data-tokens={seg.tokens}
            data-percent={seg.percent.toFixed(1)}
            data-cost-multiplier={seg.multiplier}
            aria-label={`${seg.label}: ${formatTokens(seg.tokens)} tokens (${seg.percent.toFixed(1)}%), ${seg.multiplier}`}
          >
            <div className={`h-2 w-2 shrink-0 rounded-sm ${seg.color}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[11px] text-foreground/80">
                  {seg.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
                  {formatTokens(seg.tokens)}
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground/40">
                {seg.multiplier}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic insight */}
      <div className={`mt-3 rounded-md border ${insightBorder} bg-surface/50 px-3 py-2`}>
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${insightDot}`} />
          <span className="text-xs font-medium text-foreground/80">
            {insight.label}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">
          {insight.detail}
        </p>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground/40">
        {formatTokens(data.tokenTotal)} total tokens across active sessions
      </p>
    </div>
  );
}
