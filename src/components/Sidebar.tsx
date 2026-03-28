"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Activity,
  Wrench,
  Plug,
  Bot,
  ChevronDown,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { useGateway } from "@/contexts/GatewayContext";

const navItems = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/optimizer", label: "Token Optimizer", icon: Gauge },
  { href: "/graph", label: "Performance Graph", icon: Activity },
  { href: "/skills", label: "Skill Studio", icon: Wrench },
];

export default function Sidebar() {
  const pathname = usePathname();
  const {
    connected,
    connecting,
    disconnect,
    gateways,
    activeGateway,
    switchGateway,
    deleteGateway,
  } = useGateway();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  const hasGateways = gateways.length > 0;

  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <span className="text-sm font-bold text-primary-foreground">B</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">BroadClaw</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings at bottom of nav */}
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
            pathname === "/settings"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          <Settings size={16} />
          Settings
        </Link>
      </nav>

      {/* Gateway switcher */}
      <div
        className="relative border-t border-border p-3"
        ref={dropdownRef}
        data-gateway-connected={String(connected)}
        data-gateway-name={activeGateway?.name ?? ""}
      >
        {hasGateways ? (
          <>
            {/* Active gateway button */}
            <button
              onClick={() => setOpen((prev) => !prev)}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  connected
                    ? "bg-success"
                    : connecting
                      ? "bg-warning animate-pulse"
                      : "bg-muted-foreground/40"
                }`}
              />
              <span className="flex-1 truncate text-left">
                {activeGateway?.name ?? "Select Gateway"}
              </span>
              <ChevronDown
                size={14}
                className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown */}
            {open && (
              <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border bg-surface shadow-lg">
                <div className="max-h-48 overflow-y-auto p-1">
                  {gateways.map((gw) => {
                    const isActive = gw.id === activeGateway?.id;
                    return (
                      <div
                        key={gw.id}
                        className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-surface-hover hover:text-foreground cursor-pointer"
                        }`}
                        onClick={() => {
                          if (!isActive) {
                            switchGateway(gw.id);
                            setOpen(false);
                          }
                        }}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            isActive && connected
                              ? "bg-success"
                              : "bg-muted-foreground/30"
                          }`}
                        />
                        <span className="flex-1 truncate">{gw.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteGateway(gw.id);
                          }}
                          className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:bg-danger/10 hover:text-danger group-hover:block"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Divider + Add */}
                <div className="border-t border-border p-1">
                  <Link
                    href="/connect"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <Plus size={14} />
                    Add Gateway
                  </Link>
                </div>

                {/* Disconnect option when connected */}
                {connected && (
                  <div className="border-t border-border p-1">
                    <button
                      onClick={() => {
                        disconnect();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Plug size={14} />
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <Link
            href="/connect"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Plug size={16} />
            Connect Gateway
          </Link>
        )}
      </div>
    </aside>
  );
}
