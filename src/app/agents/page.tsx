"use client";

import Link from "next/link";
import { Bot, Plug } from "lucide-react";
import { Agent } from "@/types";
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

export default function AgentsPage() {
  const { connected, agents } = useGateway();

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
          return (
            <div
              key={agent.id}
              data-agent-id={agent.id}
              data-agent-name={agent.name}
              data-agent-status={agent.status}
              data-agent-model={agent.model}
              data-agent-sessions={agent.sessionCount}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Bot size={18} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{agent.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {agent.model}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="font-mono text-sm">
                    {formatTokens(agent.tokenUsage)}
                  </p>
                  <p className="text-xs text-muted-foreground">tokens</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{agent.sessionCount}</p>
                  <p className="text-xs text-muted-foreground">sessions</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                  <span className="text-xs text-muted-foreground">
                    {status.label}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
