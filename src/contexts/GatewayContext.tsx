"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { GatewayConfig, GatewayState } from "@/types";
import {
  saveGatewayConfig,
  loadGatewayConfig,
  clearGatewayConfig,
  testConnection,
} from "@/lib/gateway";

interface GatewayContextValue extends GatewayState {
  connect: (config: GatewayConfig) => Promise<void>;
  disconnect: () => void;
}

const GatewayContext = createContext<GatewayContextValue | null>(null);

export function GatewayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GatewayState>({
    config: null,
    connected: false,
    connecting: false,
    error: null,
  });

  // Load saved config on mount
  useEffect(() => {
    const saved = loadGatewayConfig();
    if (saved) {
      setState((prev) => ({ ...prev, config: saved }));
    }
  }, []);

  const connect = useCallback(async (config: GatewayConfig) => {
    setState((prev) => ({ ...prev, connecting: true, error: null }));
    try {
      await testConnection(config);
      saveGatewayConfig(config);
      setState({
        config,
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
  }, []);

  const disconnect = useCallback(() => {
    clearGatewayConfig();
    setState({
      config: null,
      connected: false,
      connecting: false,
      error: null,
    });
  }, []);

  return (
    <GatewayContext.Provider value={{ ...state, connect, disconnect }}>
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
