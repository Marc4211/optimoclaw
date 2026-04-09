// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

"use client";

import { useGateway } from "@/contexts/GatewayContext";

export default function ConnectionStatus() {
  const { connected, connecting } = useGateway();

  if (connecting) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
        Connecting...
      </span>
    );
  }

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-success" />
        Connected
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-danger" />
      Disconnected
    </span>
  );
}
