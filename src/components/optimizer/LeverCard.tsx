"use client";

import { LeverDefinition, LeverValue } from "@/types/optimizer";
import { formatCost } from "@/lib/optimizer";

interface LeverCardProps {
  lever: LeverDefinition;
  value: string | number;
  costDelta: number;
  onChange: (key: keyof LeverValue, value: string | number) => void;
}

export default function LeverCard({
  lever,
  value,
  costDelta,
  onChange,
}: LeverCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium">{lever.label}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {lever.description}
          </p>
        </div>
        <div className="ml-4 text-right">
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
        </div>
      </div>

      {lever.type === "select" && lever.options && (
        <div className="flex flex-wrap gap-2">
          {lever.options.map((option) => (
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
