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
import { GatewayState, Agent, SavedGateway } from "@/types";
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
  const [gateways, setGateways] = useState<SavedGateway[]>([]);
  const [activeGateway, setActiveGateway] = useState<SavedGateway | null>(null);
  const [gatewayUsage, setGatewayUsage] = useState<GatewayUsageData>({
    raw: null, costRaw: null, perModel: [], loaded: false,
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

  // Fetch usage.status and usage.cost from the gateway (best-effort)
  const fetchGatewayUsage = useCallback(async (client: GatewayClient) => {
    try {
      const [usageRaw, costRaw] = await Promise.all([
        client.getUsageStatus(),
        client.getUsageCost(),
      ]);

      console.log("[GatewayContext] usage.status response:", JSON.stringify(usageRaw).slice(0, 1000));
      console.log("[GatewayContext] usage.cost response:", JSON.stringify(costRaw).slice(0, 1000));

      // Try to extract per-model token data from the usage response.
      // The exact shape isn't documented yet, so we try common patterns.
      const perModel: GatewayUsageData["perModel"] = [];

      if (usageRaw) {
        // Pattern 1: { models: { "claude-haiku": { input: N, output: N } } }
        const models = usageRaw.models as Record<string, Record<string, number>> | undefined;
        if (models && typeof models === "object") {
          for (const [model, data] of Object.entries(models)) {
            if (data && typeof data === "object") {
              perModel.push({
                model,
                inputTokens: data.input ?? data.inputTokens ?? 0,
                outputTokens: data.output ?? data.outputTokens ?? 0,
                totalTokens: (data.input ?? data.inputTokens ?? 0) + (data.output ?? data.outputTokens ?? 0),
              });
            }
          }
        }

        // Pattern 2: { byModel: [{ model: "...", input: N, output: N }] }
        const byModel = usageRaw.byModel as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(byModel) && perModel.length === 0) {
          for (const entry of byModel) {
            perModel.push({
              model: String(entry.model ?? "unknown"),
              inputTokens: Number(entry.input ?? entry.inputTokens ?? 0),
              outputTokens: Number(entry.output ?? entry.outputTokens ?? 0),
              totalTokens: Number(entry.total ?? entry.totalTokens ?? 0),
            });
          }
        }

        // Pattern 3: flat { inputTokens: N, outputTokens: N } (no per-model breakdown)
        if (perModel.length === 0 && typeof usageRaw.inputTokens === "number") {
          perModel.push({
            model: "all",
            inputTokens: Number(usageRaw.inputTokens),
            outputTokens: Number(usageRaw.outputTokens ?? 0),
            totalTokens: Number(usageRaw.inputTokens) + Number(usageRaw.outputTokens ?? 0),
          });
        }
      }

      setGatewayUsage({
        raw: usageRaw,
        costRaw,
        perModel,
        loaded: true,
      });
    } catch {
      setGatewayUsage((prev) => ({ ...prev, loaded: true }));
    }
  }, []);

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

        // Fetch usage data in the background (best-effort)
        fetchGatewayUsage(client);
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
