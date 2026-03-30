# OptimoClaw

Token optimizer dashboard for [OpenClaw](https://github.com/openclaw/openclaw) AI agent orchestration.

OptimoClaw connects to your local OpenClaw gateway and gives you a visual interface to understand what your agents are doing, how much they cost, and what you can tune — without editing config files by hand.

## What it does

**Agents** — See every agent at a glance: which model they're actually running (not what they claim), heartbeat frequency, session count, and whether anything needs attention. Click an agent to see their sessions, context utilization, and cache efficiency.

**Token Optimizer** — Change agent config through visual levers: default model, heartbeat frequency and model, compaction threshold, session context loading, memory file scope, subagent concurrency, and more. See the impact before you apply. Use "Help me tune this" for guided suggestions (reduce cost, improve quality, faster responses).

**Session Insights** — Context utilization and cache efficiency charts with actionable analysis. Each insight either points you to a specific lever, tells you honestly there's no lever for it, or confirms things are already optimal.

## Prerequisites

- [Node.js](https://nodejs.org/) 18.17 or later
- A running [OpenClaw](https://github.com/openclaw/openclaw) instance **on the same machine**
- OpenClaw gateway accessible (e.g. `http://localhost:19009` — your port may differ)

## Quick start

```bash
git clone https://github.com/Marc4211/optimoclaw.git
cd optimoclaw
npm install
npm run build
npx next start -p 3070
```

Open [http://localhost:3070](http://localhost:3070) in your browser.

## Connect to your gateway

1. Open OptimoClaw in your browser
2. Click **Connect Gateway** in the sidebar
3. Enter a name (e.g. "Local", "Production"), your gateway URL, and gateway token
4. Click Connect

You can save multiple gateway connections and switch between them using the switcher at the bottom of the sidebar.

## How it works

OptimoClaw reads live data from your OpenClaw instance through two channels:

- **WebSocket** — connects to the gateway for real-time agent status, session counts, and available models
- **CLI** — runs `openclaw config get` and `openclaw status --usage --json` on the local machine for config values and session token data

When you adjust levers in the Token Optimizer and click **Apply Changes**, OptimoClaw:

1. Runs `openclaw config set` for each changed value
2. Restarts the gateway to pick up the new config
3. Updates any agent workspace `.md` files that reference changed values (heartbeat frequency, model names) so agent self-documentation stays in sync

All config changes go through the OpenClaw CLI. OptimoClaw never modifies config files directly.

## Development

```bash
npx next dev -p 3070
```

## Project structure

```
src/
  app/
    agents/          # Agent roster and per-agent detail view
    optimizer/       # Token Optimizer (levers, routing, insights)
    graph/           # Performance Graph (coming soon)
    connect/         # Gateway connection form
    api/             # Server routes for CLI and proxy calls
  components/
    optimizer/       # Lever cards, insight charts, apply bar
    Sidebar.tsx      # Navigation and gateway switcher
  lib/
    gateway-client.ts  # WebSocket client for OpenClaw gateway
    optimizer.ts       # Lever definitions, tune modes, presets
    rate-card.ts       # Model pricing ($/MTok from provider pages)
  contexts/
    GatewayContext.tsx  # Gateway connection state provider
```

## Requirements

OptimoClaw must run on the same machine as your OpenClaw instance. It shells out to the `openclaw` CLI for config reads and writes, which requires the CLI to be installed and accessible in the shell path.

## License

[MIT](LICENSE)
