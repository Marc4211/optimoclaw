import { NextResponse } from "next/server";

/**
 * GET /api/app-state
 *
 * Returns the full BroadClaw app state as JSON for agent consumption.
 *
 * Since most state lives in client-side React contexts (localStorage),
 * this endpoint returns a static manifest. The real-time state is
 * available via:
 *   1. data-* attributes on DOM elements (agent-readable)
 *   2. window.__BROADCLAW_STATE__ (injected by AppStateProvider)
 *
 * This route serves as the discovery endpoint — agents hit this first
 * to learn how to read the app.
 */
export async function GET() {
  return NextResponse.json({
    app: "broadclaw",
    version: "0.1.0",
    stateSource: "client",
    instructions: {
      dom: "Read data-* attributes on page elements. Key attributes: data-page, data-gateway-connected, data-gateway-name, data-agent-id, data-agent-status, data-lever, data-value, data-cost-delta, data-actual, data-projected, data-delta, data-section, data-section-cost, data-connect-status.",
      js: "Access window.__BROADCLAW_STATE__ for full JSON state object.",
      pages: {
        agents: "/agents — data-page='agents', agent cards have data-agent-* attributes",
        optimizer: "/optimizer — data-page='optimizer', levers have data-lever/data-value/data-cost-delta, cost bar has data-actual/data-projected/data-delta",
        connect: "/connect — data-page='connect', data-connect-status='connected|disconnected|error'",
        skills: "/skills — data-page='skills' (placeholder)",
      },
    },
  });
}
