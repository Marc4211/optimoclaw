"use client";

import { LeverDefinition, LeverValue } from "@/types/optimizer";
import { GatewayModel } from "@/types";
import { Brain, Heart, Archive } from "lucide-react";

const MODEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  defaultModel: Brain,
  heartbeatModel: Heart,
  compactionModel: Archive,
};

/** Cost/Performance badge values keyed by lever key then option value */
const BADGE_MAP: Record<string, Record<string, { cost: string; perf: string }>> = {
  heartbeatFrequency: {
    off:   { cost: "Minimal",  perf: "None" },
    "60m": { cost: "Low",      perf: "Standard" },
    "30m": { cost: "Moderate", perf: "Good" },
    "15m": { cost: "High",     perf: "Excellent" },
  },
  sessionContextLoading: {
    lean:     { cost: "Minimal",  perf: "Basic" },
    standard: { cost: "Moderate", perf: "Good" },
    full:     { cost: "High",     perf: "Excellent" },
  },
};

interface LeverCardProps {
  lever: LeverDefinition;
  /** Override the lever label (e.g. "[Agent]'s Model" instead of "Default Model") */
  labelOverride?: string;
  value: string | number;
  /** Whether this is a model selection lever (gets cost display) */
  isModelLever: boolean;
  /** Percentage change from base config — only meaningful for model levers when changed */
  costDeltaPercent: number;
  /** True when this lever value is inherited from global defaults (no per-agent override) */
  inherited?: boolean;
  /** Custom tag to show instead of "using global default" (e.g. "LosslessClaw feature") */
  tagOverride?: string;
  /** Disable the lever with a message (e.g. plugin not installed) */
  disabled?: boolean;
  disabledMessage?: string;
  /** Visually dim the lever (not suggested by tune mode) but keep it interactive */
  dimmed?: boolean;
  /** For model levers: dynamic model options from the gateway */
  modelOptions?: GatewayModel[];
  filteredOptions?: { value: string; label: string }[];
  rationale?: string;
  onChange: (key: keyof LeverValue, value: string | number) => void;
}

