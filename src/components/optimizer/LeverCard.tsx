"use client";

import { LeverDefinition, LeverValue } from "@/types/optimizer";
import { GatewayModel } from "@/types";
import { formatCost } from "@/lib/optimizer";

interface LeverCardProps {
  lever: LeverDefinition;
  /** Override the lever label (e.g. "[Agent]'s Model" instead of "Default Model") */
  labelOverride?: string;
  value: string | number;
  /** Whether this is a model selection lever (gets cost display) */
  isModelLever: boolean;
  /** Delta from base config — only meaningful for model levers when changed */
  costDelta: number;
  /** True when this lever value is inherited from global defaults (no per-agent override) */
  inherited?: boolean;
  /** Disable the lever with a message (e.g. plugin not installed) */
  disabled?: boolean;
  disabledMessage?: string;
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
  costDelta,
  inherited,
  disabled,
  disabledMessage,
  modelOptions,
  filteredOptions,
  rationale,
  onChange,
}: LeverCardProps) {
  const options = filteredOptions ?? lever.options;
  const hasChanged = isModelLever && Math.abs(costDelta) > 0.01;

  // For model levers with gateway models: use a dropdown
  const useModelDropdown = !disabled && isModelLever && modelOptions && modelOptions.length > 0;

  return (
    <div
      className={`rounded-lg border border-border bg-surface p-5 ${disabled ? "opacity-50" : ""}`}
      data-lever={lever.key}
      data-value={disabled ? "disabled" : String(value)}
      data-cost-delta={hasChanged ? costDelta.toFixed(2) : null}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium">
            {labelOverride ?? lever.label}
            {inherited && (
              <span className="ml-2 text-xs font-normal text-muted-foreground/60">(inherited)</span>
            )}
          </h3>
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

      {/* Non-model select lever: button group (frequency, context loading, etc.) */}
      {lever.type === "select" && !useModelDropdown && options && (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange(lever.key, option.value)}
              data-selected={String(String(value) === option.value)}
              aria-pressed={String(value) === option.value}
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
