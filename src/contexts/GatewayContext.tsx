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

interface GatewayContextValue extends GatewayState {
  client: GatewayClient | null;
  agents: Agent[];
  gateways: SavedGateway[];
  activeGateway: SavedGateway | null;
  mounted: boolean;
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
  const clientRef = useRef<GatewayClient | null>(null);

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
        client: clientRef.current,
        agents,
        gateways,
        activeGateway,
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
