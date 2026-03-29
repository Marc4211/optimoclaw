"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Plug, Heart, Cpu, ChevronRight, CircleAlert } from "lucide-react";
import { Agent, OpenClawConfig } from "@/types";
import { useGateway } from "@/contexts/GatewayContext";
import EmptyState from "@/components/EmptyState";

const statusStyles: Record<Agent["status"], { dot: string; label: string }> = {
  online: { dot: "bg-success", label: "Online" },
  idle: { dot: "bg-warning", label: "Idle" },
  offline: { dot: "bg-muted-foreground/40", label: "Offline" },
};

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

function formatFreq(v: string | undefined, isActive = true): string {
  if (!v || v === "off") return "Off";
  const m = v.match(/^(\d+)m$/);
  if (!m) return v;
  return isActive ? `Every ${m[1]}min` : `Every ${m[1]}min when active`;
}

interface AgentSessionData {
  sessionCount: number;
  avgContextPercent: number;
  cacheReadPercent: number;
}

/**
 * Determine a signal for "anything worth looking at?"
 * Returns null (nothing notable), "amber", or "green".
 */
function getSignal(
  sessions: AgentSessionData | undefined
): { color: "green" | "amber"; label: string } | null {
  if (!sessions || sessions.sessionCount === 0) return null;

  // Context running warm (>75%) — amber
  if (sessions.avgContextPercent > 75) {
    return {
      color: "amber",
      label: `Context ${sessions.avgContextPercent.toFixed(0)}% full`,
    };
  }

  // Low cache efficiency (<30% reads with enough sessions) — amber
  if (sessions.cacheReadPercent < 30 && sessions.cacheReadPercent > 0) {
    return {
      color: "amber",
      label: `Cache ${sessions.cacheReadPercent.toFixed(0)}% reads`,
    };
  }

  // Everything looks good
  if (sessions.avgContextPercent > 0) {
    return { color: "green", label: "Healthy" };
  }

  return null;
}

