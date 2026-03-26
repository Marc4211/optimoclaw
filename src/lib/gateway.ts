import { GatewayConfig } from "@/types";

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

export async function testConnection(config: GatewayConfig): Promise<boolean> {
  // TODO: Replace with real gateway health check
  // For now, simulate a connection attempt
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Simulate: any non-empty URL and token "succeeds"
  if (!config.url || !config.token) {
    throw new Error("Gateway URL and token are required");
  }

  return true;
}
