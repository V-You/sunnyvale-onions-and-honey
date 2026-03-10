import { getSessionsKV } from "./kv";

interface RateLimitState {
  count: number;
  reset_at: number;
}

export interface RateLimitResult {
  limited: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

const RATE_LIMIT_PREFIX = "rate_limit";

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9:._-]/g, "_").slice(0, 120);
}

function buildRateLimitKey(scope: string, identifier: string): string {
  return `${RATE_LIMIT_PREFIX}:${scope}:${sanitizeIdentifier(identifier)}`;
}

function parseRateLimitState(raw: string | null): RateLimitState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RateLimitState>;
    if (
      typeof parsed.count === "number" &&
      typeof parsed.reset_at === "number"
    ) {
      return {
        count: parsed.count,
        reset_at: parsed.reset_at,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function getRateLimitIdentifier(request: Request): string {
  const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const userAgent = request.headers.get("user-agent")?.trim() ?? "unknown";

  return sanitizeIdentifier(
    cfConnectingIp || forwardedFor || realIp || `ua:${userAgent}`,
  );
}

export async function checkRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const kv = getSessionsKV();
  const now = Date.now();
  const key = buildRateLimitKey(scope, identifier);
  const state = parseRateLimitState(await kv.get(key));

  if (!state || state.reset_at <= now) {
    const resetAt = now + windowSeconds * 1000;
    await kv.put(
      key,
      JSON.stringify({ count: 1, reset_at: resetAt }),
      { expirationTtl: windowSeconds },
    );

    return {
      limited: false,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt: Math.ceil(resetAt / 1000),
      retryAfterSeconds: 0,
    };
  }

  if (state.count >= limit) {
    return {
      limited: true,
      limit,
      remaining: 0,
      resetAt: Math.ceil(state.reset_at / 1000),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((state.reset_at - now) / 1000),
      ),
    };
  }

  const nextCount = state.count + 1;
  const ttl = Math.max(1, Math.ceil((state.reset_at - now) / 1000));

  await kv.put(
    key,
    JSON.stringify({ count: nextCount, reset_at: state.reset_at }),
    { expirationTtl: ttl },
  );

  return {
    limited: false,
    limit,
    remaining: Math.max(0, limit - nextCount),
    resetAt: Math.ceil(state.reset_at / 1000),
    retryAfterSeconds: 0,
  };
}

export function createRateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
    ...(result.limited
      ? { "Retry-After": String(result.retryAfterSeconds) }
      : {}),
  };
}