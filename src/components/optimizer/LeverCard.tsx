"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { LeverDefinition, LeverValue } from "@/types/optimizer";
import { formatCost } from "@/lib/optimizer";

interface LeverCardProps {
  lever: LeverDefinition;
  value: string | number;
  costDelta: number;
  filteredOptions?: { value: string; label: string }[];
  showLocalModelHint?: boolean;
  onChange: (key: keyof LeverValue, value: string | number) => void;
}

export default function LeverCard({
  lever,
  value,
  costDelta,
  filteredOptions,
  showLocalModelHint,
  onChange,
}: LeverCardProps) {
  const [expanded, setExpanded] = useState(false);
  const options = filteredOptions ?? lever.options;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium">{lever.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {lever.description}
          </p>
        </div>
        <div className="ml-4 flex flex-col items-end gap-1">
          <span
            className={`font-mono text-sm font-medium ${
              costDelta < -0.01
                ? "text-success"
                : costDelta > 0.01
                  ? "text-danger"
                  : "text-muted-foreground"
            }`}
          >
            {costDelta > 0 ? "+" : ""}
            {formatCost(costDelta)}/mo
          </span>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
            <ChevronDown
              size={12}
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Expandable impact + guidance */}
      {expanded && (
        <div className="mb-4 space-y-2 rounded-md bg-background p-3">
          <div>
            <span className="text-xs font-medium text-foreground">Impact: </span>
            <span className="text-xs text-muted-foreground">{lever.impact}</span>
          </div>
          <div>
            <span className="text-xs font-medium text-foreground">Guidance: </span>
            <span className="text-xs text-muted-foreground">{lever.guidance}</span>
          </div>
        </div>
      )}

      {lever.type === "select" && options && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange(lever.key, option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                String(value) === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {lever.type === "slider" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">
              {lever.formatValue
                ? lever.formatValue(lever.min ?? 0)
                : lever.min}
            </span>
            <span className="font-mono text-sm font-medium text-primary">
              {lever.formatValue
                ? lever.formatValue(value as number)
                : value}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {lever.formatValue
                ? lever.formatValue(lever.max ?? 100)
                : lever.max}
            </span>
          </div>
          <input
            type="range"
            min={lever.min}
            max={lever.max}
            step={lever.step}
            value={value as number}
            onChange={(e) => onChange(lever.key, Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
      )}

      {/* Local model recommendation card */}
      {showLocalModelHint && (
        <div className="mt-3 flex items-start gap-2.5 rounded-md border border-primary/20 bg-primary/5 p-3">
          <Lightbulb size={14} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Cut this cost to zero with a local model. </span>
            Route this to a locally-running model and pay nothing per call.
            Requires{" "}
            <a
              href="https://ollama.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Ollama
            </a>{" "}
            installed and a model pulled. Once configured in your OpenClaw config, this option will appear here automatically.
          </p>
        </div>
      )}
    </div>
  );
}
