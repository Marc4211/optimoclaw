import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

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
    for (const { key, value } of changes) {
      const cmd = `openclaw ${profileFlag} config set ${key} ${JSON.stringify(String(value))}`;
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 15000 });
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

    // Restart gateway if requested and all changes succeeded
    const allOk = results.every((r) => r.ok);
    let restartResult: { ok: boolean; output?: string; error?: string } | null = null;

    if (restart && allOk) {
      const restartCmd = `openclaw ${profileFlag} gateway restart`;
      try {
        const { stdout, stderr } = await execAsync(restartCmd, { timeout: 30000 });
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
