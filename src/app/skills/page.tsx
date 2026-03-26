import { Wrench } from "lucide-react";
import EmptyState from "@/components/EmptyState";

export default function SkillsPage() {
  return (
    <EmptyState
      icon={Wrench}
      title="Skill Studio"
      what="A purpose-built editor for SKILL.md files with live testing, input/output sandboxing, and one-click publish to ClaWHub."
      why="Coming in Phase 4. This is the most design-intensive panel and is being built last to do it right."
    />
  );
}
