"use client";

import { Settings, Trash2, Plug, Plus, CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useGateway } from "@/contexts/GatewayContext";

export default function SettingsPage() {
  const {
    gateways,
    activeGateway,
    connected,
    switchGateway,
    deleteGateway,
    disconnect,
  } = useGateway();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function handleDelete(id: string) {
    deleteGateway(id);
    setConfirmDelete(null);
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
              Manage gateway connections
            </p>
          </div>
        </div>

        {/* Gateway Management */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Gateways</h2>
            <Link
              href="/connect"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus size={14} />
              Add Gateway
            </Link>
          </div>

          {gateways.length === 0 && (
            <div className="rounded-lg border border-border bg-surface p-6 text-center">
              <Plug size={24} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No gateways connected. Add one to get started.
              </p>
            </div>
          )}

          <div className="space-y-3">
            {gateways.map((gw) => {
              const isActive = activeGateway?.id === gw.id && connected;
              return (
                <div
                  key={gw.id}
                  className={`flex items-center justify-between rounded-lg border bg-surface p-4 transition-colors ${
                    isActive ? "border-success/30" : "border-border"
                  }`}
                  data-gateway={gw.id}
                  data-active={isActive}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isActive ? (
                      <CheckCircle2 size={16} className="text-success shrink-0" />
                    ) : (
                      <Circle size={16} className="text-muted-foreground/30 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {gw.name}
                        {isActive && (
                          <span className="ml-2 text-xs text-success">Connected</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground/60 font-mono truncate">
                        {gw.url}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {/* Switch to this gateway */}
                    {!isActive && (
                      <button
                        onClick={() => switchGateway(gw.id)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        Connect
                      </button>
                    )}

                    {/* Disconnect from active gateway */}
                    {isActive && (
                      <button
                        onClick={() => disconnect()}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                      >
                        Disconnect
                      </button>
                    )}

                    {/* Delete gateway */}
                    {confirmDelete === gw.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Delete?</span>
                        <button
                          onClick={() => handleDelete(gw.id)}
                          className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(gw.id)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
