"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LeverDefinition, LeverValue } from "@/types/optimizer";
import { formatCost } from "@/lib/optimizer";

interface LeverCardProps {
  lever: LeverDefinition;
  value: string | number;
  /** Whether this is a model selection lever (gets cost display) */
  isModelLever: boolean;
  /** Delta from base config — only meaningful for model levers when changed */
  costDelta: number;
  filteredOptions?: { value: string; label: string }[];
  rationale?: string;
  onChange: (key: keyof LeverValue, value: string | number) => void;
}

export default function LeverCard({
  lever,
  value,
  isModelLever,
  costDelta,
  filteredOptions,
  rationale,
  onChange,
}: LeverCardProps) {
  const [expanded, setExpanded] = useState(false);
  const options = filteredOptions ?? lever.options;
  const hasChanged = isModelLever && Math.abs(costDelta) > 0.01;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium">{lever.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {lever.description}
          </p>
          {rationale && (
            <span className="mt-1.5 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {rationale}
            </span>
          )}
        </div>
        <div className="ml-4 flex flex-col items-end gap-1">
          {/* Model levers: show — at rest, show delta when changed */}
          {/* Non-model levers: always show — (no cost data) */}
          {hasChanged ? (
            <span
              className={`font-mono text-sm font-medium ${
                costDelta < -0.01 ? "text-success" : "text-danger"
              }`}
            >
              {costDelta > 0 ? "+" : ""}
              {formatCost(costDelta)}/mo
            </span>
          ) : (
            <span className="font-mono text-sm font-medium text-muted-foreground">
              —
            </span>
          )}
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
    </div>
  );
}
