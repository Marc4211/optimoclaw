// Copyright 2026 Cisco Systems, Inc. and its affiliates
//
// SPDX-License-Identifier: MIT

import {
  Agent,
  GatewayModel,
  ReqFrame,
  ResFrame,
  EventFrame,
  GatewayFrame,
  ConnectResponse,
  OpenClawConfig,
} from "@/types";

type EventHandler = (event: EventFrame) => void;
type StateHandler = (state: "connecting" | "connected" | "disconnected") => void;
type ReconnectHandler = (agents: Agent[]) => void;

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT = 15_000;
const RECONNECT_BASE = 800;
const RECONNECT_CAP = 15_000;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers: EventHandler[] = [];
  private stateHandlers: StateHandler[] = [];
  private reconnectHandlers: ReconnectHandler[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private _connected = false;
  private _snapshot: Record<string, unknown> | null = null;

  constructor(url: string, token: string) {
    // Normalize URL: ensure ws:// or wss:// and /gateway path
    let wsUrl = url.replace(/^https?:\/\//, "");
    wsUrl = wsUrl.replace(/\/+$/, "");
    const protocol = url.startsWith("https") ? "wss" : "ws";
    if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
      wsUrl = `${protocol}://${wsUrl}`;
    }
    if (!wsUrl.endsWith("/gateway")) {
      wsUrl += "/gateway";
    }
    this.url = wsUrl;
    this.token = token;
  }

  get connected(): boolean {
    return this._connected;
  }

  // --- Connection lifecycle ---

  connect(): Promise<Agent[]> {
    return new Promise((resolve, reject) => {
      this.shouldReconnect = true;
      this.emitState("connecting");

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(new Error(`Failed to create WebSocket: ${err}`));
        return;
      }

      let settled = false;

      this.ws.onopen = () => {
        // Wait for the challenge event from the gateway
        // The auth handshake happens in onmessage
      };

      this.ws.onmessage = (event) => {
        let frame: GatewayFrame;
        try {
          frame = JSON.parse(event.data);
        } catch {
          return;
        }

        // Handle connect challenge — respond with token auth
        if (
          frame.type === "event" &&
          frame.event === "connect.challenge"
        ) {
          this.sendRaw({
            type: "req",
            id: this.generateId(),
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "cli",
                version: "1.0.0",
                platform: "web",
                mode: "webchat",
              },
              role: "operator",
              scopes: ["operator.read", "operator.write", "operator.admin"],
              auth: { token: this.token },
            },
          });
          return;
        }

        // Handle connect response (first res frame)
        if (frame.type === "res" && !settled) {
          settled = true;
          if (frame.ok) {
            this._connected = true;
            this.reconnectAttempt = 0;
            this.emitState("connected");

            // Store the full snapshot for later use (config extraction, etc.)
            const payload = frame.payload as Record<string, unknown> | undefined;
            this._snapshot = (payload?.snapshot as Record<string, unknown>) ?? null;

            // Extract agents from hello-ok snapshot
            // Path: payload.snapshot.health.agents[]
            const snapshot = payload?.snapshot as Record<string, unknown> | undefined;
            const health = snapshot?.health as Record<string, unknown> | undefined;
            const snapshotAgents = (health?.agents as unknown[]) ?? [];
            const agents: Agent[] = snapshotAgents.map((a: unknown) => {
              const agent = a as Record<string, unknown>;
              const sessions = agent.sessions as Record<string, unknown> | undefined;
              const heartbeat = agent.heartbeat as Record<string, unknown> | undefined;
              const recent = sessions?.recent as unknown[] | undefined;

              // Primary model: agent.model.primary > agent.model (string) > heartbeat.model
              // agent.model may be a string or an object { primary: "..." }
              let primaryModel = "unknown";
              if (agent.model && typeof agent.model === "object") {
                const mObj = agent.model as Record<string, unknown>;
                primaryModel = String(mObj.primary ?? "") || String(heartbeat?.model ?? "unknown");
              } else if (typeof agent.model === "string" && agent.model) {
                primaryModel = agent.model;
              } else {
                primaryModel = String(heartbeat?.model ?? "unknown");
              }

              return {
                id: String(agent.agentId ?? ""),
                name: String(agent.agentId ?? ""),
                model: primaryModel,
                status: (recent?.length ?? 0) > 0 ? "online" as const : "idle" as const,
                sessionCount: Number(sessions?.count ?? 0),
                tokenUsage: 0,
              };
            });

            resolve(agents);
          } else {
            const errMsg =
              frame.error?.message ?? "Connection rejected by gateway";
            this._connected = false;
            this.shouldReconnect = false;
            reject(new Error(errMsg));
          }
          return;
        }

        // Normal message handling
        this.handleFrame(frame);
      };

      this.ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket connection failed"));
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.emitState("disconnected");
        this.rejectAllPending("Connection closed");
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      // Timeout the entire connect attempt
      setTimeout(() => {
        if (!settled) {
          settled = true;
          this.ws?.close();
          reject(new Error("Connection timed out"));
        }
      }, REQUEST_TIMEOUT);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._connected = false;
    this.ws?.close();
    this.ws = null;
    this.rejectAllPending("Disconnected");
    this.emitState("disconnected");
  }

  // --- Request/response ---

  async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this._connected || !this.ws) {
      throw new Error("Not connected to gateway");
    }

    const id = this.generateId();
    const frame: ReqFrame = { type: "req", id, method };
    if (params) frame.params = params;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, REQUEST_TIMEOUT);

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      this.sendRaw(frame);
    });
  }

  // --- Snapshot access ---

  get snapshot(): Record<string, unknown> | null {
    return this._snapshot;
  }

  // --- Typed convenience methods ---

  /** Fetch available models from the gateway. Returns the full configured model list. */
  async listModels(): Promise<GatewayModel[]> {
    try {
      const result = await this.request<{ models: GatewayModel[] } | GatewayModel[]>("models.list", {});
      // Handle both { models: [...] } and plain array responses
      if (Array.isArray(result)) return result;
      if (result && Array.isArray((result as { models: GatewayModel[] }).models)) {
        return (result as { models: GatewayModel[] }).models;
      }
      return [];
    } catch (err) {
      console.warn("[GatewayClient] models.list failed:", err);
      return [];
    }
  }

  async getConfig(): Promise<OpenClawConfig> {
    // The cli client ID doesn't get operator.read scope, so config.get
    // is unavailable. Extract config directly from the connect snapshot
    // which contains heartbeat settings, agent list, and session defaults.
    return this.extractConfigFromSnapshot();
  }

  /**
   * Build a partial OpenClawConfig from the hello-ok snapshot.
   * This is the fallback when config.get requires a scope we don't have.
   * The snapshot exposes per-agent heartbeat settings, session defaults,
   * and the default agent ID — enough to populate most optimizer levers.
   */
  private extractConfigFromSnapshot(): OpenClawConfig {
    if (!this._snapshot) return {};

    const health = this._snapshot.health as Record<string, unknown> | undefined;
    const agents = (health?.agents as Array<Record<string, unknown>>) ?? [];

    // Find the default agent to extract settings
    const defaultAgent = agents.find((a) => a.isDefault) ?? agents[0];
    const heartbeat = defaultAgent?.heartbeat as Record<string, unknown> | undefined;
    const defaultModelObj = defaultAgent?.model as Record<string, unknown> | undefined;

    const heartbeatModel = String(heartbeat?.model ?? "");
    const heartbeatEvery = String(heartbeat?.every ?? "30m");

    // Primary model: agent.model.primary > agent.model (if string) > heartbeat.model
    const primaryModel =
      String(defaultModelObj?.primary ?? "") ||
      (typeof defaultAgent?.model === "string" ? String(defaultAgent.model) : "") ||
      heartbeatModel ||
      undefined;

    const config: OpenClawConfig = {
      agents: {
        defaults: {
          model: primaryModel ? { primary: primaryModel } : undefined,
          heartbeat: heartbeat
            ? {
                every: heartbeatEvery,
                model: heartbeatModel,
                target: String(heartbeat.target ?? "none"),
              }
            : undefined,
        },
        list: agents.map((a) => {
          const hb = a.heartbeat as Record<string, unknown> | undefined;
          const mObj = a.model as Record<string, unknown> | undefined;
          const agentPrimaryModel =
            String(mObj?.primary ?? "") ||
            (typeof a.model === "string" ? String(a.model) : "") ||
            String(hb?.model ?? "");
          return {
            name: String(a.agentId ?? ""),
            model: agentPrimaryModel,
            heartbeat: hb
              ? {
                  every: String(hb.every ?? ""),
                  model: String(hb.model ?? ""),
                }
              : undefined,
          };
        }),
      },
    };

    // sessionDefaults from snapshot root
    const sessionDefaults = this._snapshot.sessionDefaults as Record<string, unknown> | undefined;
    if (sessionDefaults) {
      (config as Record<string, unknown>).sessionDefaults = sessionDefaults;
    }

    return config;
  }

  // Note: usage.status and usage.cost require operator.read scope which
  // the `cli` client ID doesn't get. Cost data comes from the Anthropic
  // Admin API instead (via /api/anthropic-usage route).

  async patchConfig(patch: Record<string, unknown>): Promise<unknown> {
    return this.requestWithScopeRetry("config.patch", patch);
  }

  async applyConfig(restart = true): Promise<unknown> {
    return this.requestWithScopeRetry("config.apply", { restart, timeout: 30000 });
  }

  /**
   * Attempt a request. If it fails with a missing-scope error,
   * silently reconnect (which sends updated scopes) and retry once.
   */
  private async requestWithScopeRetry<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    try {
      return await this.request<T>(method, params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("missing scope")) {
        // Missing scope — reconnect with updated scopes
        await this.reconnectForScopes();
        return await this.request<T>(method, params);
      }
      throw err;
    }
  }

  /**
   * Disconnect and reconnect to pick up new scopes.
   * Awaits the full connection handshake (including hello-ok)
   * before returning. Notifies reconnect handlers with the
   * new agent list so the context stays in sync.
   */
  private async reconnectForScopes(): Promise<void> {
    const wasReconnect = this.shouldReconnect;
    this.shouldReconnect = false;
    this._connected = false;
    this.ws?.close();
    this.ws = null;
    this.rejectAllPending("Reconnecting for scopes");
    this.shouldReconnect = wasReconnect;

    // connect() returns Agent[] only after hello-ok is received
    const agents = await this.connect();

    // Notify the context so it can update its agent list
    for (const handler of this.reconnectHandlers) {
      try {
        handler(agents);
      } catch {
        // Don't let handler errors block the retry
      }
    }
  }

  async subscribeSessions(): Promise<void> {
    await this.request("sessions.subscribe");
  }

  // --- Event handling ---

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  /** Called when reconnectForScopes completes — gives the context new agents */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.push(handler);
    return () => {
      this.reconnectHandlers = this.reconnectHandlers.filter((h) => h !== handler);
    };
  }

  // --- Internal ---

  private handleFrame(frame: GatewayFrame): void {
    if (frame.type === "res") {
      const res = frame as ResFrame;
      const pending = this.pending.get(res.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(res.id);
        if (res.ok) {
          pending.resolve(res.payload);
        } else {
          pending.reject(
            new Error(res.error?.message ?? "Request failed")
          );
        }
      }
    } else if (frame.type === "event") {
      const event = frame as EventFrame;
      for (const handler of this.eventHandlers) {
        try {
          handler(event);
        } catch {
          // Don't let handler errors break the event loop
        }
      }
    }
  }

  private sendRaw(frame: Record<string, unknown> | ReqFrame): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private emitState(state: "connecting" | "connected" | "disconnected"): void {
    for (const handler of this.stateHandlers) {
      try {
        handler(state);
      } catch {
        // ignore
      }
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE * Math.pow(2, this.reconnectAttempt),
      RECONNECT_CAP
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // reconnect failed, onclose will schedule another
      });
    }, delay);
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
