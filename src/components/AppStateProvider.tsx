// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

"use client";

import { useEffect } from "react";
import { useGateway } from "@/contexts/GatewayContext";

/**
 * Injects full app state onto window.__OPTIMOCLAW_STATE__ for agent consumption.
 * Updates on every render so agents always get fresh data.
 * No visual output — purely a side-effect component.
 */
export default function AppStateProvider() {
  const {
    connected,
    connecting,
    activeGateway,
    agents,
    gateways,
  } = useGateway();

  useEffect(() => {
    const state = {
      app: "optimoclaw",
      version: "0.1.0",
      gateway: {
        connected,
        connecting,
        name: activeGateway?.name ?? null,
        url: activeGateway?.url ?? null,
        savedGateways: gateways.map((g) => ({ id: g.id, name: g.name })),
      },
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        status: a.status,
        sessionCount: a.sessionCount,
      })),
      timestamp: new Date().toISOString(),
    };

    (window as unknown as Record<string, unknown>).__OPTIMOCLAW_STATE__ = state;
  });

  return null;
}
