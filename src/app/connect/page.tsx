"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { useGateway } from "@/contexts/GatewayContext";

export default function ConnectPage() {
  const router = useRouter();
  const { connect, connecting, error, connected, activeGateway } = useGateway();
  const [name, setName] = useState("");
  const [url, setUrl] = useState(activeGateway?.url ?? "");
  const [token, setToken] = useState(activeGateway?.token ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const gatewayName = name.trim() || `Gateway`;
    await connect({
      id: crypto.randomUUID(),
      name: gatewayName,
      url,
      token,
    });
  }

  // Redirect on successful connection
  useEffect(() => {
    if (connected) {
      router.push("/agents");
    }
  }, [connected, router]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Plug size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Connect to Gateway</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your OpenClaw gateway URL and authentication token.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm text-muted-foreground"
            >
              Gateway Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Production, Digantic, Local"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="url"
              className="mb-1.5 block text-sm text-muted-foreground"
            >
              Gateway URL
            </label>
            <input
              id="url"
              type="url"
              placeholder="http://localhost:3069"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Running OpenClaw locally? Your gateway is at{" "}
              <span className="font-mono text-foreground">http://localhost:3069/</span>{" "}
              by default.
            </p>
          </div>

          <div>
            <label
              htmlFor="token"
              className="mb-1.5 block text-sm text-muted-foreground"
            >
              Auth Token
            </label>
            <input
              id="token"
              type="password"
              placeholder="Enter your gateway token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Find your token in your OpenClaw config file at{" "}
              <span className="font-mono text-foreground">~/.openclaw/openclaw.json</span>{" "}
              (or{" "}
              <span className="font-mono text-foreground">~/.openclaw-[profile]/openclaw.json</span>{" "}
              if you use profiles) under{" "}
              <span className="font-mono text-foreground">gateway.auth.token</span>.
              You can also run{" "}
              <span className="font-mono text-foreground">openclaw gateway status</span>{" "}
              in your terminal to confirm your gateway URL and port.
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={connecting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {connecting ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
