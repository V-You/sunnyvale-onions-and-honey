// KV access helper
// on Cloudflare Workers, use the SESSIONS KV binding
// in local dev, use an in-memory map as a fallback

import type { Env } from "./types";

// minimal KV-compatible interface for local dev fallback
interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// in-memory fallback for local development
const memoryStore = new Map<string, { value: string; expiry: number }>();

const memoryKV: KVLike = {
  get: async (key: string) => {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
    const expiry = opts?.expirationTtl
      ? Date.now() + opts.expirationTtl * 1000
      : 0;
    memoryStore.set(key, { value, expiry });
  },
  delete: async (key: string) => {
    memoryStore.delete(key);
  },
} as unknown as KVLike;

// try to get the Cloudflare env, fall back to local
export function getSessionsKV(): KVLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    if (env?.SESSIONS) return env.SESSIONS;
  } catch {
    // not running on Cloudflare -- use in-memory fallback
  }
  return memoryKV;
}

export function getEnv(): Partial<Env> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const { env } = getCloudflareContext();
    if (env) return env as Partial<Env>;
  } catch {
    // not running on Cloudflare -- use process.env
  }
  return {
    EV_API_KEY: process.env.EV_API_KEY,
    EV_APP_ID: process.env.EV_APP_ID,
    ACTIVE_PSP: process.env.ACTIVE_PSP,
    ACI_ENTITY_ID: process.env.ACI_ENTITY_ID,
    ACI_TOKEN: process.env.ACI_TOKEN,
    ACI_RELAY_DOMAIN: process.env.ACI_RELAY_DOMAIN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_RELAY_DOMAIN: process.env.STRIPE_RELAY_DOMAIN,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  } as Partial<Env>;
}
