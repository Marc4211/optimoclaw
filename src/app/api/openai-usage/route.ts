import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for the OpenAI Usage & Costs API.
 *
 * The Admin key is passed in the x-admin-key header and
 * forwarded to OpenAI as Authorization: Bearer. It never touches disk.
 *
 * OpenAI Usage API: https://api.openai.com/v1/organization/usage/completions
 * OpenAI Costs API: https://api.openai.com/v1/organization/costs
 */

const OPENAI_API = "https://api.openai.com";
const OPENAI_HEADERS = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");

  if (!adminKey) {
    return NextResponse.json(
      { available: false, error: "Missing x-admin-key header" },
      { status: 400 }
    );
  }

  if (!adminKey.startsWith("sk-")) {
    return NextResponse.json({
      available: false,
      error:
        "This doesn't look like an OpenAI API key. Keys start with sk-. Create an Admin key at platform.openai.com → Settings → Admin Keys.",
      setupUrl: "https://platform.openai.com/settings/organization/admin-keys",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - days * 86400;

    // Fetch usage (tokens by model) and costs (USD) in parallel
    const usageParams = new URLSearchParams({
      start_time: String(startTime),
      bucket_width: "1d",
      limit: "31",
    });
    usageParams.append("group_by[]", "model");

    const costParams = new URLSearchParams({
      start_time: String(startTime),
      bucket_width: "1d",
      limit: "31",
    });

    const [usageRes, costRes] = await Promise.all([
      fetch(
        `${OPENAI_API}/v1/organization/usage/completions?${usageParams.toString()}`,
        { headers: OPENAI_HEADERS(adminKey) }
      ),
      fetch(
        `${OPENAI_API}/v1/organization/costs?${costParams.toString()}`,
        { headers: OPENAI_HEADERS(adminKey) }
      ),
    ]);

    if (!usageRes.ok) {
      const errText = await usageRes.text();
      if (usageRes.status === 401 || usageRes.status === 403) {
        return NextResponse.json(
          {
            available: false,
            error:
              "This key was rejected by OpenAI. Make sure it's an Admin key with usage permissions. Standard API keys won't work.",
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

    // Costs endpoint is best-effort
    let costData = null;
    if (costRes.ok) {
      costData = await costRes.json();
    }

    const startDate = new Date(startTime * 1000).toISOString().slice(0, 19) + "Z";
    const endDate = new Date(now * 1000).toISOString().slice(0, 19) + "Z";

    return NextResponse.json({
      available: true,
      usage: usageData,
      cost: costData,
      period: { start: startDate, end: endDate, days },
      source: "openai",
    });
  } catch (err) {
    return NextResponse.json({
      available: true,
      error:
        err instanceof Error
          ? err.message
          : "Failed to fetch usage from OpenAI",
    });
  }
}
