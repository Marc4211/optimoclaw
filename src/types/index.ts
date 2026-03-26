export interface Agent {
  id: string;
  name: string;
  model: string;
  status: "online" | "offline" | "idle";
  sessionCount: number;
  tokenUsage: number;
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
