"use client";

interface ContextSession {
  agentId: string;
  model: string;
  kind: string;
  totalTokens: number;
  contextTokens: number;
  percentUsed: number;
  remainingTokens: number;
}

export interface ContextUtilizationData {
  sessions: ContextSession[];
  avgPercentUsed: number;
  totalContextAvailable: number;
  totalContextUsed: number;
}

interface Props {
  data: ContextUtilizationData;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Analyze utilization and return a dynamic insight */
function getInsight(data: ContextUtilizationData): {
  label: string;
  detail: string;
  color: "success" | "warning" | "danger" | "muted";
} {
  const avg = data.avgPercentUsed;

  // Check for oversized windows — sessions with large windows but tiny usage
  const oversized = data.sessions.filter(
    (s) => s.contextTokens >= 500_000 && s.percentUsed < 15
  );

  if (oversized.length > 0 && avg < 10) {
    const biggest = oversized.reduce((a, b) =>
      a.contextTokens > b.contextTokens ? a : b
    );
    return {
      label: "Over-provisioned",
      detail: `Using ${formatTokens(biggest.totalTokens)} of a ${formatWindow(biggest.contextTokens)} context window (${biggest.percentUsed}%). A smaller window reduces cache write costs on every session refresh. Consider whether these sessions need the extended context.`,
      color: "warning",
    };
  }

  if (avg < 15) {
    return {
      label: "Low utilization",
      detail: `Sessions are averaging ${avg.toFixed(0)}% of their context windows. If this is typical, reducing context window sizes could lower cache write costs — the gateway re-caches the full window on each write, so smaller windows mean cheaper refreshes.`,
      color: "warning",
    };
  }

  if (avg < 40) {
    return {
      label: "Comfortable headroom",
      detail: `Sessions are using about ${avg.toFixed(0)}% of available context. There's room for longer conversations before compaction kicks in. Current window sizes look reasonable for this workload.`,
      color: "success",
    };
  }

  if (avg < 75) {
    return {
      label: "Healthy utilization",
      detail: `Context windows are ${avg.toFixed(0)}% utilized on average — a good balance between having room to work and not over-provisioning. Compaction settings are worth tuning at this level to manage when sessions get summarized.`,
      color: "success",
    };
  }

  if (avg < 90) {
    return {
      label: "Running warm",
      detail: `Sessions are using ${avg.toFixed(0)}% of their context windows. Compaction will trigger more frequently as sessions grow. Consider increasing the context window or tuning compaction thresholds to avoid mid-conversation summarization.`,
      color: "warning",
    };
  }

  return {
    label: "Near capacity",
    detail: `Context windows are ${avg.toFixed(0)}% full on average. Sessions are likely hitting compaction frequently, which can cause context loss and adds summarization token costs. Consider larger context windows or more aggressive session pruning.`,
    color: "danger",
  };
}

export default function ContextUtilizationChart({ data }: Props) {
  if (data.sessions.length === 0) return null;

  const insight = getInsight(data);

  // Sort sessions by window size descending (biggest opportunity first)
  const sorted = [...data.sessions].sort(
    (a, b) => b.contextTokens - a.contextTokens
  );

  // Color for the utilization bar
  const barColor = (pct: number) => {
    if (pct < 15) return "bg-amber-400/70";
    if (pct < 75) return "bg-emerald-400/70";
    if (pct < 90) return "bg-amber-400/70";
    return "bg-red-400/70";
  };

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
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Context Utilization
        </p>
        <span className="font-mono text-lg font-semibold text-foreground">
          {data.avgPercentUsed.toFixed(0)}%
          <span className="ml-1 text-xs font-normal text-muted-foreground">avg</span>
        </span>
      </div>

      {/* Per-session bars */}
      <div className="mt-3 space-y-2">
        {sorted.map((session) => (
          <div key={session.agentId + session.kind}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="capitalize text-foreground/80">
                {session.agentId}
                <span className="ml-1 text-muted-foreground/50">
                  {session.kind === "direct" ? "main" : session.kind}
                </span>
              </span>
              <span className="font-mono text-muted-foreground/70">
                {formatTokens(session.totalTokens)}
                <span className="text-muted-foreground/40">
                  {" / "}
                  {formatWindow(session.contextTokens)}
                </span>
              </span>
            </div>
            <div className="mt-0.5 h-2 w-full rounded-full bg-muted/20">
              <div
                className={`h-full rounded-full transition-all ${barColor(session.percentUsed)}`}
                style={{ width: `${Math.max(1, session.percentUsed)}%` }}
              />
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
        Based on {data.sessions.length} active session{data.sessions.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
