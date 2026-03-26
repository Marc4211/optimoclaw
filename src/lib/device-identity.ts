/**
 * Device Identity — Ed25519 keypair generation, persistence, and challenge signing.
 *
 * The OpenClaw gateway uses a cryptographic challenge-response handshake:
 *   1. Gateway sends connect.challenge with a nonce
 *   2. Client signs a v3 payload (nonce + token + metadata) with its Ed25519 key
 *   3. Gateway verifies the signature and issues a device token
 *
 * The keypair is generated once and persisted to localStorage so the device
 * identity is stable across sessions. The gateway-issued device token is also
 * persisted and used on reconnects to skip the full pairing flow.
 */

import nacl from "tweetnacl";
import {
  encodeBase64,
  decodeBase64,
  encodeUTF8,
} from "tweetnacl-util";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "broadclaw:device";
const KEY_KEYPAIR = `${STORAGE_PREFIX}:keypair`;
const KEY_DEVICE_ID = `${STORAGE_PREFIX}:id`;
const KEY_DEVICE_TOKEN = `${STORAGE_PREFIX}:token`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceIdentity {
  id: string;
  publicKey: string; // base64
  secretKey: string; // base64 — stays in localStorage, never sent
}

export interface DeviceAuthPayload {
  id: string;
  publicKey: string;
  signature: string; // base64
  signedAt: string; // ISO 8601
  nonce: string;
}

export interface SignableConnectParams {
  nonce: string;
  token: string;
  platform: string;
  deviceFamily: string;
  role: string;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a stable device ID (UUID v4 format). */
function generateDeviceId(): string {
  const bytes = nacl.randomBytes(16);
  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/**
 * Build the canonical v3 signing payload.
 *
 * Format: deterministic JSON with sorted keys, prefixed with a version tag
 * so the gateway can evolve the schema without ambiguity.
 */
function buildSigningPayload(params: SignableConnectParams): Uint8Array {
  const canonical = {
    v: 3,
    nonce: params.nonce,
    token: params.token,
    platform: params.platform,
    deviceFamily: params.deviceFamily,
    role: params.role,
    scopes: [...params.scopes].sort(),
  };
  // JSON with sorted keys for deterministic output
  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return new TextEncoder().encode(json);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load or create the device identity (keypair + device ID).
 * Persisted to localStorage so identity is stable across sessions.
 */
export function getOrCreateIdentity(): DeviceIdentity {
  // Try to load existing identity
  if (typeof window !== "undefined") {
    const storedId = localStorage.getItem(KEY_DEVICE_ID);
    const storedKeypair = localStorage.getItem(KEY_KEYPAIR);

    if (storedId && storedKeypair) {
      try {
        const kp = JSON.parse(storedKeypair);
        return {
          id: storedId,
          publicKey: kp.publicKey,
          secretKey: kp.secretKey,
        };
      } catch {
        // Corrupted — regenerate below
      }
    }
  }

  // Generate fresh identity
  const keyPair = nacl.sign.keyPair();
  const identity: DeviceIdentity = {
    id: generateDeviceId(),
    publicKey: encodeBase64(keyPair.publicKey),
    secretKey: encodeBase64(keyPair.secretKey),
  };

  // Persist
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY_DEVICE_ID, identity.id);
    localStorage.setItem(
      KEY_KEYPAIR,
      JSON.stringify({
        publicKey: identity.publicKey,
        secretKey: identity.secretKey,
      })
    );
  }

  return identity;
}

/**
 * Sign the connect challenge and return the device auth payload
 * to include in connect.params.device.
 */
export function signChallenge(
  identity: DeviceIdentity,
  params: SignableConnectParams
): DeviceAuthPayload {
  const message = buildSigningPayload(params);
  const secretKey = decodeBase64(identity.secretKey);
  const signature = nacl.sign.detached(message, secretKey);

  return {
    id: identity.id,
    publicKey: identity.publicKey,
    signature: encodeBase64(signature),
    signedAt: new Date().toISOString(),
    nonce: params.nonce,
  };
}

/**
 * Store the device token issued by the gateway after successful pairing.
 * Used on reconnects to skip the full challenge-response flow.
 */
export function saveDeviceToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY_DEVICE_TOKEN, token);
  }
}

/**
 * Retrieve a previously saved device token, or null if none exists.
 */
export function getDeviceToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem(KEY_DEVICE_TOKEN);
  }
  return null;
}

/**
 * Clear the device token (e.g. on explicit disconnect or auth failure).
 */
export function clearDeviceToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEY_DEVICE_TOKEN);
  }
}

/**
 * Nuke the entire device identity — keypair, ID, and token.
 * Use only when the user explicitly wants to re-pair.
 */
export function resetIdentity(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(KEY_DEVICE_ID);
    localStorage.removeItem(KEY_KEYPAIR);
    localStorage.removeItem(KEY_DEVICE_TOKEN);
  }
}
