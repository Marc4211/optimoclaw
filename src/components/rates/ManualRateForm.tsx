"use client";

import { useState } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import { ModelRate, RatesConfig } from "@/types/rates";
import { allDefaultRates } from "@/lib/rates";
import { useRates } from "@/contexts/RatesContext";

interface ManualRateFormProps {
  onBack: () => void;
  prefillNote?: string;
}

export default function ManualRateForm({
  onBack,
  prefillNote,
}: ManualRateFormProps) {
  const { setRates } = useRates();
  const [models, setModels] = useState<ModelRate[]>(
    allDefaultRates.map((r) => ({ ...r }))
  );

  function handleRateChange(
    index: number,
    field: "inputPerMillion" | "outputPerMillion",
    value: string
  ) {
    setModels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: parseFloat(value) || 0 };
      return next;
    });
  }

  function handleConfirm() {
    const config: RatesConfig = {
      source: "manual",
      models,
      configuredAt: new Date().toISOString(),
    };
    setRates(config);
  }

  // Group by provider
  const anthropicModels = models
    .map((m, i) => ({ ...m, _index: i }))
    .filter((m) => m.provider === "anthropic");
  const openaiModels = models
    .map((m, i) => ({ ...m, _index: i }))
    .filter((m) => m.provider === "openai");

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <h2 className="text-lg font-semibold">Confirm Your Rates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-filled with published pricing. Adjust if you have custom or
          negotiated rates.
        </p>

        {prefillNote && (
          <div className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
            {prefillNote}
          </div>
        )}

        <div className="mt-6 space-y-6">
          {[
            { label: "Anthropic", models: anthropicModels },
            { label: "OpenAI", models: openaiModels },
          ].map(({ label, models: group }) => (
            <div key={label}>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </h3>
              <div className="space-y-2">
                {group.map((model) => (
                  <div
                    key={model.model}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                  >
                    <span className="w-28 text-sm font-medium">
                      {model.displayName}
                    </span>
                    <div className="flex flex-1 items-center gap-2">
                      <label className="text-xs text-muted-foreground">
                        Input
                      </label>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={model.inputPerMillion}
                          onChange={(e) =>
                            handleRateChange(
                              model._index,
                              "inputPerMillion",
                              e.target.value
                            )
                          }
                          className="w-full rounded-md border border-border bg-background py-1.5 pl-5 pr-2 text-right font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <label className="text-xs text-muted-foreground">
                        Output
                      </label>
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={model.outputPerMillion}
                          onChange={(e) =>
                            handleRateChange(
                              model._index,
                              "outputPerMillion",
                              e.target.value
                            )
                          }
                          className="w-full rounded-md border border-border bg-background py-1.5 pl-5 pr-2 text-right font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        /1M
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
          <Shield size={12} />
          Stored in localStorage on your machine. Never sent to any server.
        </div>

        <button
          onClick={handleConfirm}
          className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Confirm Rates
        </button>
      </div>
    </div>
  );
}
