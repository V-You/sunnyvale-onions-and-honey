import type { Env } from "./types";

// explicit origin allowlist -- never wildcard in production
export function corsHeaders(origin: string | null, env: Env) {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim());
  const isAllowed = origin ? allowed.includes(origin) : false;

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Idempotency-Key",
  };
}
