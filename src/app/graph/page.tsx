import { Activity } from "lucide-react";

export default function GraphPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Activity size={24} className="text-primary" />
      </div>
      <h1 className="text-lg font-semibold">Performance Graph</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Live agent topology with token spend overlays, cost hotspots, and
        session drill-downs.
      </p>
      <span className="mt-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Coming in Phase 3
      </span>
    </div>
  );
}
