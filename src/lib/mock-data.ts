import { Agent } from "@/types";

export const mockAgents: Agent[] = [
  {
    id: "agent-1",
    name: "code-reviewer",
    model: "claude-sonnet-4-6",
    status: "online",
    sessionCount: 3,
    tokenUsage: 245_800,
  },
  {
    id: "agent-2",
    name: "inbox-monitor",
    model: "claude-haiku-4-5",
    status: "online",
    sessionCount: 1,
    tokenUsage: 18_420,
  },
  {
    id: "agent-3",
    name: "deploy-watcher",
    model: "claude-haiku-4-5",
    status: "idle",
    sessionCount: 0,
    tokenUsage: 4_200,
  },
  {
    id: "agent-4",
    name: "docs-writer",
    model: "claude-sonnet-4-6",
    status: "offline",
    sessionCount: 0,
    tokenUsage: 0,
  },
  {
    id: "agent-5",
    name: "pr-summarizer",
    model: "claude-haiku-4-5",
    status: "online",
    sessionCount: 2,
    tokenUsage: 67_300,
  },
];
