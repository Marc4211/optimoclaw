"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Gauge,
  Activity,
  Wrench,
  Plug,
  Bot,
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
  const { connected, disconnect } = useGateway();

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
      </nav>

      {/* Connection status */}
      <div className="border-t border-border p-3">
        {connected ? (
          <button
            onClick={disconnect}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-success" />
            Connected
          </button>
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
