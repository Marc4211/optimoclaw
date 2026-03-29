"use client";

import { TrendingUp, CheckCircle2 } from "lucide-react";

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

  // Check for mixed window sizes across sessions
  const windowSizes = [...new Set(data.sessions.map((s) => s.contextTokens))];
  const hasMixedWindows = windowSizes.length > 1;

  // Check for oversized windows — sessions with large windows but tiny usage
  const oversized = data.sessions.filter(
    (s) => s.contextTokens >= 500_000 && s.percentUsed < 15
  );
  const rightsized = data.sessions.filter(
    (s) => s.contextTokens < 500_000
  );

  if (oversized.length > 0 && avg < 10) {
    const windowList = windowSizes
      .sort((a, b) => b - a)
      .map((w) => formatWindow(w))
      .join(" and ");

    if (hasMixedWindows && rightsized.length > 0) {
      return {
        label: "Mixed window sizes",
        detail: `${oversized.length} session${oversized.length !== 1 ? "s use" : " uses"} a ${formatWindow(oversized[0].contextTokens)} extended context window at under ${Math.max(...oversized.map((s) => s.percentUsed))}% utilization, while ${rightsized.length} session${rightsized.length !== 1 ? "s use" : " uses"} ${formatWindow(rightsized[0].contextTokens)}. The extended windows cost more on every cache write. Check whether those sessions actually need the larger window — the gateway may have auto-assigned it.`,
        color: "warning",
      };
    }

    return {
      label: "Over-provisioned",
      detail: `All ${oversized.length} sessions use ${formatWindow(oversized[0].contextTokens)} context windows but average only ${avg.toFixed(0)}% utilization. Smaller windows reduce cache write costs on every session refresh. Consider whether these sessions need the extended context.`,
      color: "warning",
    };
  }

  if (avg < 15) {
    const windowNote = hasMixedWindows
      ? ` Window sizes vary (${windowSizes.sort((a, b) => b - a).map(formatWindow).join(", ")}) — sessions with larger windows cost more to cache even at low utilization.`
      : "";
    return {
      label: "Low utilization",
      detail: `Sessions are averaging ${avg.toFixed(0)}% of their context windows.${windowNote} If this is typical, reducing context window sizes could lower cache write costs — the gateway re-caches the full window on each write, so smaller windows mean cheaper refreshes.`,
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

  // Color-coded bars cycling through blue, cyan, teal by index
  const barColors = ["bg-blue-500", "bg-cyan-500", "bg-teal-500"];

  const insightBorder = {
    success: "border-emerald-500/20",
    warning: "border-blue-500/20",
    danger: "border-red-500/20",
    muted: "border-border",
  }[insight.color];

  const insightBg = {
    success: "bg-emerald-500/5",
    warning: "bg-blue-500/5",
    danger: "bg-red-500/5",
    muted: "bg-surface/50",
  }[insight.color];

  const insightIconColor = {
    success: "text-emerald-400",
    warning: "text-blue-400",
    danger: "text-red-400",
    muted: "text-muted-foreground",
  }[insight.color];

  const insightLabelColor = {
    success: "text-emerald-300",
    warning: "text-blue-300",
    danger: "text-red-300",
    muted: "text-muted-foreground",
  }[insight.color];

  const insightDetailColor = {
    success: "text-emerald-300/70",
    warning: "text-blue-300/70",
    danger: "text-red-300/70",
    muted: "text-muted-foreground/70",
  }[insight.color];

  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      data-section="context-utilization"
      data-avg-percent-used={data.avgPercentUsed.toFixed(1)}
      data-session-count={data.sessions.length}
      data-total-context-available={data.totalContextAvailable}
      data-total-context-used={data.totalContextUsed}
      data-status={insight.label.toLowerCase().replace(/\s+/g, "-")}
      data-insight={insight.detail}
      aria-label={`Context utilization: ${data.avgPercentUsed.toFixed(0)}% average across ${data.sessions.length} sessions. ${insight.label}: ${insight.detail}`}
    >
      {/* Header with large number display and icon */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[15px] text-muted-foreground mb-2 font-normal">
            Context Utilization
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-[32px] font-normal text-foreground">
              {data.avgPercentUsed.toFixed(0)}%
            </span>
            <span className="text-[13px] text-muted-foreground/50">avg</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-md bg-muted/10 flex items-center justify-center border border-border">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>

      {/* Per-session bars */}
      <div className="space-y-4 mb-6" data-list="context-sessions">
        {sorted.map((session, idx) => (
          <div
            key={session.agentId + session.kind}
            className="group"
            data-agent={session.agentId}
            data-model={session.model}
            data-kind={session.kind}
            data-tokens-used={session.totalTokens}
            data-context-window={session.contextTokens}
            data-percent-used={session.percentUsed}
            aria-label={`${session.agentId} ${session.kind}: ${formatTokens(session.totalTokens)} of ${formatWindow(session.contextTokens)} context (${session.percentUsed}% used)`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-muted-foreground font-normal capitalize">
                {session.agentId}
                <span className="ml-1 text-muted-foreground/50">
                  {session.kind === "direct" ? "main" : session.kind}
                </span>
              </span>
              <span className="text-[13px] text-foreground/70 font-normal">
                {session.percentUsed}%{" "}
                <span className="text-muted-foreground/60">
                  · {formatWindow(session.contextTokens)}
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-muted/10 rounded-full overflow-hidden">
              <div
                className={`h-full ${barColors[idx % barColors.length]} transition-all duration-500 group-hover:opacity-80`}
                style={{ width: `${Math.max(1, session.percentUsed)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic insight */}
      <div className={`p-3 ${insightBg} border ${insightBorder} rounded-md`}>
        <div className="flex items-start gap-2">
          <CheckCircle2 className={`w-4 h-4 ${insightIconColor} flex-shrink-0 mt-0.5`} />
          <div>
            <h4 className={`text-[13px] font-normal ${insightLabelColor} mb-1`}>
              {insight.label}
            </h4>
            <p className={`text-[12px] ${insightDetailColor} leading-relaxed`}>
              {insight.detail}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground/40">
        Based on {data.sessions.length} active session{data.sessions.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
