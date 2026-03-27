"use client";

interface StickyApplyBarProps {
  changeCount: number;
  applying: boolean;
  gatewayName?: string;
  onApply: () => void;
  onReset: () => void;
}

export default function StickyApplyBar({
  changeCount,
  applying,
  gatewayName,
  onApply,
  onReset,
}: StickyApplyBarProps) {
  if (changeCount === 0 && !applying) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-3">
        <div className="flex items-center gap-3">
          {applying ? (
            <span className="text-sm font-medium text-warning animate-pulse">
              Applying to {gatewayName ?? "gateway"}...
            </span>
          ) : (
            <>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {changeCount} {changeCount === 1 ? "change" : "changes"} pending
              </span>
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
