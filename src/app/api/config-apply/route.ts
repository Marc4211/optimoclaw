import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

/**
 * POST /api/config-apply
 *
 * Applies config changes by shelling out to the openclaw CLI.
 * This bypasses the WebSocket scope restrictions entirely —
 * the CLI has full local access.
 *
 * Body: {
 *   profile?: string;          // openclaw profile (e.g. "digantic")
 *   changes: Array<{ key: string; value: string | number }>;
 *   restart?: boolean;          // restart gateway after applying (default true)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile, changes, restart = true } = body as {
      profile?: string;
      changes: Array<{ key: string; value: string | number }>;
      restart?: boolean;
    };

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    const profileFlag = profile ? `--profile ${profile}` : "";
    const results: Array<{ key: string; value: string | number; ok: boolean; output?: string; error?: string }> = [];

    // Apply each config change via openclaw config set
    // Single-quote the key to prevent shell glob expansion on bracket notation
    // e.g. agents.list[0].model.primary → 'agents.list[0].model.primary'
    for (const { key, value } of changes) {
      const quotedKey = `'${key}'`;
      const quotedValue = `'${String(value)}'`;
      const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config set ${quotedKey} ${quotedValue}`;
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 15000, shell: "/bin/zsh" });
        results.push({
          key,
          value,
          ok: true,
          output: (stdout || stderr).trim(),
        });
      } catch (err) {
        const execErr = err as { stderr?: string; message?: string };
        results.push({
          key,
          value,
          ok: false,
          error: execErr.stderr?.trim() || execErr.message || "Command failed",
        });
      }
    }

    // --- Sync agent config changes to workspace markdown files ---
    // When heartbeat settings (frequency or model), agent model, or other
    // agent-scoped config changes are applied, search the agent's workspace
    // for .md files that reference the old values and update them.
    // This keeps agent documentation (HEARTBEAT.md, AGENTS.md, etc.) in sync
    // with the actual config so agents don't have stale self-knowledge.

    const agentScopedChanges = changes.filter(
      (c) => c.key.match(/agents\.list\[\d+\]\./) && results.find((r) => r.key === c.key)?.ok
    );

    // Group changes by agent index so we only read workspace files once per agent
    const changesByAgent = new Map<string, typeof agentScopedChanges>();
    for (const change of agentScopedChanges) {
      const idxMatch = change.key.match(/agents\.list\[(\d+)\]/);
      if (!idxMatch) continue;
      const idx = idxMatch[1];
      const existing = changesByAgent.get(idx) ?? [];
      existing.push(change);
      changesByAgent.set(idx, existing);
    }

    for (const [idx, agentChanges] of changesByAgent) {
      try {
        // Get the agent's workspace path from config
        const wsCmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get 'agents.list[${idx}].workspace'`;
        const { stdout: wsOut } = await execAsync(wsCmd, { timeout: 10000, shell: "/bin/zsh" });
        const workspace = wsOut.trim().replace(/^["']|["']$/g, "");
        if (!workspace) continue;

        // Read top-level .md files in the workspace
        const files = await readdir(workspace).catch(() => [] as string[]);
        const mdFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));

        // Build list of sync operations to perform
        const syncOps: Array<{
          contextPattern: RegExp;
          replacePattern: RegExp;
          replacer: (match: string, ...args: string[]) => string;
          label: string;
        }> = [];

        for (const change of agentChanges) {
          const configField = change.key.replace(/agents\.list\[\d+\]\./, "");

          // --- Heartbeat frequency sync ---
          if (configField === "heartbeat.every") {
            const newFreq = String(change.value);
            const newMinutes = newFreq === "1h" ? 60 : parseInt(newFreq);
            const newShort = `${newMinutes}m`;

            syncOps.push({
              contextPattern: /\b(heartbeat|check.?in|frequency|interval|every)\b/i,
              replacePattern: /\b(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/gi,
              replacer: (_match: string, num: string, unit: string) => {
                const origMinutes = unit.startsWith("h") ? parseInt(num) * 60 : parseInt(num);
                if (origMinutes < 5 || origMinutes > 120) return _match;
                if (origMinutes === newMinutes) return _match;
                if (unit === "m") return newShort;
                if (unit.startsWith("min")) return `${newMinutes} ${unit}`;
                if (unit.startsWith("h")) return `${newMinutes}m`;
                return `${newMinutes}${unit}`;
              },
              label: `heartbeat frequency → ${newFreq}`,
            });
          }

          // --- Heartbeat model sync ---
          if (configField === "heartbeat.model") {
            const newModel = String(change.value);
            // Extract the short model name for readable replacement
            // e.g. "anthropic/claude-haiku-4-5-20251001" → "claude-haiku-4-5"
            const shortNew = newModel
              .replace(/^(anthropic|openai|ollama)\//, "")
              .replace(/-\d{8,}$/, "");

            syncOps.push({
              // Match lines mentioning heartbeat + model context
              contextPattern: /\b(heartbeat|check.?in)\b.*\b(model|using|use|with|via)\b|\b(model|using|use|with|via)\b.*\b(heartbeat|check.?in)\b/i,
              // Match model-like strings: provider/model-name or just model-name patterns
              replacePattern: /\b(anthropic|openai|ollama)\/[\w.:_-]+\b|\b(claude|gpt|llama|qwen|gemma|mistral|phi)[\w.:_-]*\b/gi,
              replacer: (match: string) => {
                // Don't replace if it already matches the new model
                if (newModel.includes(match) || match.includes(shortNew)) return match;
                // Replace with the full new model string if original had provider prefix,
                // otherwise use the short name
                if (match.includes("/")) return newModel;
                return shortNew;
              },
              label: `heartbeat model → ${shortNew}`,
            });
          }

          // --- Primary model sync ---
          if (configField === "model.primary") {
            const newModel = String(change.value);
            const shortNew = newModel
              .replace(/^(anthropic|openai|ollama)\//, "")
              .replace(/-\d{8,}$/, "");

            syncOps.push({
              // Match lines mentioning primary/default/main model context
              contextPattern: /\b(primary|default|main|agent)\b.*\b(model|using|use)\b|\b(model|using|use)\b.*\b(primary|default|main|agent)\b/i,
              replacePattern: /\b(anthropic|openai|ollama)\/[\w.:_-]+\b|\b(claude|gpt|llama|qwen|gemma|mistral|phi)[\w.:_-]*\b/gi,
              replacer: (match: string) => {
                if (newModel.includes(match) || match.includes(shortNew)) return match;
                if (match.includes("/")) return newModel;
                return shortNew;
              },
              label: `primary model → ${shortNew}`,
            });
          }
        }

        if (syncOps.length === 0) continue;

        let totalSynced = 0;

        for (const mdFile of mdFiles) {
          const filePath = join(workspace, mdFile);
          const content = await readFile(filePath, "utf-8").catch(() => null);
          if (!content) continue;

          const lines = content.split("\n");
          let fileChanged = false;

          const updatedLines = lines.map((line) => {
            let updated = line;
            for (const op of syncOps) {
              if (!op.contextPattern.test(updated)) continue;
              const before = updated;
              updated = updated.replace(op.replacePattern, op.replacer);
              if (updated !== before) fileChanged = true;
            }
            return updated;
          });

          if (fileChanged) {
            await writeFile(filePath, updatedLines.join("\n"), "utf-8");
            totalSynced++;
            console.log(`[config-apply] Synced agent docs in ${filePath}`);
          }
        }

        if (totalSynced > 0) {
          const labels = syncOps.map((o) => o.label).join(", ");
          console.log(`[config-apply] Updated ${totalSynced} file(s) in ${workspace}: ${labels}`);
        }
      } catch (err) {
        // Non-critical — don't fail the config apply if markdown sync fails
        console.warn("[config-apply] Markdown sync failed:", err);
      }
    }

    // Restart gateway if requested and all changes succeeded
    const allOk = results.every((r) => r.ok);
    let restartResult: { ok: boolean; output?: string; error?: string } | null = null;

    if (restart && allOk) {
      // Restart the gateway to pick up new config values
      const restartCmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} gateway restart`;
      try {
        const { stdout, stderr } = await execAsync(restartCmd, { timeout: 30000, shell: "/bin/zsh" });
        restartResult = { ok: true, output: (stdout || stderr).trim() };
      } catch (err) {
        const execErr = err as { stderr?: string; message?: string };
        restartResult = {
          ok: false,
          error: execErr.stderr?.trim() || execErr.message || "Restart failed",
        };
      }
    }

    return NextResponse.json({
      success: allOk,
      results,
      restart: restartResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
