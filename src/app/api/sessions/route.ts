import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/sessions?profile=digantic
 *
 * Runs `openclaw sessions --all-agents --json` to get per-session token usage.
 *
 * OpenClaw output format:
 * {
 *   "sessions": [
 *     {
 *       "key": "agent:gretta:main",
 *       "inputTokens": 12,
 *       "outputTokens": 1355,
 *       "totalTokens": 89788,
 *       "model": "claude-sonnet-4-6",
 *       "modelProvider": "anthropic",
 *       ...
 *     }
 *   ],
 *   "stores": [ { "agentId": "gretta", "path": "..." } ],
 *   "count": 4
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const profile = request.nextUrl.searchParams.get("profile") ?? "";
    const profileFlag = profile ? `--profile '${profile}'` : "";

    const cmd = `source ~/.zshrc 2>/dev/null; openclaw ${profileFlag} sessions --all-agents --json 2>/dev/null`;
    const { stdout } = await execAsync(cmd, { timeout: 30000, shell: "/bin/zsh" });

    // Extract the JSON object from the output (may have banner/plugin logs before it)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        sessions: [],
        summary: { totalInput: 0, totalOutput: 0, totalTokens: 0, sessionCount: 0, byModel: [], byAgent: [] },
        error: "No JSON found in sessions output",
        raw: stdout.slice(0, 500),
      });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return NextResponse.json({
        sessions: [],
        summary: { totalInput: 0, totalOutput: 0, totalTokens: 0, sessionCount: 0, byModel: [], byAgent: [] },
        error: `Failed to parse sessions JSON: ${e instanceof Error ? e.message : "unknown"}`,
        raw: jsonMatch[0].slice(0, 500),
      });
    }

    // Sessions are inside parsed.sessions[]
    const rawSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    const sessions: SessionData[] = [];

    for (const item of rawSessions) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;

      const inputTokens = Number(s.inputTokens ?? 0);
      const outputTokens = Number(s.outputTokens ?? 0);
      const totalTokens = Number(s.totalTokens ?? inputTokens + outputTokens);
      const model = String(s.model ?? "unknown");
      const modelProvider = String(s.modelProvider ?? "unknown");
      const sessionId = String(s.sessionId ?? s.id ?? "");

      // Extract agentId from session key "agent:gretta:main" → "gretta"
      const key = String(s.key ?? "");
      const keyParts = key.split(":");
      const agentId = keyParts.length >= 2 ? keyParts[1] : String(s.agentId ?? "unknown");

      sessions.push({
        sessionId,
        agentId,
        model,
        modelProvider,
        inputTokens,
        outputTokens,
        totalTokens,
      });
    }

    // Build summary aggregations
    const byModel = new Map<string, { model: string; modelProvider: string; inputTokens: number; outputTokens: number; totalTokens: number }>();
    const byAgent = new Map<string, { agentId: string; inputTokens: number; outputTokens: number; totalTokens: number; models: Set<string> }>();

    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;

    for (const s of sessions) {
      totalInput += s.inputTokens;
      totalOutput += s.outputTokens;
      totalTokens += s.totalTokens;

      // By model
      const existing = byModel.get(s.model);
      if (existing) {
        existing.inputTokens += s.inputTokens;
        existing.outputTokens += s.outputTokens;
        existing.totalTokens += s.totalTokens;
      } else {
        byModel.set(s.model, {
          model: s.model,
          modelProvider: s.modelProvider,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          totalTokens: s.totalTokens,
        });
      }

      // By agent
      const agentEntry = byAgent.get(s.agentId);
      if (agentEntry) {
        agentEntry.inputTokens += s.inputTokens;
        agentEntry.outputTokens += s.outputTokens;
        agentEntry.totalTokens += s.totalTokens;
        agentEntry.models.add(s.model);
      } else {
        byAgent.set(s.agentId, {
          agentId: s.agentId,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          totalTokens: s.totalTokens,
          models: new Set([s.model]),
        });
      }
    }

    return NextResponse.json({
      sessions,
      summary: {
        totalInput,
        totalOutput,
        totalTokens,
        sessionCount: sessions.length,
        byModel: Array.from(byModel.values()),
        byAgent: Array.from(byAgent.values()).map((a) => ({
          ...a,
          models: Array.from(a.models),
        })),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read sessions";
    return NextResponse.json({ error: msg, sessions: [], summary: null }, { status: 500 });
  }
}

interface SessionData {
  sessionId: string;
  agentId: string;
  model: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
