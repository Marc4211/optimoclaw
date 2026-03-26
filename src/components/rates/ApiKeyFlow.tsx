"use client";

import { useState } from "react";
import { ArrowLeft, Shield, ExternalLink, AlertTriangle } from "lucide-react";
import { Provider } from "@/types/rates";
import { providers, validateApiKey } from "@/lib/rates";

interface ApiKeyFlowProps {
  onBack: () => void;
  onFallbackToManual: () => void;
}

export default function ApiKeyFlow({
  onBack,
  onFallbackToManual,
}: ApiKeyFlowProps) {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null
  );
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = providers.find((p) => p.id === selectedProvider);

  async function handleValidate() {
    if (!selectedProvider || !apiKey.trim()) return;
    setValidating(true);
    setError(null);

    const result = await validateApiKey(selectedProvider, apiKey);

    if (result.success) {
      // TODO: pull rates from billing API and save via RatesContext
      // For now this path always fails gracefully
    } else {
      setError(result.error ?? "Validation failed");
    }
    setValidating(false);
  }

  // Step 1: Provider selection
  if (!selectedProvider) {
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

          <h2 className="text-lg font-semibold">Choose Your Provider</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the AI provider you use for your OpenClaw deployment.
          </p>

          <div className="mt-6 grid gap-3">
            {providers.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-hover"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.dashboardUrl}
                  </p>
                </div>
                <ArrowLeft size={14} className="rotate-180 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Key entry with instructions
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <button
          onClick={() => {
            setSelectedProvider(null);
            setApiKey("");
            setError(null);
          }}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <h2 className="text-lg font-semibold">
          Connect {provider!.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Follow these steps to get your API key:
        </p>

        {/* Instructions */}
        <ol className="mt-4 space-y-2">
          {provider!.instructions.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <a
          href={provider!.keyPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
        >
          Open {provider!.name} API Keys page
          <ExternalLink size={12} />
        </a>

        {/* Scope guidance */}
        <div className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {provider!.scopeGuidance}
        </div>

        {/* Key input */}
        <div className="mt-4">
          <input
            type="password"
            placeholder={`Paste your ${provider!.name} API key`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Security callout */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
          <Shield size={12} />
          Stored in localStorage on your machine. Never sent to any server.
        </div>

        {/* Error + fallback */}
        {error && (
          <div className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-warning"
              />
              <div>
                <p className="text-sm text-warning">{error}</p>
                <button
                  onClick={onFallbackToManual}
                  className="mt-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Use manual rate entry instead →
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleValidate}
          disabled={!apiKey.trim() || validating}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {validating ? "Validating..." : "Connect"}
        </button>
      </div>
    </div>
  );
}
