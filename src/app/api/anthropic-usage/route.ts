import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy for the Anthropic Admin API usage endpoint.
 * The browser can't call api.anthropic.com directly (CORS),
 * so we proxy through this Next.js API route.
 *
 * The Admin key is passed in the x-admin-key header and
 * forwarded to Anthropic as x-api-key. It never touches disk.
 */

const ANTHROPIC_API = "https://api.anthropic.com";

export async function GET(request: NextRequest) {
  const adminKey = request.headers.get("x-admin-key");

  if (!adminKey) {
    return NextResponse.json(
      { error: "Missing x-admin-key header" },
      { status: 400 }
    );
  }

  // Forward all query params as-is
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams(searchParams);

  const anthropicUrl = `${ANTHROPIC_API}/v1/organizations/usage_report/messages?${params.toString()}`;

  try {
    const res = await fetch(anthropicUrl, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    });

    const body = await res.text();

    // Forward the status and body from Anthropic
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to reach Anthropic API: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      { status: 502 }
    );
  }
}
