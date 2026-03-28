"use client";

import { useState } from "react";
import { DollarSign, BarChart3, Gauge, CheckCircle2 } from "lucide-react";
import ManualRateForm from "./ManualRateForm";
import AdminKeyFlow from "./AdminKeyFlow";
import OpenAIAdminKeyFlow from "./OpenAIAdminKeyFlow";
import { useRates } from "@/contexts/RatesContext";

type SetupPath = "choose" | "manual" | "anthropic-key" | "openai-key";

export default function RateSetupCard() {
  const { config } = useRates();
  const [path, setPath] = useState<SetupPath>("choose");

  // Check which providers are already connected
  const anthropicConnected = config?.providerSpend?.some(
    (s) => s.provider === "anthropic" && s.source === "admin-api"
  ) ?? (config?.source === "api-key" && config?.provider === "anthropic");

  const openaiConnected = config?.providerSpend?.some(
    (s) => s.provider === "openai" && s.source === "admin-api"
  );

  if (path === "manual") {
    return <ManualRateForm onBack={() => setPath("choose")} />;
  }

  if (path === "anthropic-key") {
    return (
      <AdminKeyFlow
        onBack={() => setPath("choose")}
        onFallbackToManual={() => setPath("manual")}
      />
    );
  }

  if (path === "openai-key") {
    return (
      <OpenAIAdminKeyFlow
        onBack={() => setPath("choose")}
        onFallbackToManual={() => setPath("manual")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Gauge size={28} className="text-primary" />
          </div>
          <h1 className="text-lg font-semibold">Set Up Billing Sources</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Connect your provider billing APIs to see actual spend, or enter
            rates manually. Connect as many providers as you use.
          </p>
        </div>

        <div className="grid gap-3">
          {/* Anthropic */}
          <button
            onClick={() => setPath("anthropic-key")}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <BarChart3 size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Anthropic</p>
                {anthropicConnected && (
                  <CheckCircle2 size={14} className="text-success" />
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {anthropicConnected
                  ? "Connected — pulling actual spend from Anthropic Admin API"
                  : "Pull actual spend via Admin API key (sk-ant-admin...)"}
              </p>
            </div>
          </button>

          {/* OpenAI */}
          <button
            onClick={() => setPath("openai-key")}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <BarChart3 size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">OpenAI</p>
                {openaiConnected && (
                  <CheckCircle2 size={14} className="text-success" />
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {openaiConnected
                  ? "Connected — pulling actual spend from OpenAI Usage API"
                  : "Pull actual spend via Admin API key (sk-...)"}
              </p>
            </div>
          </button>

          {/* Manual */}
          <button
            onClick={() => setPath("manual")}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Manual rate entry</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                For providers without billing APIs (Groq, Together, etc.) or if
                you prefer to enter rates yourself.
              </p>
            </div>
          </button>
        </div>

        {/* Ollama note */}
        <p className="mt-4 text-center text-xs text-muted-foreground/70">
          Ollama and local models are always $0 — no setup needed.
        </p>
      </div>
    </div>
  );
}
