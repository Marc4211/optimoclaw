// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

"use client";

import { Preset } from "@/types/optimizer";

interface PresetSelectorProps {
  presets: Preset[];
  activePresetId: string | null;
  onSelect: (preset: Preset) => void;
}

export default function PresetSelector({
  presets,
  activePresetId,
  onSelect,
}: PresetSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-muted-foreground font-normal">Presets:</span>
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelect(preset)}
          data-preset={preset.id}
          data-selected={String(activePresetId === preset.id)}
          aria-pressed={activePresetId === preset.id}
          className={`rounded-lg px-4 py-2.5 text-[13px] font-normal transition-all ${
            activePresetId === preset.id
              ? "bg-primary text-primary-foreground"
              : "bg-surface border border-border hover:bg-surface-hover text-foreground"
          }`}
        >
          {preset.label}
          <span className="ml-1 opacity-60">· {preset.description}</span>
        </button>
      ))}
    </div>
  );
}
