"use client";

import { X } from "lucide-react";
import { ConfigDiff } from "@/types/optimizer";

interface DiffPreviewProps {
  diffs: ConfigDiff[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DiffPreview({
  diffs,
  onConfirm,
  onCancel,
}: DiffPreviewProps) {
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

        <p className="mb-4 text-sm text-muted-foreground">
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
                <span className="text-muted-foreground">→</span>
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
            onClick={onConfirm}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Apply & Restart Gateway
          </button>
        </div>
      </div>
    </div>
  );
}
