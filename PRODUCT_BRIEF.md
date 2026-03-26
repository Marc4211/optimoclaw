# BroadClaw — Product Brief
*Version 1.0 — March 2026*

---

## What This Is

BroadClaw is a web-based performance and optimization tool for OpenClaw deployments. It is not a chat interface. It is not a control panel. It is the tool you open when you want to understand what your agents are doing, why they cost what they cost, and how to make them better.

**Target user:** OpenClaw power users running multi-agent setups who care about quality and cost — not just whether things are running.

**Positioning:** Claw.so owns operational control (approvals, artifacts, session management). OpenClaw Studio owns basic dashboarding. BroadClaw owns the performance loop: build better skills, configure smarter token usage, observe the results.

**Design standard:** Best UX in the OpenClaw ecosystem. Not functional — beautiful. This is the explicit moat.

---

## The Three Panels

### 1. Skill Studio
*Build skills that actually perform.*

A purpose-built authoring environment for OpenClaw skills. Replaces the current workflow of writing SKILL.md in a text editor with no feedback.

**Core capabilities:**
- SKILL.md editor with syntax highlighting and structure validation
- Live test runner — connect to a gateway, invoke the skill, see real output
- Input/output sandbox — define test cases, run them, compare results
- Skill metadata editor (name, description, trigger patterns, tool requirements)
- One-click publish to ClaWHub (via ClaWHub API when available)
- Local skill library — manage skills across projects

**Key UX principle:** The editor and the test runner are always visible at the same time. You write, you test, you see. No switching context.

---

### 2. Token Optimizer
*Configure how efficiently your deployment runs.*

An interactive panel that translates OpenClaw's token optimization settings into human-readable controls with projected cost impact. Eliminates the need to hand-edit openclaw.json for optimization changes.

**Core capabilities:**
- Connect to gateway, read current config
- Levers mapped to real openclaw.json fields (sourced from @mattganzak optimization guide + validated against current docs):
  - **Heartbeat model** — route heartbeats to local Ollama vs paid API (biggest single win)
  - **Heartbeat frequency** — how often the agent polls (every 30m vs 1h vs off)
  - **Default model** — Haiku vs Sonnet as the session default
  - **Compaction model** — which model LCM uses to summarize (haiku vs local)
  - **Compaction threshold** — when lossless-claw kicks in
  - **Subagent concurrency** — max concurrent spawns
  - **Streaming** — on/off per channel
  - **Context window** — per-agent limits
- Cost impact estimate shown per lever change (based on static token math)
- Write-back to config with single click (diff preview before applying, restart prompt if needed)
- Preset profiles: *Lean* (minimize cost), *Balanced*, *Quality* (maximize capability)

