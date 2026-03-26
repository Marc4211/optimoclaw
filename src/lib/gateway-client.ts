import {
  Agent,
  ReqFrame,
  ResFrame,
  EventFrame,
  GatewayFrame,
  ConnectResponse,
  OpenClawConfig,
} from "@/types";
import {
  getOrCreateIdentity,
  signChallenge,
  saveDeviceToken,
  getDeviceToken,
  clearDeviceToken,
} from "./device-identity";

type EventHandler = (event: EventFrame) => void;
type StateHandler = (state: "connecting" | "connected" | "disconnected") => void;

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
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private _connected = false;
  private challengeNonce: string | null = null;

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

  connect(): Promise<void> {
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

        // Handle connect challenge — sign with Ed25519 device key
        if (
          frame.type === "event" &&
          frame.event === "connect.challenge"
        ) {
          const payload = frame.payload as { nonce?: string };
          const nonce = payload?.nonce;
          if (!nonce) {
            settled = true;
            reject(new Error("Gateway sent challenge without nonce"));
            return;
          }
          this.challengeNonce = nonce;

          // Load or create stable device identity
          const identity = getOrCreateIdentity();

          // Sign the v3 challenge payload
          const deviceAuth = signChallenge(identity, {
            nonce,
            token: this.token,
            platform: "web",
            deviceFamily: "broadclaw",
            role: "operator",
            scopes: ["operator.read", "operator.write"],
          });

          // Build connect params matching OpenClaw v3 protocol
          const connectParams: Record<string, unknown> = {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "openclaw-control-ui",
              version: "1.0.0",
              platform: "web",
              mode: "webchat",
            },
            role: "operator",
            scopes: ["operator.read", "operator.write"],
            device: deviceAuth,
            auth: { token: this.token },
          };

          // If we have a device token from a previous session, include it
          // so the gateway can skip the full pairing flow
          const existingDeviceToken = getDeviceToken();
          if (existingDeviceToken) {
            connectParams.deviceToken = existingDeviceToken;
          }

          this.sendRaw({
            type: "req",
            id: this.generateId(),
            method: "connect",
            params: connectParams,
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

            // Persist device token if the gateway issued one
            const connectRes = frame.payload as ConnectResponse | undefined;
            if (connectRes?.deviceToken) {
              saveDeviceToken(connectRes.deviceToken);
            }

            resolve();
          } else {
            const errCode = frame.error?.code ?? "";
            const errMsg =
              frame.error?.message ?? "Connection rejected by gateway";

            // Clear device token if auth failed — force re-pair next time
            if (
              errCode === "DEVICE_AUTH_NONCE_REQUIRED" ||
              errCode === "DEVICE_AUTH_SIGNATURE_INVALID" ||
              errCode === "DEVICE_TOKEN_EXPIRED"
            ) {
              clearDeviceToken();
            }

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

  // --- Typed convenience methods ---

  async listAgents(): Promise<Agent[]> {
    const result = await this.request<Agent[]>("agents.list");
    return result ?? [];
  }

  async getConfig(): Promise<OpenClawConfig> {
    return this.request<OpenClawConfig>("config.get");
  }

  async patchConfig(patch: Record<string, unknown>): Promise<unknown> {
    return this.request("config.patch", patch);
  }

  async applyConfig(restart = true): Promise<unknown> {
    return this.request("config.apply", { restart, timeout: 30000 });
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
