import { Activity } from "lucide-react";
import EmptyState from "@/components/EmptyState";

export default function GraphPage() {
  return (
    <EmptyState
      icon={Activity}
      title="Performance Graph"
      what="A live agent graph with token spend overlays, cost hotspots, and session drill-downs. Click any node to see detailed metrics."
      why="Coming in Phase 3. The graph will connect to your gateway's WebSocket feed for real-time data."
    />
  );
}