**Note for implementation:** The @mattganzak guide is the source of the lever concepts but some config field names are outdated (e.g. the `cache` block doesn't exist in current OpenClaw). All field paths must be validated against current openclaw.json schema before write-back is wired. Prompt caching is automatic for Anthropic models — no config lever needed.

**Key UX principle:** Every lever shows its current value, its effect in plain English, and a projected monthly cost delta. No guessing what a setting does.

---

### 3. Performance Graph
*See where quality and cost are coming from.*

A live agent graph with performance overlay. Not a topology diagram — a performance observation surface. The question it answers: which agents are expensive, which skills are doing the work, where is quality degrading, where are tokens being wasted.

**Core capabilities:**
- Live node graph of agents and active sessions (via gateway WebSocket)
- Per-agent overlays:
  - Token spend (session, daily, rolling 7-day)
  - Active skills (which skills are firing, how often)
  - Session cost breakdown
  - Error/failure rate
- Click any agent node → drill into session history, skill invocations, token log
- Click any skill → see invocation count, average token cost, quality signals
- Timeline scrubbing — replay a time window
- Cost hotspot highlighting — visually surface the most expensive nodes

**Key UX principle:** The graph is the entry point, not a bonus feature. It loads first. Everything else is a drill-down from it.

---

## Tech Stack

**Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
**Graph:** React Flow (agent graph panel)
**Deployment:** Vercel
**Gateway connection:** WebSocket to OpenClaw gateway (same protocol as OpenClaw Studio / Claw.so)
**Config read/write:** OpenClaw REST API + direct openclaw.json manipulation (with gateway restart trigger)
**Auth:** Gateway token (same model as existing tools — user provides token, stored in localStorage or env)

**No backend required for MVP.** All data comes from the connected gateway. Vercel handles static hosting. Config write-back goes direct to gateway API.

---

## MVP Scope

Ship in this order:

**Phase 1 — Foundation**
- Gateway connection screen (URL + token, test connection, persist)
- Navigation shell with three panel tabs
- Basic agent list (read from gateway, show name/model/status)

**Phase 2 — Token Optimizer**
- Read current openclaw.json via gateway API
- Render lever UI for the 6 highest-impact settings
- Show cost estimates (static math, no ML)
- Write-back with diff preview
- Preset profiles (Lean / Balanced / Quality)

**Phase 3 — Performance Graph**
- Live agent nodes from gateway WebSocket
- Per-node token spend overlay
- Click-through to session detail

**Phase 4 — Skill Studio**
- SKILL.md editor
- Live test runner against connected gateway
- Local skill library

*Rationale: Token Optimizer ships first because it has the clearest value and the lowest implementation complexity. Performance Graph ships second because it's the most visually distinctive. Skill Studio ships last because it requires the most design work to do well.*

---

## What Makes This Different

| Feature | BroadClaw | Claw.so | OC Studio |
|---|---|---|---|
| Focus | Performance & quality | Ops & control | Basic dashboard |
| Token Optimizer | ✅ | ❌ | ❌ |
| Skill authoring | ✅ | ❌ | ❌ |
| Design quality | High (explicit priority) | Medium | Low |
| Web-based | ✅ | ❌ (native app) | ✅ |
| Cost | Free / open source | $0–$49/mo | Free |

---

## Design Principles

1. **Performance is the frame.** Every panel connects back to the question: is my deployment performing well? Not just running — performing.

2. **Numbers with context.** Token counts without cost estimates are useless. Every metric has a "so what."

3. **One action per screen.** Each panel has a clear primary action. Skill Studio: test your skill. Token Optimizer: apply a change. Performance Graph: identify a hotspot.

4. **Dark mode first.** The OpenClaw community runs terminals and code editors. Light mode is an afterthought.

5. **Motion with purpose.** The agent graph should feel alive. Transitions should be smooth. But never decorative — every animation communicates state.

---

## Open Questions (decide before building)

1. **Config write-back mechanism** — Does the OpenClaw gateway API support writing config, or do we need to SSH/exec to write openclaw.json directly? Needs validation before Phase 2.

2. **Token cost estimates** — Static math (tokens × model price) or pull from actual usage logs? Static is simpler for MVP, actual logs are more accurate.

3. **ClaWHub publish API** — Does a public API exist? If not, Skill Studio exports a zip for manual upload in MVP.

4. **Gateway WebSocket protocol** — Need to confirm the exact WS message format OpenClaw uses for session/agent state. Can reference OpenClaw Studio source for this.

---

## First Prompt for Claude Code

Use this to kick off the project:

```
Build a Next.js 14 web application called BroadClaw — a performance and optimization tool for OpenClaw deployments.

Project structure:
- App Router, TypeScript, Tailwind CSS
- Three main panels: Token Optimizer, Performance Graph, Skill Studio
- Connects to an OpenClaw gateway via WebSocket (URL + token auth)

Start with:
1. Project scaffold with navigation shell (sidebar with three panel links)
2. Gateway connection screen — URL input, token input, "Connect" button, connection status indicator
3. Persist gateway URL and token to localStorage
4. Basic agent list page that reads from the connected gateway and displays agent name, model, and status

Design direction:
- Dark mode only
- Clean, minimal, high craft — think Linear or Vercel dashboard, not a dev tool
- Primary color: indigo/violet
- Monospace for token counts and technical values, sans-serif for everything else

Do not build any panel content yet — just the shell, connection flow, and agent list.
```
