import { NextResponse } from "next/server";
import type { Env } from "./types";

// explicit origin allowlist -- never wildcard in production
export function corsHeaders(
  origin: string | null,
  env: Partial<Env>,
  methods: readonly string[] = ["GET", "POST", "PATCH", "OPTIONS"],
) {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim());
  const isAllowed = origin ? allowed.includes(origin) : false;

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin! : allowed[0] ?? "",
    "Access-Control-Allow-Methods": methods.join(", "),
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function corsJson(
  origin: string | null,
  env: Partial<Env>,
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
  methods: readonly string[] = ["GET", "POST", "PATCH", "OPTIONS"],
) {
  const headers = new Headers(init?.headers);

  Object.entries(corsHeaders(origin, env, methods)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return NextResponse.json(body, {
    status: init?.status,
    headers,
  });
}

export function corsPreflight(
  origin: string | null,
  env: Partial<Env>,
  methods: readonly string[] = ["GET", "POST", "PATCH", "OPTIONS"],
) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin, env, methods),
  });
}
