// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { ConfigDiff } from "@/types/optimizer";

interface StickyApplyBarProps {
  changeCount: number;
  changes: ConfigDiff[];
  applying: boolean;
  gatewayName?: string;
  onApply: () => void;
  onReset: () => void;
}

/** Shorten model strings for display: "anthropic/claude-sonnet-4-6" → "Claude Sonnet 4.6" */
function shortModel(v: string): string {
  const stripped = v.replace(/^(anthropic|openai|ollama)\//, "");
  // Turn "claude-sonnet-4-6" into "Claude Sonnet 4.6"
  return stripped
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-(\d+)-(\d+)/, " $1.$2")
    .replace(/-(\d+)$/, " $1")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatValue(diff: ConfigDiff): { from: string; to: string } {
  // Model fields — shorten the long strings
  if (diff.field.includes("model") || diff.field.includes("Model")) {
    return { from: shortModel(diff.from), to: shortModel(diff.to) };
  }
  return { from: diff.from, to: diff.to };
}

export default function StickyApplyBar({
  changeCount,
  changes,
  applying,
  gatewayName,
  onApply,
  onReset,
}: StickyApplyBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (changeCount === 0 && !applying) return null;

  return (
    <div className="fixed bottom-0 left-56 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm">
      {/* Expanded change summary — slides up above the bar */}
      {expanded && !applying && changes.length > 0 && (
        <div className="mx-auto max-w-5xl border-b border-border/50 px-8 py-3">
          <div className="space-y-2">
            {changes.map((diff) => {
              const { from, to } = formatValue(diff);
              return (
                <div
                  key={diff.field}
                  className="flex items-center gap-3 text-sm"
                  data-change={diff.field}
                  data-from={diff.from}
                  data-to={diff.to}
                >
                  <span className="min-w-[140px] text-muted-foreground">
                    {diff.label}
                  </span>
                  <span className="font-mono text-xs text-danger/70 line-through">
                    {from}
                  </span>
                  <span className="text-muted-foreground/40">→</span>
                  <span className="font-mono text-xs text-success">
                    {to}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main bar */}
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3">
        <div className="flex items-center gap-3">
          {applying ? (
            <span className="text-sm font-medium text-warning animate-pulse">
              Applying to {gatewayName ?? "gateway"}...
            </span>
          ) : (
            <>
              <button
                onClick={() => setExpanded((p) => !p)}
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {changeCount} {changeCount === 1 ? "change" : "changes"} pending
                <ChevronUp
                  size={12}
                  className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
              <button
                onClick={onReset}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset
              </button>
            </>
          )}
        </div>
        <button
          onClick={onApply}
          disabled={applying}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {applying ? "Applying..." : "Apply Changes"}
        </button>
      </div>
    </div>
  );
}
