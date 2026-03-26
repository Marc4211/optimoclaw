"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Shield,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  validateAdminKey,
  looksLikeAdminKey,
  formatTokens,
  ParsedUsage,
  ParsedCost,
} from "@/lib/anthropic-usage";
import { useRates } from "@/contexts/RatesContext";
import { allDefaultRates } from "@/lib/rates";
import { RatesConfig } from "@/types/rates";

interface AdminKeyFlowProps {
  onBack: () => void;
  onFallbackToManual: () => void;
}

export default function AdminKeyFlow({
  onBack,
  onFallbackToManual,
}: AdminKeyFlowProps) {
  const { setRates } = useRates();
  const [adminKey, setAdminKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formatWarning, setFormatWarning] = useState(false);

  // Show usage summary before confirming
  const [usageResult, setUsageResult] = useState<{
    usage: ParsedUsage;
    cost: ParsedCost;
    period: { start: string; end: string; days: number };
  } | null>(null);

  function handleKeyChange(value: string) {
    setAdminKey(value);
    setError(null);
    setUsageResult(null);
    setFormatWarning(value.length > 10 && !looksLikeAdminKey(value));
  }

  async function handleConnect() {
    if (!adminKey.trim()) return;
    setValidating(true);
    setError(null);

    const result = await validateAdminKey(adminKey.trim());

    if (result.valid) {
      setUsageResult({
        usage: result.usage,
        cost: result.cost,
        period: result.period,
      });
    } else {
      setError(result.error);
    }

    setValidating(false);
  }

  function handleConfirmRates() {
    if (!usageResult) return;

    // Calculate monthly estimate from real spend
    const periodDays = usageResult.period.days || 7;
    const monthlyEstimate =
      usageResult.cost.totalUsd > 0
        ? (usageResult.cost.totalUsd / periodDays) * 30
        : 0;

    const config: RatesConfig = {
      source: "api-key",
      provider: "anthropic",
      models: allDefaultRates.map((r) => ({ ...r })),
      configuredAt: new Date().toISOString(),
      realSpend: {
        totalUsd: usageResult.cost.totalUsd,
        periodDays,
        monthlyEstimate,
      },
    };
    setRates(config);
  }

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

        <h2 className="text-lg font-semibold">Connect Anthropic Admin Key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pull your actual token usage and spend from Anthropic&apos;s Usage &amp;
          Cost API.
        </p>

        {/* What this needs */}
        <div className="mt-4 rounded-lg bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            This requires an Admin API key
          </p>
          <p className="mt-1 text-xs">
            Admin keys start with{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
              sk-ant-admin
            </code>{" "}
            — they&apos;re different from standard API keys. Only organization
            admins can create them.
          </p>
        </div>

        {/* Steps */}
        <ol className="mt-5 space-y-2">
          <li className="flex gap-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              1
            </span>
            <span className="text-muted-foreground">
              Open the Anthropic Console and go to Admin Keys
            </span>
          </li>
          <li className="flex gap-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              2
            </span>
            <span className="text-muted-foreground">
              Create a new Admin key (or use an existing one)
            </span>
          </li>
          <li className="flex gap-3 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              3
            </span>
            <span className="text-muted-foreground">
              Paste it below — BroadClaw will pull your last 7 days of usage and
              cost
            </span>
          </li>
        </ol>

        <a
          href="https://console.anthropic.com/settings/admin-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary/80"
        >
          Open Anthropic Admin Keys page
          <ExternalLink size={12} />
        </a>

        {/* Key input */}
        <div className="mt-4">
          <input
            type="password"
            placeholder="sk-ant-admin..."
            value={adminKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Format warning */}
        {formatWarning && !error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              This doesn&apos;t look like an Admin key. Admin keys start with{" "}
              <code className="font-mono">sk-ant-admin</code>. Standard API keys
              won&apos;t work for usage data.
            </span>
          </div>
        )}

        {/* Security callout */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
          <Shield size={12} />
          <span>
            Proxied through your local BroadClaw server to Anthropic&apos;s API.
            Never stored on disk — only held in memory during the request.
          </span>
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
                  Use manual rate entry instead &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Usage summary — shown after successful key validation */}
        {usageResult && (
          <div className="mt-5 rounded-lg border border-success/20 bg-success/5 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 size={16} />
              Connected — here&apos;s your last {usageResult.period.days} days
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">Input tokens</p>
                <p className="text-lg font-semibold">
                  {formatTokens(usageResult.usage.input)}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">Output tokens</p>
                <p className="text-lg font-semibold">
                  {formatTokens(usageResult.usage.output)}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">Cached reads</p>
                <p className="text-lg font-semibold">
                  {formatTokens(usageResult.usage.cached)}
                </p>
              </div>
              <div className="rounded-lg bg-surface p-3">
                <p className="text-xs text-muted-foreground">Cost</p>
                <p className="text-lg font-semibold">
                  {usageResult.cost.totalUsd > 0
                    ? `$${usageResult.cost.totalUsd.toFixed(2)}`
                    : "—"}
                </p>
              </div>
            </div>

            {usageResult.usage.totalTokens > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Total: {formatTokens(usageResult.usage.totalTokens)} tokens this
                period
              </p>
            )}

            <button
              onClick={handleConfirmRates}
              className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Confirm &amp; Continue to Optimizer
            </button>
          </div>
        )}

        {/* Connect button — only show if no result yet */}
        {!usageResult && (
          <button
            onClick={handleConnect}
            disabled={!adminKey.trim() || validating}
            className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {validating ? "Pulling usage data..." : "Connect & Pull Usage"}
          </button>
        )}

        <button
          onClick={onFallbackToManual}
          className="mt-2 w-full py-2 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip — I&apos;ll enter rates manually
        </button>
      </div>
    </div>
  );
}
