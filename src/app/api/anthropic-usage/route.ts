import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for the Anthropic Admin API — fetches both usage (tokens)
 * and cost (USD) reports in parallel.
 *
 * Based on the proven pattern from broadclaw-usage-reference/claude-usage-api-route.ts.
 *
 * The Admin key is passed in the x-admin-key header and
 * forwarded to Anthropic as x-api-key. It never touches disk.
 */

const ANTHROPIC_API = "https://api.anthropic.com";
const ANTHROPIC_HEADERS = (key: string) => ({
  "anthropic-version": "2023-06-01",
  "x-api-key": key,
  "User-Agent": "BroadClaw/1.0",
});

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");

  if (!adminKey) {
    return NextResponse.json(
      { available: false, error: "Missing x-admin-key header" },
      { status: 400 }
    );
  }

  if (!adminKey.startsWith("sk-ant-admin")) {
    return NextResponse.json({
      available: false,
      error:
        "This doesn't look like an Admin key. Admin keys start with sk-ant-admin. Create one at console.anthropic.com → Settings → Admin Keys.",
      setupUrl: "https://console.anthropic.com/settings/admin-keys",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "7", 10);
    const start = new Date();
    start.setDate(start.getDate() - days);
    const end = new Date();

    const startStr = start.toISOString().slice(0, 19) + "Z";
    const endStr = end.toISOString().slice(0, 19) + "Z";

    // Fetch usage (tokens) and cost (USD) in parallel
    const [usageRes, costRes] = await Promise.all([
      fetch(
        `${ANTHROPIC_API}/v1/organizations/usage_report/messages?` +
          new URLSearchParams({
            starting_at: startStr,
            ending_at: endStr,
            bucket_width: "1d",
            limit: "31",
          }),
        { headers: ANTHROPIC_HEADERS(adminKey) }
      ),
      fetch(
        `${ANTHROPIC_API}/v1/organizations/cost_report?` +
          new URLSearchParams({
            starting_at: startStr,
            ending_at: endStr,
            limit: "31",
          }),
        { headers: ANTHROPIC_HEADERS(adminKey) }
      ),
    ]);

    if (!usageRes.ok) {
      const errText = await usageRes.text();
      if (usageRes.status === 401 || usageRes.status === 403) {
        return NextResponse.json(
          {
            available: false,
            error:
              "This key was rejected by Anthropic. Make sure it's an Admin key with usage permissions.",
          },
          { status: usageRes.status }
        );
      }
      return NextResponse.json({
        available: true,
        error: `Usage API error: ${usageRes.status} - ${errText.slice(0, 200)}`,
      });
    }

    const usageData = await usageRes.json();

    // Cost endpoint is best-effort — may not be available for all orgs
    let costData = null;
    if (costRes.ok) {
      costData = await costRes.json();
    }

    return NextResponse.json({
      available: true,
      usage: usageData,
      cost: costData,
      period: { start: startStr, end: endStr, days },
      source: "anthropic",
    });
  } catch (err) {
    return NextResponse.json({
      available: true,
      error:
        err instanceof Error
          ? err.message
          : "Failed to fetch usage from Anthropic",
    });
  }
}
