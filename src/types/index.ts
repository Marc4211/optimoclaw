export interface Agent {
  id: string;
  name: string;
  model: string;
  status: "online" | "offline" | "idle";
  sessionCount: number;
  tokenUsage: number;
  description?: string;
  lastActive?: string;
}

export interface GatewayConfig {
  url: string;
  token: string;
}

export interface GatewayState {
  config: GatewayConfig | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
}

// --- Gateway WebSocket Protocol Types ---

export interface ReqFrame {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface ResFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retry?: {
      strategy: "backoff" | "immediate" | "never";
      delayMs?: number;
    };
  };
}

export interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: number;
}

export type GatewayFrame = ReqFrame | ResFrame | EventFrame;

export interface ConnectParams {
  token: string;
  version: string;
  platform: string;
  role: string;
  scopes: string[];
}

export interface ConnectResponse {
  protocolVersion: number;
  server: { version: string; name: string };
  supportedMethods: string[];
  supportedEvents: string[];
  snapshot?: {
    agents?: Agent[];
    sessions?: unknown[];
    devices?: unknown[];
  };
}

export interface OpenClawConfig {
  agents?: {
    defaults?: {
      model?: { primary?: string; fallbacks?: string[] };
      heartbeat?: { every?: string; model?: string; target?: string };
      compaction?: { model?: string; mode?: string };
      contextPruning?: { mode?: string; ttl?: string };
      maxConcurrentSubagents?: number;
      maxConcurrent?: number;
      blockStreamingDefault?: string;
    };
    list?: Array<{
      name: string;
      model?: string;
      heartbeat?: { every?: string; model?: string };
      [key: string]: unknown;
    }>;
  };
  [key: string]: unknown;
}
