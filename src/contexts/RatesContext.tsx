"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { RatesConfig, ModelRate } from "@/types/rates";
import {
  saveRatesConfig,
  loadRatesConfig,
  clearRatesConfig,
} from "@/lib/rates";

interface RatesContextValue {
  config: RatesConfig | null;
  hasRates: boolean;
  loaded: boolean;
  models: ModelRate[];
  setRates: (config: RatesConfig) => void;
  clearRates: () => void;
}

const RatesContext = createContext<RatesContextValue | null>(null);

export function RatesProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RatesConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = loadRatesConfig();
    if (saved) {
      setConfig(saved);
    }
    setLoaded(true);
  }, []);

  const setRates = useCallback((newConfig: RatesConfig) => {
    saveRatesConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const clearRates = useCallback(() => {
    clearRatesConfig();
    setConfig(null);
  }, []);

  return (
    <RatesContext.Provider
      value={{
        config,
        hasRates: config !== null,
        loaded,
        models: config?.models ?? [],
        setRates,
        clearRates,
      }}
    >
      {children}
    </RatesContext.Provider>
  );
}

export function useRates(): RatesContextValue {
  const context = useContext(RatesContext);
  if (!context) {
    throw new Error("useRates must be used within a RatesProvider");
  }
  return context;
}
