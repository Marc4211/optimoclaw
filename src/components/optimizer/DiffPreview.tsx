"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ConfigDiff } from "@/types/optimizer";
import { Agent } from "@/types";

export interface RolloutTarget {
  type: "all" | "single";
  agentId?: string;
}

interface DiffPreviewProps {
  diffs: ConfigDiff[];
  gatewayName?: string;
  agents: Agent[];
  onConfirm: (target: RolloutTarget) => void;
  onCancel: () => void;
}

export default function DiffPreview({
  diffs,
  gatewayName,
  agents,
  onConfirm,
  onCancel,
}: DiffPreviewProps) {
  const [rolloutType, setRolloutType] = useState<"all" | "single">("all");
  const [selectedAgentId, setSelectedAgentId] = useState<string>(
    agents[0]?.id ?? ""
  );

  const selectedAgentName =
    agents.find((a) => a.id === selectedAgentId)?.name ?? selectedAgentId;

  function handleConfirm() {
    onConfirm(
      rolloutType === "all"
        ? { type: "all" }
        : { type: "single", agentId: selectedAgentId }
    );
  }

  const applyLabel =
    rolloutType === "single"
      ? `Apply to ${selectedAgentName}`
      : gatewayName
        ? `Apply to ${gatewayName} Gateway`
        : "Apply & Restart Gateway";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Review Changes</h2>
          <button
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Rollout target */}
        <div className="mb-4 space-y-2 rounded-lg bg-background p-3">
          <p className="text-xs font-medium">Rollout target</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="rollout"
              checked={rolloutType === "all"}
              onChange={() => setRolloutType("all")}
              className="accent-primary"
            />
            Apply to all agents
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="rollout"
              checked={rolloutType === "single"}
              onChange={() => setRolloutType("single")}
              className="accent-primary"
            />
            Apply to one agent first
          </label>
          {rolloutType === "single" && agents.length > 0 && (
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="ml-6 rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <p className="mb-3 text-sm text-muted-foreground">
          The following config fields will be updated in openclaw.json:
        </p>

        <div className="space-y-3 overflow-y-auto">
          {diffs.map((diff) => (
            <div
              key={diff.field}
              className="rounded-lg bg-background p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{diff.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {diff.field}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded bg-danger/10 px-2 py-0.5 font-mono text-xs text-danger">
                  {diff.from}
                </span>
                <span className="text-muted-foreground">&rarr;</span>
                <span className="rounded bg-success/10 px-2 py-0.5 font-mono text-xs text-success">
                  {diff.to}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
