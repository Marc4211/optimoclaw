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

/**
 * Analyze utilization and return a structured insight.
 *
 * Each insight is BroadClaw-lever-aware: it either points to a specific
 * lever the user can change, honestly says there's no lever for it, or
 * confirms things are already optimal. No dangling diagnoses.
 */
function getInsight(data: ContextUtilizationData): {
  label: string;
  status: string;
  meaning: string;
  action: string;
  /** Which lever to reference, if any */
  lever: string | null;
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

  // --- Specific: big windows barely used ---
  if (oversized.length > 0 && avg < 10) {
    const largeWindow = formatWindow(oversized[0].contextTokens);
    return {
      label: hasMixedWindows ? "Mixed window sizes" : "Over-provisioned windows",
      status: "BroadClaw lever available",
      meaning: hasMixedWindows
        ? `${oversized.length} session${oversized.length !== 1 ? "s are" : " is"} using a ${largeWindow} context window at under 15% utilization. Larger windows cost more on every cache write — you pay for the headroom even if you don't use it.`
        : `All sessions have ${largeWindow} context windows but are only using ${avg.toFixed(0)}% on average. Larger windows cost more on every cache write — you pay for the headroom even if you don't use it.`,
      action: "The model you assign determines the maximum window size. If these sessions don't need extended context, switching to Haiku caps the window at 200K and reduces per-write cost.",
      lever: "defaultModel",
      color: "warning",
    };
  }

  // --- Low utilization (< 15%) ---
  if (avg < 15) {
    return {
      label: "Low utilization",
      status: "Normal for short or new sessions",
      meaning: `Your sessions are using about ${avg.toFixed(0)}% of their context windows on average. Conversations haven't grown large yet.`,
      action: "Nothing to change in BroadClaw. Context utilization grows naturally as conversations get longer. This is just a snapshot of current session state.",
      lever: null,
      color: "muted",
    };
  }

  // --- Comfortable (15–40%) ---
  if (avg < 40) {
    return {
      label: "Good headroom",
      status: "Already optimal",
      meaning: `Sessions are using about ${avg.toFixed(0)}% of their context windows — plenty of room for conversations to grow before compaction kicks in.`,
      action: "Nothing to change. Current utilization leaves healthy room for conversation growth.",
      lever: null,
      color: "success",
    };
  }

  // --- Healthy (40–75%) ---
  if (avg < 75) {
    return {
      label: "Well utilized",
      status: "Already optimal",
      meaning: `Context windows are ${avg.toFixed(0)}% utilized — a good balance between capacity and efficiency.`,
      action: "You can tune the Compaction Threshold below to control when long conversations get summarized. Lower threshold = earlier summarization, higher = more context preserved.",
      lever: "compactionThreshold",
      color: "success",
    };
  }

  // --- Running warm (75–90%) ---
  if (avg < 90) {
    return {
      label: "Running warm",
      status: "BroadClaw lever available",
      meaning: `Sessions are using ${avg.toFixed(0)}% of their context windows. Compaction will start triggering more frequently as conversations grow.`,
      action: "Lower the Compaction Threshold in Performance Tuning below. This makes the gateway summarize earlier, freeing up context space before sessions hit the wall. Current quality may shift slightly as older context gets compressed.",
      lever: "compactionThreshold",
      color: "warning",
    };
  }

  // --- Near capacity (90%+) ---
  return {
    label: "Near capacity",
    status: "BroadClaw lever available",
    meaning: `Context windows are ${avg.toFixed(0)}% full. Sessions are likely hitting compaction frequently, which can cause context loss and adds summarization token costs.`,
    action: "Lower the Compaction Threshold in Performance Tuning below to summarize earlier. You can also reduce Heartbeat Frequency — fewer heartbeats means less context accumulation per hour.",
    lever: "compactionThreshold",
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
      data-insight={insight.meaning}
      aria-label={`Context utilization: ${data.avgPercentUsed.toFixed(0)}% average across ${data.sessions.length} sessions. ${insight.label}: ${insight.meaning} ${insight.action}`}
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

      {/* Dynamic insight — structured as status / meaning / action */}
      <div
        className={`p-3 ${insightBg} border ${insightBorder} rounded-md`}
        data-insight-label={insight.label}
        data-insight-status={insight.status}
        data-insight-meaning={insight.meaning}
        data-insight-action={insight.action}
      >
        <div className="flex items-start gap-2">
          <CheckCircle2 className={`w-4 h-4 ${insightIconColor} flex-shrink-0 mt-0.5`} />
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h4 className={`text-[13px] font-medium ${insightLabelColor}`}>
                {insight.label}
              </h4>
              <span className={`text-[11px] ${insightDetailColor}`}>
                — {insight.status}
              </span>
            </div>
            <p className={`text-[12px] ${insightDetailColor} leading-relaxed`}>
              {insight.meaning}
            </p>
            <p className={`text-[12px] ${insightLabelColor} leading-relaxed`}>
              → {insight.action}
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
