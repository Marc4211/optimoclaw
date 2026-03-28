"use client";

import { useRates } from "@/contexts/RatesContext";
import { Settings, Trash2, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { useState } from "react";
import RateSetupCard from "@/components/rates/RateSetupCard";

export default function SettingsPage() {
  const { config, hasRates, clearRates, setRates } = useRates();
  const [showAddSource, setShowAddSource] = useState(false);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  if (showAddSource) {
    return <RateSetupCard onClose={() => setShowAddSource(false)} />;
  }

  const providerSpend = config?.providerSpend ?? [];

  // If no providerSpend but has legacy realSpend, show that
  const legacyAnthropicConnected =
    providerSpend.length === 0 &&
    config?.source === "api-key" &&
    config?.provider === "anthropic";

  function handleRemoveProvider(provider: string) {
    if (!config) return;

    if (provider === "all") {
      clearRates();
      setConfirmClear(null);
      return;
    }

    const remaining = providerSpend.filter((s) => s.provider !== provider);
    if (remaining.length === 0) {
      clearRates();
    } else {
      const totalMonthly = remaining.reduce((sum, s) => sum + s.monthlyEstimate, 0);
      setRates({
        ...config,
        configuredAt: new Date().toISOString(),
        realSpend: {
          totalUsd: remaining.reduce((sum, s) => sum + s.totalUsd, 0),
          periodDays: remaining[0]?.periodDays ?? 30,
          monthlyEstimate: totalMonthly,
          perModel: remaining.flatMap((s) => s.perModel ?? []),
        },
        providerSpend: remaining,
      });
    }
    setConfirmClear(null);
  }

  return (
    <div className="p-8" data-page="settings">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage billing sources and app configuration
            </p>
          </div>
        </div>

        {/* Billing Sources */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Billing Sources</h2>
            <button
              onClick={() => setShowAddSource(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus size={14} />
              Add source
            </button>
          </div>

          {!hasRates && providerSpend.length === 0 && !legacyAnthropicConnected && (
            <div className="rounded-lg border border-border bg-surface p-6 text-center">
              <AlertCircle size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No billing sources connected. Add one to see actual spend in the
                Token Optimizer.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {/* Multi-provider entries */}
            {providerSpend.map((spend) => (
              <div
                key={spend.provider}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-success" />
                  <div>
                    <p className="text-sm font-medium">
                      {spend.provider === "anthropic"
                        ? "Anthropic"
                        : spend.provider === "openai"
                          ? "OpenAI"
                          : spend.provider}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {spend.source === "admin-api"
                        ? `$${spend.monthlyEstimate.toFixed(2)}/mo from Admin API`
                        : spend.source === "free"
                          ? "Free (local models)"
                          : `$${spend.monthlyEstimate.toFixed(2)}/mo (manual rates)`}
                    </p>
                  </div>
                </div>

                {confirmClear === spend.provider ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Remove?</span>
                    <button
                      onClick={() => handleRemoveProvider(spend.provider)}
                      className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClear(null)}
                      className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear(spend.provider)}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            {/* Legacy Anthropic entry (backwards compat) */}
            {legacyAnthropicConnected && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-success" />
                  <div>
                    <p className="text-sm font-medium">Anthropic</p>
                    <p className="text-xs text-muted-foreground">
                      ${config?.realSpend?.monthlyEstimate?.toFixed(2) ?? "0.00"}/mo
                      from Admin API
                    </p>
                  </div>
                </div>

                {confirmClear === "anthropic" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Remove?</span>
                    <button
                      onClick={() => handleRemoveProvider("all")}
                      className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmClear(null)}
                      className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClear("anthropic")}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}

            {/* Ollama — always free */}
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-surface/50 p-4">
              <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Ollama / Local models
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Always $0 — no billing setup needed
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
