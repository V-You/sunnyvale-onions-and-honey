import { NextRequest } from "next/server";
import { corsJson } from "./cors";
import type { Env } from "./types";

function parseAcpApiKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("Authorization") ?? "";

  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function requireAcpAuth(
  request: NextRequest,
  env: Partial<Env>,
  methods: readonly string[] = ["GET", "POST", "PATCH", "OPTIONS"],
) {
  const origin = request.headers.get("origin");
  const allowedKeys = parseAcpApiKeys(env.ACP_API_KEYS);

  if (allowedKeys.length === 0) {
    return corsJson(
      origin,
      env,
      { error: "ACP API keys are not configured" },
      { status: 503 },
      methods,
    );
  }

  const token = readBearerToken(request);
  if (token && allowedKeys.includes(token)) {
    return null;
  }

  return corsJson(
    origin,
    env,
    { error: "Authorization: Bearer <api_key> header required" },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="acp"',
      },
    },
    methods,
  );
}