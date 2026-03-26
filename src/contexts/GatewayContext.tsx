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
import { GatewayConfig, GatewayState, Agent } from "@/types";
import { GatewayClient } from "@/lib/gateway-client";
import {
  saveGatewayConfig,
  loadGatewayConfig,
  clearGatewayConfig,
  testConnection,
} from "@/lib/gateway";
import { mockAgents } from "@/lib/mock-data";

interface GatewayContextValue extends GatewayState {
  client: GatewayClient | null;
  agents: Agent[];
  connect: (config: GatewayConfig) => Promise<void>;
  disconnect: () => void;
  refreshAgents: () => Promise<void>;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GatewayState>({
    config: null,
    connected: false,
    connecting: false,
    error: null,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const clientRef = useRef<GatewayClient | null>(null);

  // Load saved config on mount
  useEffect(() => {
    const saved = loadGatewayConfig();
    if (saved) {
      setState((prev) => ({ ...prev, config: saved }));
    }
  }, []);

  const refreshAgents = useCallback(async () => {
    if (!clientRef.current?.connected) {
      setAgents(mockAgents);
      return;
    }
    try {
      const list = await clientRef.current.listAgents();
      setAgents(
        list.map((a) => ({
          id: a.id ?? a.name,
          name: a.name,
          model: a.model ?? "unknown",
          status: a.status ?? "offline",
          sessionCount: a.sessionCount ?? 0,
          tokenUsage: a.tokenUsage ?? 0,
        }))
      );
    } catch {
      // If agent list fails, keep current data
    }
  }, []);

  const connect = useCallback(
    async (config: GatewayConfig) => {
      setState((prev) => ({ ...prev, connecting: true, error: null }));
      try {
        // Disconnect existing client
        if (clientRef.current) {
          clientRef.current.disconnect();
          clientRef.current = null;
        }

        const client = await testConnection(config);
        clientRef.current = client;

        // Listen for state changes
        client.onStateChange((newState) => {
          if (newState === "disconnected") {
            setState((prev) => ({ ...prev, connected: false }));
          } else if (newState === "connected") {
            setState((prev) => ({ ...prev, connected: true }));
            refreshAgents();
          }
        });

        // Listen for agent state events
        client.onEvent((event) => {
          if (event.event === "agent.state") {
            refreshAgents();
          }
        });

        // Subscribe to session events for live updates
        try {
          await client.subscribeSessions();
        } catch {
          // Not critical if subscription fails
        }

        saveGatewayConfig(config);
        setState({
          config,
          connected: true,
          connecting: false,
          error: null,
        });

        // Load agents
        await refreshAgents();
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
    clearGatewayConfig();
    setAgents([]);
    setState({
      config: null,
      connected: false,
      connecting: false,
      error: null,
    });
  }, []);

  return (
    <GatewayContext.Provider
      value={{
        ...state,
        client: clientRef.current,
        agents,
        connect,
        disconnect,
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
