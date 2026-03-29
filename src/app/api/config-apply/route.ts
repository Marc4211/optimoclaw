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

    // --- Sync heartbeat frequency to agent workspace markdown files ---
    // When heartbeat.every changes, search the agent's workspace for .md files
    // that reference the old frequency and update them to the new value.
    // This keeps agent documentation (HEARTBEAT.md, AGENTS.md, etc.) in sync
    // with the actual config so agents don't have stale self-knowledge.
    const heartbeatChanges = changes.filter(
      (c) => c.key.endsWith(".heartbeat.every") && results.find((r) => r.key === c.key)?.ok
    );

    for (const hbChange of heartbeatChanges) {
      try {
        // Extract agent index from key like "agents.list[0].heartbeat.every"
        const idxMatch = hbChange.key.match(/agents\.list\[(\d+)\]/);
        if (!idxMatch) continue;
        const idx = idxMatch[1];

        // Get the agent's workspace path from config
        const wsCmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} config get 'agents.list[${idx}].workspace'`;
        const { stdout: wsOut } = await execAsync(wsCmd, { timeout: 10000, shell: "/bin/zsh" });
        const workspace = wsOut.trim().replace(/^["']|["']$/g, "");
        if (!workspace) continue;

        // Read top-level .md files in the workspace
        const files = await readdir(workspace).catch(() => [] as string[]);
        const mdFiles = files.filter((f) => f.toLowerCase().endsWith(".md"));

        const newFreq = String(hbChange.value); // e.g. "30m", "60m", "15m"

        // Pattern matches frequency values like "30m", "60m", "15min", "1h", "every 30 minutes"
        // Only in lines that contextually reference heartbeat/frequency/check-in/interval
        const contextPattern = /\b(heartbeat|check.?in|frequency|interval|every)\b/i;
        const freqPattern = /\b(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/gi;

        // Format new frequency for readable text (e.g. "30m" → "30 minutes", "1h" → "60 minutes")
        const newMinutes = newFreq === "1h" ? 60 : parseInt(newFreq);
        const newReadable = `${newMinutes} minutes`;
        const newShort = `${newMinutes}m`;

        let synced = 0;

        for (const mdFile of mdFiles) {
          const filePath = join(workspace, mdFile);
          const content = await readFile(filePath, "utf-8").catch(() => null);
          if (!content) continue;

          const lines = content.split("\n");
          let changed = false;

          const updatedLines = lines.map((line) => {
            // Only touch lines that mention heartbeat/frequency context
            if (!contextPattern.test(line)) return line;

            // Replace frequency values in the line
            const updated = line.replace(freqPattern, (match, num, unit) => {
              const origMinutes = unit.startsWith("h") ? parseInt(num) * 60 : parseInt(num);
              // Only replace if it looks like a heartbeat interval (5-120 min range)
              if (origMinutes < 5 || origMinutes > 120) return match;
              if (origMinutes === newMinutes) return match; // already correct

              changed = true;
              // Preserve the original format style
              if (unit === "m") return newShort;
              if (unit.startsWith("min")) return `${newMinutes} ${unit}`;
              if (unit.startsWith("h")) return `${newMinutes}m`; // convert hours to minutes
              return `${newMinutes}${unit}`;
            });

            return updated;
          });

          if (changed) {
            await writeFile(filePath, updatedLines.join("\n"), "utf-8");
            synced++;
            console.log(`[config-apply] Synced heartbeat frequency in ${filePath}`);
          }
        }

        if (synced > 0) {
          console.log(`[config-apply] Updated ${synced} markdown file(s) in ${workspace}`);
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
