"use client";

import { use, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Bot,
  ArrowLeft,
  Heart,
  Cpu,
  Layers,
  Settings2,
  ChevronRight,
  Plug,
} from "lucide-react";
import { OpenClawConfig } from "@/types";
import { useGateway } from "@/contexts/GatewayContext";
import ContextUtilizationChart, {
  ContextUtilizationData,
} from "@/components/optimizer/ContextUtilizationChart";
import CacheEfficiencyChart, {
  CacheBreakdownData,
} from "@/components/optimizer/CacheEfficiencyChart";
import EmptyState from "@/components/EmptyState";

/** Shorten model strings: "anthropic/claude-sonnet-4-6-20260320" → "Claude Sonnet 4.6" */
function shortModel(v: string): string {
  const stripped = v
    .replace(/^(anthropic|openai|ollama)\//, "")
    .replace(/-\d{8}$/, "");
  return stripped
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-(\d+)-(\d+)/, " $1.$2")
    .replace(/-(\d+)$/, " $1")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatFreq(v: string | undefined): string {
  if (!v || v === "off") return "Off";
  const m = v.match(/^(\d+)m$/);
  return m ? `Every ${m[1]} min` : v;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatWindow(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

interface SessionRaw {
  sessionId: string;
  agentId: string;
  model: string;
  kind: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  contextTokens: number;
  percentUsed: number | null;
  remainingTokens: number | null;
  totalTokensFresh: boolean;
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: agentName } = use(params);
  const decodedName = decodeURIComponent(agentName);

  const { connected, agents, client } = useGateway();
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [sessions, setSessions] = useState<SessionRaw[]>([]);
  const [loading, setLoading] = useState(true);

  const agent = agents.find((a) => a.name === decodedName);
  const defaultAgentId =
    (client?.snapshot?.sessionDefaults as Record<string, unknown>)
      ?.defaultAgentId as string | undefined;
  const isDefault =
    agent?.id === defaultAgentId || agent?.name === defaultAgentId;

  // Fetch config
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetch("/api/config-get?key=agents")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setConfig((data.config ?? data) as OpenClawConfig);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connected]);

  // Fetch sessions
  useEffect(() => {
    if (!connected || !client) return;
    let cancelled = false;
    const configPath = (client.snapshot?.configPath as string) ?? "";
    const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
    const profile = profileMatch ? profileMatch[1] : "";

    fetch(`/api/sessions?profile=${encodeURIComponent(profile)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setSessions(data.sessions ?? []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [connected, client]);

  // Filter sessions for this agent
  const agentSessions = useMemo(
    () => sessions.filter((s) => s.agentId === decodedName),
    [sessions, decodedName]
  );

  // Build context utilization data for this agent
  const contextData: ContextUtilizationData = useMemo(() => {
    const contextSessions = agentSessions
      .filter((s) => s.contextTokens >= 8_000 && s.percentUsed != null)
      .map((s) => ({
        agentId: s.agentId,
        model: s.model,
        kind: s.kind,
        totalTokens: s.totalTokens,
        contextTokens: s.contextTokens,
        percentUsed: s.percentUsed!,
        remainingTokens: s.remainingTokens ?? 0,
      }));
    const avg =
      contextSessions.length > 0
        ? contextSessions.reduce((sum, s) => sum + s.percentUsed, 0) /
          contextSessions.length
        : 0;
    return {
      sessions: contextSessions,
      avgPercentUsed: avg,
      totalContextAvailable: contextSessions.reduce(
        (sum, s) => sum + s.contextTokens,
        0
      ),
      totalContextUsed: contextSessions.reduce(
        (sum, s) => sum + s.totalTokens,
        0
      ),
    };
  }, [agentSessions]);

  // Build cache breakdown for this agent
  const cacheData: CacheBreakdownData = useMemo(() => {
    const fresh = agentSessions.filter((s) => s.totalTokensFresh);
    let totalInput = 0,
      totalOutput = 0,
      totalCacheRead = 0,
      totalCacheWrite = 0;
    for (const s of fresh) {
      totalInput += s.inputTokens;
      totalOutput += s.outputTokens;
      totalCacheRead += s.cacheRead;
      totalCacheWrite += s.cacheWrite;
    }
    const tokenTotal =
      totalInput + totalOutput + totalCacheRead + totalCacheWrite;
    return {
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheWrite,
      tokenTotal,
      cacheReadPercent:
        tokenTotal > 0 ? (totalCacheRead / tokenTotal) * 100 : 0,
      cacheWritePercent:
        tokenTotal > 0 ? (totalCacheWrite / tokenTotal) * 100 : 0,
      freshInputPercent:
        tokenTotal > 0 ? (totalInput / tokenTotal) * 100 : 0,
      outputPercent: tokenTotal > 0 ? (totalOutput / tokenTotal) * 100 : 0,
    };
  }, [agentSessions]);

  // Config values for this agent
  const agentCfg = config?.agents?.list?.find((a) => a.name === decodedName);
  const defaults = config?.agents?.defaults;
  const model =
    agentCfg?.model ?? defaults?.model?.primary ?? agent?.model ?? "—";
  const heartbeatFreq =
    agentCfg?.heartbeat?.every ?? defaults?.heartbeat?.every;
  const heartbeatModel =
    agentCfg?.heartbeat?.model ?? defaults?.heartbeat?.model;
  const compactionModel = defaults?.compaction?.model;
  const compactionThreshold = defaults?.compaction?.threshold;
  const maxConcurrent = defaults?.subagents?.maxConcurrent;

  if (!connected) {
    return (
      <EmptyState
        icon={Bot}
        title="Agent Detail"
        what="Connect to a gateway to view agent details."
        why="No gateway connected."
        action={
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plug size={16} />
            Connect Gateway
          </Link>
        }
      />
    );
  }

  if (!agent) {
    return (
      <div className="p-8">
        <Link
          href="/agents"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back to Agents
        </Link>
        <EmptyState
          icon={Bot}
          title="Agent Not Found"
          what={`No agent named "${decodedName}" found on this gateway.`}
          why="The agent may have been removed or renamed."
        />
      </div>
    );
  }

  const totalTokens = agentSessions
    .filter((s) => s.totalTokensFresh)
    .reduce((sum, s) => sum + s.totalTokens, 0);

  return (
    <div className="p-8" data-page="agent-detail" data-agent-name={decodedName}>
      {/* Back nav */}
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} />
        All Agents
      </Link>

      {/* Agent header */}
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
            <Bot size={24} className="text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{decodedName}</h1>
              {isDefault && (
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  default
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {shortModel(model)}
            </p>
          </div>
        </div>

        <Link
          href={`/optimizer?agent=${encodeURIComponent(decodedName)}`}
          className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <Settings2 size={13} />
          Optimize in Token Optimizer
          <ChevronRight size={13} />
        </Link>
      </div>

      {/* Config summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Cpu size={11} />
            Primary Model
          </div>
          <p className="mt-1.5 text-sm font-medium">{shortModel(model)}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Heart size={11} />
            Heartbeat
          </div>
          <p className="mt-1.5 text-sm font-medium">
            {formatFreq(heartbeatFreq)}
          </p>
          {heartbeatModel && (
            <p className="text-[10px] text-muted-foreground">
              {shortModel(heartbeatModel)}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Layers size={11} />
            Sessions
          </div>
          <p className="mt-1.5 text-sm font-medium">
            {agentSessions.length}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatTokens(totalTokens)} total tokens
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <Settings2 size={11} />
            Config
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {compactionThreshold
              ? `Compaction: ${(compactionThreshold / 1000).toFixed(0)}K`
              : "Defaults"}
          </p>
          {maxConcurrent && (
            <p className="text-[11px] text-muted-foreground">
              Concurrency: {maxConcurrent}
            </p>
          )}
        </div>
      </div>

      {/* Session list */}
      {agentSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Active Sessions
          </h2>
          <div className="space-y-2">
            {agentSessions.map((s) => (
              <div
                key={s.sessionId}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
                data-session-id={s.sessionId}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {s.sessionId.slice(0, 8)}…
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{shortModel(s.model)}</span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>{s.kind}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div>
                    <p className="font-mono text-xs">
                      {formatTokens(s.totalTokens)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">tokens</p>
                  </div>
                  {s.percentUsed != null && (
                    <div>
                      <p className="font-mono text-xs">
                        {s.percentUsed.toFixed(0)}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        of {formatWindow(s.contextTokens)}
                      </p>
                    </div>
                  )}
                  {s.cacheRead > 0 || s.cacheWrite > 0 ? (
                    <div>
                      <p className="font-mono text-xs">
                        {(
                          ((s.cacheRead) /
                            (s.cacheRead + s.cacheWrite + s.inputTokens || 1)) *
                          100
                        ).toFixed(0)}
                        %
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        cached
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights — reuse the optimizer charts */}
      {!loading && (contextData.sessions.length > 0 || cacheData.tokenTotal > 0) && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Session Insights
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ContextUtilizationChart data={contextData} />
            <CacheEfficiencyChart data={cacheData} />
          </div>
        </div>
      )}

      {/* No session data state */}
      {!loading && agentSessions.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No active sessions for this agent. Session data will appear once{" "}
            {decodedName} starts running.
          </p>
        </div>
      )}
    </div>
  );
}