export default function AgentsPage() {
  const { connected, agents, client } = useGateway();
  const [config, setConfig] = useState<OpenClawConfig | null>(null);
  const [sessionsByAgent, setSessionsByAgent] = useState<
    Map<string, AgentSessionData>
  >(new Map());

  // Fetch config via the full CLI route (same as optimizer) so we get
  // per-agent model.primary — the ?key= shortcut returns unparsed data
  useEffect(() => {
    if (!connected || !client) return;
    let cancelled = false;

    const configPath = (client.snapshot?.configPath as string) ?? "";
    const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
    const profile = profileMatch ? profileMatch[1] : "";

    fetch(
      `/api/config-get?profile=${encodeURIComponent(profile)}&agentCount=${agents.length}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.config) return;
        const cfg = data.config as Record<string, string>;

        // Reconstruct OpenClawConfig from flat key-value pairs
        const parsed: OpenClawConfig = {
          agents: {
            defaults: {
              model: cfg["agents.defaults.model.primary"]
                ? { primary: cfg["agents.defaults.model.primary"] }
                : undefined,
              heartbeat: {
                every: cfg["agents.defaults.heartbeat.every"] ?? "",
                model: cfg["agents.defaults.heartbeat.model"] ?? "",
              },
              compaction: {
                threshold: cfg["agents.defaults.compaction.threshold"]
                  ? Number(cfg["agents.defaults.compaction.threshold"])
                  : undefined,
              },
              subagents: {
                maxConcurrent: cfg["agents.defaults.subagents.maxConcurrent"]
                  ? Number(cfg["agents.defaults.subagents.maxConcurrent"])
                  : undefined,
              },
            },
            list: [],
          },
        };

        // Build agents list from per-agent keys
        const agentKeys = Object.keys(cfg).filter((k) =>
          k.startsWith("agents.list[")
        );
        const agentIndices = new Set(
          agentKeys
            .map((k) => {
              const m = k.match(/agents\.list\[(\d+)\]/);
              return m ? Number(m[1]) : -1;
            })
            .filter((i) => i >= 0)
        );

        for (const idx of Array.from(agentIndices).sort()) {
          const heartbeatEvery = cfg[`agents.list[${idx}].heartbeat.every`];
          const heartbeatModel = cfg[`agents.list[${idx}].heartbeat.model`];
          parsed.agents!.list!.push({
            name: cfg[`agents.list[${idx}].name`] ?? `agent${idx}`,
            model: cfg[`agents.list[${idx}].model.primary`] ?? "",
            heartbeat:
              heartbeatEvery || heartbeatModel
                ? { every: heartbeatEvery ?? "", model: heartbeatModel ?? "" }
                : undefined,
          });
        }

        setConfig(parsed);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [connected, client, agents.length]);

  // Fetch session data
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
        const counts = new Map<
          string,
          {
            sessions: number;
            contextSum: number;
            contextCount: number;
            cacheRead: number;
            cacheInput: number;
          }
        >();

        for (const s of data.sessions as Array<{
          agentId: string;
          percentUsed: number | null;
          cacheRead: number;
          inputTokens: number;
          cacheWrite: number;
          totalTokensFresh: boolean;
        }>) {
          const existing = counts.get(s.agentId) ?? {
            sessions: 0,
            contextSum: 0,
            contextCount: 0,
            cacheRead: 0,
            cacheInput: 0,
          };
          existing.sessions += 1;
          if (s.percentUsed != null) {
            existing.contextSum += s.percentUsed;
            existing.contextCount += 1;
          }
          if (s.totalTokensFresh) {
            existing.cacheRead += s.cacheRead;
            existing.cacheInput +=
              s.cacheRead + s.cacheWrite + s.inputTokens;
          }
          counts.set(s.agentId, existing);
        }

        const map = new Map<string, AgentSessionData>();
        for (const [id, c] of counts) {
          map.set(id, {
            sessionCount: c.sessions,
            avgContextPercent:
              c.contextCount > 0 ? c.contextSum / c.contextCount : 0,
            cacheReadPercent:
              c.cacheInput > 0 ? (c.cacheRead / c.cacheInput) * 100 : 0,
          });
        }
        setSessionsByAgent(map);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [connected, client]);

  const defaultAgentId = (
    client?.snapshot?.sessionDefaults as Record<string, unknown>
  )?.defaultAgentId as string | undefined;

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

  const agentConfigs = config?.agents?.list ?? [];
  const defaults = config?.agents?.defaults;
  const defaultModelPrimary = defaults?.model?.primary;

  return (
    <div className="p-8" data-page="agents">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? "s" : ""} on your
          connected gateway.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const status = statusStyles[agent.status] ?? statusStyles.offline;
          const agentCfg = agentConfigs.find((a) => a.name === agent.name);
          const model = agentCfg?.model ?? defaultModelPrimary ?? agent.model;
          const hasModelOverride = !!agentCfg?.model;
          const heartbeat =
            agentCfg?.heartbeat?.every ?? defaults?.heartbeat?.every;
          const sessions = sessionsByAgent.get(agent.name);
          const isDefault =
            agent.id === defaultAgentId || agent.name === defaultAgentId;
          const signal = getSignal(sessions);

          return (
            <Link
              key={agent.id}
              href={`/agents/${encodeURIComponent(agent.name)}`}
              data-agent-id={agent.id}
              data-agent-name={agent.name}
              data-agent-status={agent.status}
              className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/30 hover:bg-surface-hover"
            >
              {/* Header: avatar + name + status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Bot size={20} className="text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{agent.name}</span>
                      {isDefault && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          default
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      <span className="text-[11px] text-muted-foreground">
                        {status.label}
                        {sessions && sessions.sessionCount > 0 && (
                          <> · {sessions.sessionCount} session{sessions.sessionCount !== 1 ? "s" : ""}</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="mt-1 text-muted-foreground/20 transition-colors group-hover:text-primary"
                />
              </div>

              {/* What is it actually using? — the trust layer */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Cpu size={12} />
                    Model
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {shortModel(model)}
                    <span
                      className={`rounded px-1 py-px text-[9px] ${
                        hasModelOverride
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground/50"
                      }`}
                    >
                      {hasModelOverride ? "override" : "inherited"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Heart size={12} />
                    Heartbeat
                  </span>
                  <span className="text-xs font-medium">
                    {formatFreq(heartbeat, agent.status === "online")}
                  </span>
                </div>
              </div>

              {/* Signal: anything worth looking at? */}
              {signal && (
                <div
                  className={`mt-4 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
                    signal.color === "amber"
                      ? "bg-warning/10 text-warning"
                      : "bg-success/10 text-success"
                  }`}
                >
                  {signal.color === "amber" ? (
                    <CircleAlert size={12} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  )}
                  {signal.label}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
