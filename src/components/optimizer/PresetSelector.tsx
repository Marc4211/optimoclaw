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
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Presets:</span>
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelect(preset)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            activePresetId === preset.id
              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
              : "bg-muted text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          {preset.label}
          <span className="ml-1 opacity-60">· {preset.description}</span>
        </button>
      ))}
    </div>
  );
}