export default function LeverCard({
  lever,
  labelOverride,
  value,
  isModelLever,
  costDeltaPercent,
  inherited,
  tagOverride,
  disabled,
  disabledMessage,
  dimmed,
  modelOptions,
  filteredOptions,
  rationale,
  onChange,
}: LeverCardProps) {
  const options = filteredOptions ?? lever.options;
  const hasChanged = isModelLever && Math.abs(costDeltaPercent) > 0.5;

  // For model levers with gateway models: use a dropdown
  const useModelDropdown = !disabled && isModelLever && modelOptions && modelOptions.length > 0;

  // Model lever icon
  const Icon = isModelLever ? MODEL_ICONS[lever.key] : undefined;

  // Badge data for select-type performance levers
  const badges = BADGE_MAP[lever.key]?.[String(value)] ?? null;

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-5 transition-opacity ${disabled ? "opacity-50" : dimmed ? "opacity-40" : ""}`}
      data-lever={lever.key}
      data-value={disabled ? "disabled" : String(value)}
      data-cost-delta={hasChanged ? costDeltaPercent.toFixed(0) : null}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          {/* Model lever: icon + title row inspired by ModelCard design */}
          {Icon ? (
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center border border-border/50">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-medium">
                {labelOverride ?? lever.label}
                {(inherited || tagOverride) && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground/60">({tagOverride ?? "using global default"})</span>
                )}
              </h3>
            </div>
          ) : (
            <h3 className="text-sm font-medium">
              {labelOverride ?? lever.label}
              {(inherited || tagOverride) && (
                <span className="ml-2 text-xs font-normal text-muted-foreground/60">({tagOverride ?? "using global default"})</span>
              )}
            </h3>
          )}
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {lever.description}
          </p>
          {rationale && (
            <span className="mt-1.5 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
              {rationale}
            </span>
          )}
        </div>
        <div className="ml-4 flex items-end">
          {hasChanged ? (
            <span
              className={`font-mono text-sm font-medium ${
                costDeltaPercent < -0.5 ? "text-success" : "text-danger"
              }`}
            >
              {costDeltaPercent > 0 ? "+" : ""}
              {costDeltaPercent.toFixed(0)}%
            </span>
          ) : (
            <span className="font-mono text-sm font-medium text-muted-foreground">
              —
            </span>
          )}
        </div>
      </div>

      {/* Disabled state — plugin not installed */}
      {disabled && disabledMessage && (
        <div className="rounded-md border border-border/50 bg-background px-3 py-2.5 text-sm text-muted-foreground">
          {disabledMessage}
        </div>
      )}

      {/* Model lever: dropdown populated from gateway */}
      {!disabled && isModelLever && useModelDropdown && (
        <select
          value={String(value)}
          onChange={(e) => onChange(lever.key, e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {modelOptions!.map((model) => {
            const fullId = `${model.provider}/${model.id}`;
            return (
              <option key={fullId} value={fullId}>
                {model.name} ({model.provider})
              </option>
            );
          })}
        </select>
      )}
      {/* Model lever: loading state while models fetch */}
      {!disabled && isModelLever && !useModelDropdown && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <span className="animate-pulse">Loading models...</span>
          <span className="font-mono text-xs">({String(value)})</span>
        </div>
      )}

      {/* Heartbeat Frequency: visual timeline + toggle buttons */}
      {lever.type === "select" && lever.key === "heartbeatFrequency" && !useModelDropdown && options && (
        <div className="space-y-4">
          {/* Visual Timeline — "Hour View" */}
          <div>
            <div className="text-[12px] text-muted-foreground/60 mb-3 font-normal">Hour View</div>
            <div className="relative">
              {/* Timeline Line */}
              <div className="absolute top-5 left-5 right-5 h-[2px] bg-primary/20" />
              {/* Time Markers */}
              <div className="flex justify-between items-center relative">
                {[
                  { label: "0m", active: false },
                  { label: "15m", active: value === "15m" },
                  { label: "30m", active: value === "30m" },
                  { label: "60m", active: value === "60m" },
                ].map((marker) => (
                  <div key={marker.label} className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full border flex items-center justify-center mb-2 transition-colors ${
                        marker.active
                          ? "bg-primary border-primary"
                          : "bg-surface border-border"
                      }`}
                    >
                      <Heart
                        className={`w-5 h-5 ${marker.active ? "text-primary-foreground" : "text-muted-foreground/40"}`}
                        fill={marker.active ? "currentColor" : "none"}
                      />
                    </div>
                    <span className="text-[13px] text-muted-foreground">{marker.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Toggle buttons */}
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => onChange(lever.key, option.value)}
                data-selected={String(String(value) === option.value)}
                aria-pressed={String(value) === option.value}
                className={`flex-1 rounded-lg px-4 py-2.5 text-[13px] font-normal transition-all border ${
                  String(value) === option.value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-surface border-border text-muted-foreground hover:border-muted-foreground/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Cost / Performance badges */}
          {badges && (
            <div className="flex items-center gap-4 text-[13px]">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Cost Impact:</span>
                <span className="rounded px-2 py-1 bg-amber-500/10 text-amber-500 font-medium">
                  {badges.cost}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Performance:</span>
                <span className="rounded px-2 py-1 bg-primary/10 text-primary font-medium">
                  {badges.perf}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Non-model select lever: button group (context loading, etc.) */}
      {lever.type === "select" && lever.key !== "heartbeatFrequency" && !useModelDropdown && options && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => onChange(lever.key, option.value)}
                data-selected={String(String(value) === option.value)}
                aria-pressed={String(value) === option.value}
                className={`rounded-lg px-4 py-2 text-[14px] font-normal transition-all border ${
                  String(value) === option.value
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-surface border-border text-muted-foreground hover:border-muted-foreground/30"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Cost / Performance badges for performance tuning levers */}
          {badges && (
            <div className="flex items-center gap-4 text-[13px]">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Cost Impact:</span>
                <span className="rounded px-2 py-1 bg-amber-500/10 text-amber-500 font-medium">
                  {badges.cost}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Performance:</span>
                <span className="rounded px-2 py-1 bg-primary/10 text-primary font-medium">
                  {badges.perf}
                </span>
              </div>
            </div>
          )}
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
            <span className="font-mono text-base font-medium text-primary">
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
