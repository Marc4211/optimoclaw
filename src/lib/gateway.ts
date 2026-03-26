import { GatewayConfig, SavedGateway } from "@/types";
import { GatewayClient } from "./gateway-client";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEY_GATEWAYS = "broadclaw-gateways";
const KEY_ACTIVE = "broadclaw-active-gateway";
const KEY_LEGACY = "broadclaw-gateway"; // old single-config key — migrate on first load

// ---------------------------------------------------------------------------
// Migration — old single-config → new multi-gateway format
// ---------------------------------------------------------------------------

function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  const legacy = localStorage.getItem(KEY_LEGACY);
  if (!legacy) return;

  try {
    const old = JSON.parse(legacy) as GatewayConfig;
    const migrated: SavedGateway = {
      id: crypto.randomUUID(),
      name: "Gateway 1",
      url: old.url,
      token: old.token,
    };
    localStorage.setItem(KEY_GATEWAYS, JSON.stringify([migrated]));
    localStorage.setItem(KEY_ACTIVE, migrated.id);
    localStorage.removeItem(KEY_LEGACY);
  } catch {
    localStorage.removeItem(KEY_LEGACY);
  }
}

// ---------------------------------------------------------------------------
// Multi-gateway CRUD
// ---------------------------------------------------------------------------

export function loadGateways(): SavedGateway[] {
  if (typeof window === "undefined") return [];
  migrateLegacy();
  const stored = localStorage.getItem(KEY_GATEWAYS);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as SavedGateway[];
  } catch {
    return [];
  }
}

export function saveGateway(gw: SavedGateway): void {
  if (typeof window === "undefined") return;
  const all = loadGateways();
  const idx = all.findIndex((g) => g.id === gw.id);
  if (idx >= 0) {
    all[idx] = gw;
  } else {
    all.push(gw);
  }
  localStorage.setItem(KEY_GATEWAYS, JSON.stringify(all));
}

export function removeGateway(id: string): void {
  if (typeof window === "undefined") return;
  const all = loadGateways().filter((g) => g.id !== id);
  localStorage.setItem(KEY_GATEWAYS, JSON.stringify(all));
  // If the removed gateway was active, clear active
  if (getActiveGatewayId() === id) {
    localStorage.removeItem(KEY_ACTIVE);
  }
}

// ---------------------------------------------------------------------------
// Active gateway persistence
// ---------------------------------------------------------------------------

export function getActiveGatewayId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_ACTIVE);
}

export function setActiveGatewayId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_ACTIVE, id);
}

export function clearActiveGatewayId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_ACTIVE);
}

/**
 * Load the currently active gateway config, or null if none.
 */
export function loadActiveGateway(): SavedGateway | null {
  const activeId = getActiveGatewayId();
  if (!activeId) return null;
  const all = loadGateways();
  return all.find((g) => g.id === activeId) ?? null;
}

// ---------------------------------------------------------------------------
// Connection test (unchanged)
// ---------------------------------------------------------------------------

export async function testConnection(config: GatewayConfig): Promise<GatewayClient> {
  if (!config.url || !config.token) {
    throw new Error("Gateway URL and token are required");
  }
  const client = new GatewayClient(config.url, config.token);
  await client.connect();
  return client;
}
