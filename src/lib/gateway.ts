import { GatewayConfig } from "@/types";
import { GatewayClient } from "./gateway-client";

const STORAGE_KEY = "broadclaw-gateway";

export function saveGatewayConfig(config: GatewayConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadGatewayConfig(): GatewayConfig | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as GatewayConfig;
  } catch {
    return null;
  }
}

export function clearGatewayConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export async function testConnection(config: GatewayConfig): Promise<GatewayClient> {
  if (!config.url || !config.token) {
    throw new Error("Gateway URL and token are required");
  }

  const client = new GatewayClient(config.url, config.token);
  await client.connect();
  return client;
}
