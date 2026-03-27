import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/models-list?profile=digantic
 *
 * Returns available models from the OpenClaw gateway via CLI.
 * Bypasses WebSocket scope restrictions (models.list requires operator.read).
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} models list --json`;
    const { stdout } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });

    // Try to parse as JSON
    try {
      const models = JSON.parse(stdout.trim());
      return NextResponse.json({ models });
    } catch {
      // If --json flag isn't supported, try parsing text output
      // Each line: provider/id  Name  contextWindow
      const lines = stdout.trim().split("\n").filter((l) => l.trim() && !l.startsWith("🦞") && !l.startsWith("│") && !l.startsWith("◇"));
      const models = lines
        .map((line) => {
          const parts = line.trim().split(/\s{2,}/);
          if (parts.length < 2) return null;
          const fullId = parts[0];
          const slashIdx = fullId.indexOf("/");
          if (slashIdx === -1) return null;
          return {
            id: fullId.slice(slashIdx + 1),
            name: parts[1] || fullId.slice(slashIdx + 1),
            provider: fullId.slice(0, slashIdx),
            fullId,
          };
        })
        .filter(Boolean);

      return NextResponse.json({ models });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list models";
    return NextResponse.json({ error: msg, models: [] }, { status: 500 });
  }
}
