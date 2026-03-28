import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/sessions?profile=digantic
 *
 * Runs `openclaw status --usage --json` to get per-session token usage.
 * This returns richer data than `sessions --all-agents --json`, including
 * cacheRead/cacheWrite breakdowns and per-session model assignments.
 *
 * Returns a summary with tokens aggregated by model, suitable for sorting
 * the model routing display by actual usage.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} status --usage --json 2>/dev/null`;
    const { stdout } = await execAsync(cmd, { timeout: 30000, shell: "/bin/zsh" });

    // Extract the JSON object from the output (may have banner/plugin logs before it)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        sessions: [],
        summary: emptySummary(),
        error: "No JSON found in status output",
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return NextResponse.json({
        sessions: [],
        summary: emptySummary(),
        error: `Failed to parse status JSON: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }

    // Sessions live at parsed.sessions.recent[]
    const sessionsObj = parsed.sessions as Record<string, unknown> | undefined;
    const rawSessions = Array.isArray(sessionsObj?.recent) ? sessionsObj.recent : [];

    const sessions: SessionData[] = [];

    for (const item of rawSessions) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;

      const inputTokens = Number(s.inputTokens ?? 0);
      const outputTokens = Number(s.outputTokens ?? 0);
      const cacheRead = Number(s.cacheRead ?? 0);
      const cacheWrite = Number(s.cacheWrite ?? 0);
      const totalTokens = Number(s.totalTokens ?? 0);
      const model = String(s.model ?? "unknown");
      const agentId = String(s.agentId ?? "unknown");
      const sessionId = String(s.sessionId ?? "");
      const totalTokensFresh = Boolean(s.totalTokensFresh);

      // Skip sessions with no token data (stale/unfresh)
      if (!totalTokensFresh && totalTokens === 0) continue;

      sessions.push({
        sessionId,
        agentId,
        model,
        inputTokens,
        outputTokens,
        cacheRead,
        cacheWrite,
        totalTokens,
      });
    }

    // Build summary aggregations
    const byModel = new Map<
      string,
      {
        model: string;
        inputTokens: number;
        outputTokens: number;
        cacheRead: number;
        cacheWrite: number;
        totalTokens: number;
        sessionCount: number;
      }
    >();

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;
    let totalTokens = 0;

    for (const s of sessions) {
      totalInput += s.inputTokens;
      totalOutput += s.outputTokens;
      totalCacheRead += s.cacheRead;
      totalCacheWrite += s.cacheWrite;
      totalTokens += s.totalTokens;

      const existing = byModel.get(s.model);
      if (existing) {
        existing.inputTokens += s.inputTokens;
        existing.outputTokens += s.outputTokens;
        existing.cacheRead += s.cacheRead;
        existing.cacheWrite += s.cacheWrite;
        existing.totalTokens += s.totalTokens;
        existing.sessionCount += 1;
      } else {
        byModel.set(s.model, {
          model: s.model,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          cacheRead: s.cacheRead,
          cacheWrite: s.cacheWrite,
          totalTokens: s.totalTokens,
          sessionCount: 1,
        });
      }
    }

    return NextResponse.json({
      sessions,
      summary: {
        totalInput,
        totalOutput,
        totalCacheRead,
        totalCacheWrite,
        totalTokens,
        sessionCount: sessions.length,
        byModel: Array.from(byModel.values()),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read status";
    return NextResponse.json({ error: msg, sessions: [], summary: emptySummary() }, { status: 500 });
  }
}

function emptySummary() {
  return {
    totalInput: 0,
    totalOutput: 0,
    totalCacheRead: 0,
    totalCacheWrite: 0,
    totalTokens: 0,
    sessionCount: 0,
    byModel: [],
  };
}

interface SessionData {
  sessionId: string;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}
