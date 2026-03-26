"use client";

import { useState } from "react";
import { DollarSign, Key, Gauge } from "lucide-react";
import ManualRateForm from "./ManualRateForm";
import ApiKeyFlow from "./ApiKeyFlow";

type SetupPath = "choose" | "manual" | "api-key";

export default function RateSetupCard() {
  const [path, setPath] = useState<SetupPath>("choose");

  if (path === "manual") {
    return <ManualRateForm onBack={() => setPath("choose")} />;
  }

  if (path === "api-key") {
    return (
      <ApiKeyFlow
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
          <h1 className="text-lg font-semibold">Set Up Token Rates</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The Token Optimizer estimates your monthly cost based on model
            pricing. To get started, we need to know your rates.
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Most users can just confirm the defaults — they match Anthropic's
            published pricing.
          </p>
        </div>

        <div className="grid gap-3">
          <button
            onClick={() => setPath("manual")}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">I know my rates</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Pre-filled with current Anthropic and OpenAI published pricing.
                Just confirm or adjust.
              </p>
            </div>
          </button>

          <button
            onClick={() => setPath("api-key")}
            className="flex items-start gap-4 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Key size={20} className="text-accent" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect my account</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Enter a read-only API key to pull your actual billing rates.
                Stored locally — never sent anywhere.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
