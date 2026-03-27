"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { GatewayState, Agent, GatewayModel, SavedGateway } from "@/types";
import { GatewayClient } from "@/lib/gateway-client";
import {
  loadGateways,
  saveGateway,
  removeGateway as removeGatewayStorage,
  loadActiveGateway,
  setActiveGatewayId,
  clearActiveGatewayId,
  testConnection,
} from "@/lib/gateway";
import { mockAgents } from "@/lib/mock-data";

export interface GatewayUsageData {
  raw: Record<string, unknown> | null;
  costRaw: Record<string, unknown> | null;
  /** Per-model token usage extracted from usage.status, if available */
  perModel: Array<{ model: string; inputTokens: number; outputTokens: number; totalTokens: number }>;
  loaded: boolean;
}

interface GatewayContextValue extends GatewayState {
  client: GatewayClient | null;
  agents: Agent[];
  /** Available models from the gateway (populated via models.list on connect) */
  availableModels: GatewayModel[];
  gateways: SavedGateway[];
  activeGateway: SavedGateway | null;
  mounted: boolean;
  gatewayUsage: GatewayUsageData;
  connect: (gateway: SavedGateway) => Promise<void>;
  disconnect: () => void;
  switchGateway: (id: string) => Promise<void>;
  addGateway: (gw: SavedGateway) => void;
  deleteGateway: (id: string) => void;
  refreshAgents: () => Promise<void>;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<GatewayState>({
    config: null,
    connected: false,
    connecting: false,
    error: null,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableModels, setAvailableModels] = useState<GatewayModel[]>([]);
  const [gateways, setGateways] = useState<SavedGateway[]>([]);
  const [activeGateway, setActiveGateway] = useState<SavedGateway | null>(null);
  const [gatewayUsage] = useState<GatewayUsageData>({
    raw: null, costRaw: null, perModel: [], loaded: true,
  });
  const clientRef = useRef<GatewayClient | null>(null);
  // Track client instance in state so React re-renders when it changes
  const [clientInstance, setClientInstance] = useState<GatewayClient | null>(null);
  const [autoConnectDone, setAutoConnectDone] = useState(false);

  // Load saved gateways and active selection on mount (client-side only)
  useEffect(() => {
    const saved = loadGateways();
    setGateways(saved);
    const active = loadActiveGateway();
    if (active) {
      setActiveGateway(active);
      setState((prev) => ({
        ...prev,
        config: { url: active.url, token: active.token },
      }));
    }
    setMounted(true);
  }, []);

  // Gateway usage data comes from the Anthropic Admin API (via the rates
  // setup flow), not from gateway methods — the `cli` client ID doesn't
  // get operator.read scope, so usage.status and usage.cost are inaccessible.
  // Mark as loaded immediately; actual cost data lives in RatesContext.

  const refreshAgents = useCallback(async () => {
    // Agents come from the connect snapshot, not a separate API call.
    // If not connected, show mock data for demo/dev mode.
    if (!clientRef.current?.connected) {
      setAgents(mockAgents);
    }
  }, []);

  const connectToGateway = useCallback(
    async (gateway: SavedGateway) => {
      setState((prev) => ({ ...prev, connecting: true, error: null }));
      try {
        // Disconnect existing client
        if (clientRef.current) {
          clientRef.current.disconnect();
          clientRef.current = null;
        }

        const { client, agents: snapshotAgents } = await testConnection({
          url: gateway.url,
          token: gateway.token,
        });
        clientRef.current = client;
        setClientInstance(client);

        // Set agents from the connect snapshot
        if (snapshotAgents.length > 0) {
          setAgents(snapshotAgents);
        }

        // Listen for state changes
        client.onStateChange((newState) => {
          if (newState === "disconnected") {
            setState((prev) => ({ ...prev, connected: false }));
          } else if (newState === "connected") {
            setState((prev) => ({ ...prev, connected: true }));
          }
        });

        // Listen for agent state events
        client.onEvent((event) => {
          if (event.event === "agent.state") {
            // Future: update individual agent status from event payload
          }
        });

        // Listen for scope-driven reconnects — update agents from new snapshot
        client.onReconnect((newAgents) => {
          if (newAgents.length > 0) {
            setAgents(newAgents);
          }
          setState((prev) => ({ ...prev, connected: true }));
        });

        // Persist the gateway and mark it active
        saveGateway(gateway);
        setActiveGatewayId(gateway.id);
        setGateways(loadGateways());
        setActiveGateway(gateway);

        setState({
          config: { url: gateway.url, token: gateway.token },
          connected: true,
          connecting: false,
          error: null,
        });

        // Cost data comes from Anthropic Admin API (RatesContext), not gateway

        // Fetch available models via CLI route (WebSocket models.list needs operator.read)
        const configPath = (client.snapshot?.configPath as string) ?? "";
        const profileMatch = configPath.match(/\.openclaw-([^/]+)\//);
        const profile = profileMatch ? profileMatch[1] : "";
        fetch(`/api/models-list?profile=${encodeURIComponent(profile)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.models && data.models.length > 0) {
              const mapped: GatewayModel[] = data.models.map((m: Record<string, unknown>) => ({
                id: String(m.id ?? m.fullId ?? ""),
                name: String(m.name ?? m.id ?? ""),
                provider: String(m.provider ?? "unknown"),
                contextWindow: Number(m.contextWindow ?? 0),
              }));
              setAvailableModels(mapped);
            }
          })
          .catch(() => {
            // Silently fall back — models will come from snapshot agent data
          });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          connecting: false,
          error: err instanceof Error ? err.message : "Connection failed",
        }));
      }
    },
    [refreshAgents]
  );

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setClientInstance(null);
    }
    // Don't remove the gateway from the list or clear active — just disconnect
    setAgents([]);
    setState({
      config: null,
      connected: false,
      connecting: false,
      error: null,
    });
  }, []);

  const switchGateway = useCallback(
    async (id: string) => {
      const gw = gateways.find((g) => g.id === id);
      if (!gw) return;
      await connectToGateway(gw);
    },
    [gateways, connectToGateway]
  );

  const addGateway = useCallback((gw: SavedGateway) => {
    saveGateway(gw);
    setGateways(loadGateways());
  }, []);

  // Auto-reconnect to the active gateway on page load
  useEffect(() => {
    if (!mounted || autoConnectDone) return;
    setAutoConnectDone(true);

    const active = loadActiveGateway();
    if (active) {
      connectToGateway(active).catch(() => {
        // Auto-reconnect failed — user can manually reconnect
      });
    }
  }, [mounted, autoConnectDone, connectToGateway]);

  const deleteGateway = useCallback(
    (id: string) => {
      // If deleting the active gateway, disconnect first
      if (activeGateway?.id === id) {
        disconnect();
        clearActiveGatewayId();
        setActiveGateway(null);
      }
      removeGatewayStorage(id);
      setGateways(loadGateways());
    },
    [activeGateway, disconnect]
  );

  return (
    <GatewayContext.Provider
      value={{
        ...state,
        client: clientInstance,
        agents,
        availableModels,
        gateways,
        activeGateway,
        gatewayUsage,
        mounted,
        connect: connectToGateway,
        disconnect,
        switchGateway,
        addGateway,
        deleteGateway,
        refreshAgents,
      }}
    >
      {children}
    </GatewayContext.Provider>
  );
}

export function useGateway(): GatewayContextValue {
  const context = useContext(GatewayContext);
  if (!context) {
    throw new Error("useGateway must be used within a GatewayProvider");
  }
  return context;
}
