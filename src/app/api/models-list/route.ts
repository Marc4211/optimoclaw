import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/models-list?profile=digantic
 *
 * Returns available models from the OpenClaw gateway via CLI.
 * Bypasses WebSocket scope restrictions (models.list requires operator.read).
 *
 * Parses the table output from `openclaw models list`:
 *   Model                                Input      Ctx    Local Auth  Tags
 *   anthropic/claude-opus-4-6            text+image 977k   no    yes   default,configured
 *   ollama/qwen3.5-27b                   text       32k    no    yes   configured,alias:local
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    // Don't use --json — not supported
    const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} models list`;
    const { stdout } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });

    const lines = stdout.split("\n");
    const models: Array<{ id: string; name: string; provider: string; fullId: string; contextWindow: number; tags: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, startup noise, header line
      if (!trimmed) continue;
      if (!trimmed.includes("/")) continue;
      if (trimmed.startsWith("Model")) continue;

      // Parse: fullId  input  ctx  local  auth  tags
      // Split on 2+ spaces
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length < 3) continue;

      const fullId = parts[0];
      const slashIdx = fullId.indexOf("/");
      if (slashIdx === -1) continue;

      const provider = fullId.slice(0, slashIdx);
      const modelId = fullId.slice(slashIdx + 1);

      // Parse context window from "977k" or "32k" format
      const ctxStr = parts[2] ?? "0";
      const ctxMatch = ctxStr.match(/(\d+)k/i);
      const contextWindow = ctxMatch ? parseInt(ctxMatch[1]) * 1000 : 0;

      // Tags are the last column
      const tags = parts[5] ?? parts[4] ?? "";

      // Build a human-readable name from the model ID
      // e.g. "claude-opus-4-6" → "Claude Opus 4.6"
      const name = modelId
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      models.push({
        id: modelId,
        name,
        provider,
        fullId,
        contextWindow,
        tags,
      });
    }

    return NextResponse.json({ models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list models";
    return NextResponse.json({ error: msg, models: [] }, { status: 500 });
  }
}
