"use client";

import { ChevronDown } from "lucide-react";
import { Agent } from "@/types";
import { useState, useRef, useEffect } from "react";

interface AgentSelectorProps {
  agents: Agent[];
  selectedAgentId: string | null;
  defaultAgentId?: string | null;
  onSelect: (agentId: string | null) => void;
}

export default function AgentSelector({
  agents,
  selectedAgentId,
  defaultAgentId,
  onSelect,
}: AgentSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const selected = selectedAgentId
    ? agents.find((a) => a.id === selectedAgentId)
    : null;
  const isDefault = selected?.id === defaultAgentId;
  const label = selected
    ? `${selected.name}${isDefault ? " (default)" : ""}`
    : "Global defaults";

  return (
    <div className="relative" ref={ref} data-agent-scope={selectedAgentId ?? "defaults"}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm transition-colors hover:bg-surface-hover"
      >
        <span className="text-muted-foreground">Optimizing:</span>
        <span className="font-medium">{label}</span>
        <ChevronDown
          size={14}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-lg border border-border bg-surface shadow-lg">
          <div className="max-h-64 overflow-y-auto p-1">
            {/* Per-agent entries */}
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => {
                  onSelect(agent.id);
                  setOpen(false);
                }}
                data-selected={String(selectedAgentId === agent.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedAgentId === agent.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <span className="flex-1">
                  {agent.name}
                  {agent.id === defaultAgentId && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground/50">(default)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground/60">{agent.model.split("/").pop()}</span>
              </button>
            ))}

            {/* Divider + Global defaults */}
            {agents.length > 0 && <div className="my-1 border-t border-border" />}
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              data-selected={String(selectedAgentId === null)}
              className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selectedAgentId === null
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              Global defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
