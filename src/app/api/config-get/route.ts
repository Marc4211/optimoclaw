import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/config-get?profile=digantic&key=agents.defaults.model.primary
 *
 * Reads a config value from OpenClaw via CLI.
 * If no key is provided, reads the full config as JSON.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const key = request.nextUrl.searchParams.get("key") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    // Read multiple keys we need for the optimizer in one shot
    const keys = [
      "agents.defaults.model.primary",
      "agents.defaults.heartbeat.model",
      "agents.defaults.heartbeat.every",
      "agents.defaults.compaction.model",
      "agents.defaults.compaction.threshold",
      "agents.defaults.subagents.maxConcurrent",
    ];

    if (key) {
      // Single key read
      const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get '${key}'`;
      const { stdout } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });
      const value = extractValue(stdout);
      return NextResponse.json({ key, value });
    }

    // Read all optimizer-relevant keys
    const config: Record<string, string> = {};
    for (const k of keys) {
      try {
        const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get '${k}'`;
        const { stdout } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });
        config[k] = extractValue(stdout);
      } catch {
        // Key doesn't exist — skip
      }
    }

    // Read per-agent model overrides
    // The agentCount query param tells us how many agents to check (from gateway snapshot)
    const agentCount = Number(request.nextUrl.searchParams.get("agentCount") ?? "10");
    for (let i = 0; i < agentCount; i++) {
      // Read agent id (the config uses "id" not "name")
      try {
        const idCmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get 'agents.list[${i}].id'`;
        const { stdout: idOut } = await execAsync(idCmd, { timeout: 10000, shell: "/bin/zsh" });
        const agentId = extractValue(idOut);
        if (agentId && !agentId.includes("Error") && !agentId.includes("not found") && !agentId.includes("undefined")) {
          config[`agents.list[${i}].name`] = agentId; // Store as "name" for compatibility with the optimizer
          // Read per-agent model override
          try {
            const mCmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get 'agents.list[${i}].model.primary'`;
            const { stdout: mOut } = await execAsync(mCmd, { timeout: 10000, shell: "/bin/zsh" });
            const model = extractValue(mOut);
            if (model && !model.includes("Error") && !model.includes("undefined")) {
              config[`agents.list[${i}].model.primary`] = model;
            }
          } catch { /* no per-agent model override */ }
        } else {
          break; // No more agents
        }
      } catch {
        break; // Index out of range
      }
    }

    return NextResponse.json({ config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read config";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Extract the actual value from openclaw CLI output (strip banners, plugin logs) */
function extractValue(stdout: string): string {
  const lines = stdout.split("\n");
  // The value is typically on a line by itself, after plugin loading messages
  // Filter out known noise patterns
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) continue;  // [plugins] lines
    if (trimmed.includes("Plugin loaded")) continue;
    if (trimmed.includes("mycelium:")) continue;
    if (trimmed.includes("🦞")) continue;
    if (trimmed.includes("OpenClaw")) continue;
    if (trimmed.startsWith("│")) continue;
    if (trimmed.startsWith("◇")) continue;
    // This should be the actual value
    return trimmed;
  }
  return stdout.trim();
}
