import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/sessions?profile=digantic
 *
 * Runs `openclaw status --usage --json` to get per-session token usage.
 * Returns aggregated data for:
 *  - Model token usage (for sorting the routing display)
 *  - Context utilization per session (window size vs used)
 *  - Cache efficiency breakdown (cacheRead/cacheWrite/fresh input/output)
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
      const contextTokens = Number(s.contextTokens ?? 0);
      const percentUsed = s.percentUsed != null ? Number(s.percentUsed) : null;
      const remainingTokens = s.remainingTokens != null ? Number(s.remainingTokens) : null;
      const model = String(s.model ?? "unknown");
      const agentId = String(s.agentId ?? "unknown");
      const sessionId = String(s.sessionId ?? "");
      const kind = String(s.kind ?? "unknown");
      const totalTokensFresh = Boolean(s.totalTokensFresh);

      sessions.push({
        sessionId,
        agentId,
        model,
        kind,
        inputTokens,
        outputTokens,
        cacheRead,
        cacheWrite,
        totalTokens,
        contextTokens,
        percentUsed,
        remainingTokens,
        totalTokensFresh,
      });
    }

    // --- Aggregations ---

    // By model (for routing sort)
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

    // Only count fresh sessions for token aggregations
    const freshSessions = sessions.filter((s) => s.totalTokensFresh);

    for (const s of freshSessions) {
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

    // Context utilization — per session with window info
    const contextSessions = sessions
      .filter((s) => s.contextTokens > 0 && s.percentUsed != null)
      .map((s) => ({
        agentId: s.agentId,
        model: s.model,
        kind: s.kind,
        totalTokens: s.totalTokens,
        contextTokens: s.contextTokens,
        percentUsed: s.percentUsed!,
        remainingTokens: s.remainingTokens ?? 0,
      }));

    const avgPercentUsed =
      contextSessions.length > 0
        ? contextSessions.reduce((sum, s) => sum + s.percentUsed, 0) / contextSessions.length
        : 0;

    const totalContextAvailable = contextSessions.reduce((sum, s) => sum + s.contextTokens, 0);
    const totalContextUsed = contextSessions.reduce((sum, s) => sum + s.totalTokens, 0);

    // Cache breakdown — percentage of each token type
    const tokenTotal = totalInput + totalOutput + totalCacheRead + totalCacheWrite;
    const cacheBreakdown = {
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheWrite,
      tokenTotal,
      cacheReadPercent: tokenTotal > 0 ? (totalCacheRead / tokenTotal) * 100 : 0,
      cacheWritePercent: tokenTotal > 0 ? (totalCacheWrite / tokenTotal) * 100 : 0,
      freshInputPercent: tokenTotal > 0 ? (totalInput / tokenTotal) * 100 : 0,
      outputPercent: tokenTotal > 0 ? (totalOutput / tokenTotal) * 100 : 0,
    };

    return NextResponse.json({
      sessions,
      summary: {
        totalInput,
        totalOutput,
        totalCacheRead,
        totalCacheWrite,
        totalTokens,
        sessionCount: freshSessions.length,
        byModel: Array.from(byModel.values()),
        contextUtilization: {
          sessions: contextSessions,
          avgPercentUsed,
          totalContextAvailable,
          totalContextUsed,
        },
        cacheBreakdown,
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
    contextUtilization: {
      sessions: [],
      avgPercentUsed: 0,
      totalContextAvailable: 0,
      totalContextUsed: 0,
    },
    cacheBreakdown: {
      totalInput: 0,
      totalOutput: 0,
      totalCacheRead: 0,
      totalCacheWrite: 0,
      tokenTotal: 0,
      cacheReadPercent: 0,
      cacheWritePercent: 0,
      freshInputPercent: 0,
      outputPercent: 0,
    },
  };
}

interface SessionData {
  sessionId: string;
  agentId: string;
  model: string;
  kind: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  contextTokens: number;
  percentUsed: number | null;
  remainingTokens: number | null;
  totalTokensFresh: boolean;
}
