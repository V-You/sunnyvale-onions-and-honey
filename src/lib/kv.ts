// KV access helper
// on Cloudflare Pages, use the SESSIONS KV binding
// in local dev, use an in-memory map as a fallback

import { getOptionalRequestContext } from "@cloudflare/next-on-pages";
import type { Env } from "./types";

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

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
};

function getPagesEnv(): Partial<Env> | undefined {
  try {
    const context = getOptionalRequestContext?.();
    if (context?.env) {
      return context.env as Partial<Env>;
    }
  } catch {
    // not running on Cloudflare Pages -- use local fallbacks
  }

  return undefined;
}

export function getSessionsKV(): KVLike {
  const env = getPagesEnv();
  const maybeKv = env?.SESSIONS as KVLike | undefined;

  if (maybeKv && typeof maybeKv.get === "function" && typeof maybeKv.put === "function") {
    return maybeKv;
  }

  return memoryKV;
}

export function getEnv(): Partial<Env> {
  const env = getPagesEnv();
  if (env) {
    return env;
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