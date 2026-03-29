"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Plug, Heart, Cpu, Layers, ChevronRight } from "lucide-react";
import { Agent, OpenClawConfig } from "@/types";
import { useGateway } from "@/contexts/GatewayContext";
import EmptyState from "@/components/EmptyState";

const statusStyles: Record<Agent["status"], { dot: string; label: string }> = {
  online: { dot: "bg-success", label: "Online" },
  idle: { dot: "bg-warning", label: "Idle" },
  offline: { dot: "bg-muted-foreground", label: "Offline" },
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Shorten model strings: "anthropic/claude-sonnet-4-6-20260320" → "Claude Sonnet 4.6" */
function shortModel(v: string): string {
  const stripped = v
    .replace(/^(anthropic|openai|ollama)\//, "")
    .replace(/-\d{8}$/, ""); // strip date suffix
  return stripped
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-(\d+)-(\d+)/, " $1.$2")
    .replace(/-(\d+)$/, " $1")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Format heartbeat frequency: "60m" → "Every 60 min", "off" → "Off" */
function formatFreq(v: string | undefined): string {
  if (!v || v === "off") return "Off";
  const m = v.match(/^(\d+)m$/);
  return m ? `Every ${m[1]} min` : v;
}

interface SessionSummaryByAgent {
  agentId: string;
  sessionCount: number;
  totalTokens: number;
  avgContextPercent: number;
}

export default function AgentsPage() {
  const { connected, agents, client } = useGateway();
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [sessionsByAgent, setSessionsByAgent] = useState<Map<string, SessionSummaryByAgent>>(new Map());

  // Fetch config for heartbeat/model details
  useEffect(() => {
    if (!connected || !client) return;
    let cancelled = false;

    fetch("/api/config-get?key=agents")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const cfg = data.config ?? data;
        setConfig(cfg as OpenClawConfig);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [connected, client]);

  // Fetch session data for per-agent summaries
  useEffect(() => {
    if (!connected || !client) return;
    let cancelled = false;

    const configPath = (client.snapshot?.configPath as string) ?? "";
    const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
    const profile = profileMatch ? profileMatch[1] : "";

    fetch(`/api/sessions?profile=${encodeURIComponent(profile)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.sessions) return;

        // Aggregate per agent
        const map = new Map<string, SessionSummaryByAgent>();
        for (const s of data.sessions as Array<{
          agentId: string;
          totalTokens: number;
          percentUsed: number | null;
          totalTokensFresh: boolean;
        }>) {
          const existing = map.get(s.agentId);
          if (existing) {
            existing.sessionCount += 1;
            if (s.totalTokensFresh) existing.totalTokens += s.totalTokens;
            if (s.percentUsed != null) {
              // Running average
              existing.avgContextPercent =
                (existing.avgContextPercent * (existing.sessionCount - 1) + s.percentUsed) /
                existing.sessionCount;
            }
          } else {
            map.set(s.agentId, {
              agentId: s.agentId,
              sessionCount: 1,
              totalTokens: s.totalTokensFresh ? s.totalTokens : 0,
              avgContextPercent: s.percentUsed ?? 0,
            });
          }
        }
        setSessionsByAgent(map);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [connected, client]);

  // Determine default agent
  const defaultAgentId =
    (client?.snapshot?.sessionDefaults as Record<string, unknown>)?.defaultAgentId as string | undefined;

  if (!connected) {
    return (
      <EmptyState
        icon={Bot}
        title="Agents"
        what="This page shows all agents running on your gateway — their model, status, active sessions, and token usage."
        why="No gateway connected yet. Connect to see your agents."
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

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="Agents"
        what="This page shows all agents running on your gateway."
        why="Connected to gateway, but no agents found. Configure agents in your openclaw.json."
      />
    );
  }

  // Merge config data with agent list
  const agentConfigs = config?.agents?.list ?? [];
  const defaults = config?.agents?.defaults;

  return (
    <div className="p-8" data-page="agents">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? "s" : ""} on your
          connected gateway.
        </p>
      </div>

      <div className="grid gap-3">
        {agents.map((agent) => {
          const status = statusStyles[agent.status] ?? statusStyles.offline;
          const agentCfg = agentConfigs.find((a) => a.name === agent.name);
          const model = agentCfg?.model ?? defaults?.model?.primary ?? agent.model;
          const heartbeat = agentCfg?.heartbeat?.every ?? defaults?.heartbeat?.every;
          const sessions = sessionsByAgent.get(agent.name);
          const isDefault = agent.id === defaultAgentId || agent.name === defaultAgentId;

          return (
            <Link
              key={agent.id}
              href={`/agents/${encodeURIComponent(agent.name)}`}
              data-agent-id={agent.id}
              data-agent-name={agent.name}
              data-agent-status={agent.status}
              data-agent-model={model}
              className="group flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/30 hover:bg-surface-hover"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Bot size={18} className="text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{agent.name}</p>
                    {isDefault && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        default
                      </span>
                    )}
                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Cpu size={11} />
                      {shortModel(model)}
                    </span>
                    {heartbeat && (
                      <span className="flex items-center gap-1">
                        <Heart size={11} />
                        {formatFreq(heartbeat)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5">
                {/* Sessions */}
                <div className="text-right">
                  <p className="font-mono text-sm">{sessions?.sessionCount ?? agent.sessionCount}</p>
                  <p className="text-[10px] text-muted-foreground">sessions</p>
                </div>

                {/* Tokens */}
                <div className="text-right">
                  <p className="font-mono text-sm">
                    {formatTokens(sessions?.totalTokens ?? agent.tokenUsage)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">tokens</p>
                </div>

                {/* Context utilization */}
                {sessions && sessions.avgContextPercent > 0 ? (
                  <div className="text-right">
                    <p className="font-mono text-sm">
                      {sessions.avgContextPercent.toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-muted-foreground">context</p>
                  </div>
                ) : (
                  <div className="w-12" /> // placeholder for alignment
                )}

                <ChevronRight
                  size={16}
                  className="text-muted-foreground/30 transition-colors group-hover:text-primary"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
