import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/config-get?profile=digantic&agentCount=7
 *
 * Reads optimizer-relevant config values from OpenClaw via CLI.
 * Runs all reads in parallel to minimize startup overhead.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const key = request.nextUrl.searchParams.get("key") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    if (key) {
      const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get '${key}'`;
      const { stdout } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });
      return NextResponse.json({ key, value: extractValue(stdout) });
    }

    // Global config keys to read
    const globalKeys = [
      "agents.defaults.model.primary",
      "agents.defaults.heartbeat.model",
      "agents.defaults.heartbeat.every",
      "agents.defaults.compaction.model",
      "agents.defaults.compaction.threshold",
      "agents.defaults.subagents.maxConcurrent",
    ];

    const agentCount = Number(request.nextUrl.searchParams.get("agentCount") ?? "7");

    // Build all CLI commands and run them in PARALLEL
    const tasks: Array<{ key: string; cmd: string; type: "value" | "json" }> = [];

    // Global keys — each as a separate command for parallel exec
    for (const k of globalKeys) {
      tasks.push({
        key: k,
        cmd: `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get '${k}' 2>/dev/null`,
        type: "value",
      });
    }

    // Per-agent objects — read full JSON objects
    for (let i = 0; i < agentCount; i++) {
      tasks.push({
        key: `agent.${i}`,
        cmd: `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get 'agents.list[${i}]' 2>/dev/null`,
        type: "json",
      });
    }

    // Execute ALL commands in parallel
    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        const { stdout } = await execAsync(task.cmd, { timeout: 15000, shell: "/bin/zsh" });
        return { ...task, stdout };
      })
    );

    const config: Record<string, string> = {};

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { key, stdout, type } = result.value;

      if (type === "value") {
        const val = extractValue(stdout);
        if (val && !val.includes("not found")) {
          config[key] = val;
        }
      } else if (type === "json") {
        // Extract JSON object from mixed output
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const agent = JSON.parse(jsonMatch[0]);
            const idx = key.split(".")[1]; // "agent.0" → "0"
            const agentId = agent.id ?? agent.name ?? `agent${idx}`;
            config[`agents.list[${idx}].name`] = agentId;
            if (agent.model?.primary) {
              config[`agents.list[${idx}].model.primary`] = agent.model.primary;
            }
            if (agent.heartbeat?.every) {
              config[`agents.list[${idx}].heartbeat.every`] = agent.heartbeat.every;
            }
            if (agent.heartbeat?.model) {
              config[`agents.list[${idx}].heartbeat.model`] = agent.heartbeat.model;
            }
          } catch { /* JSON parse failed */ }
        }
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
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) continue;
    if (trimmed.includes("Plugin loaded")) continue;
    if (trimmed.includes("mycelium:")) continue;
    if (trimmed.includes("🦞")) continue;
    if (trimmed.includes("OpenClaw")) continue;
    if (trimmed.startsWith("│")) continue;
    if (trimmed.startsWith("◇")) continue;
    return trimmed;
  }
  return stdout.trim();
}
