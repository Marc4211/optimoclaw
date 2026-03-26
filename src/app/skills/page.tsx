import { Wrench } from "lucide-react";

export default function SkillsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Wrench size={24} className="text-primary" />
      </div>
      <h1 className="text-lg font-semibold">Skill Studio</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Author, test, and publish SKILL.md files with a live test runner and
        input/output sandbox.
      </p>
      <span className="mt-4 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Coming in Phase 4
      </span>
    </div>
  );
}
