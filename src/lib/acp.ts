import type { NextRequest } from "next/server";
import { corsJson } from "./cors";
import type { Env } from "./types";
import {
  ACP_DOCUMENTATION_URL,
  ACP_LATEST_API_VERSION,
  ACP_PROTOCOL_NAME,
  ACP_SUPPORTED_API_VERSIONS,
  type AcpApiVersion,
  isSupportedAcpApiVersion,
} from "./acp-shared";

export const ACP_DISCOVERY_CACHE_CONTROL = "public, max-age=3600";
export const ACP_VERSION_HEADER = "API-Version";

export function requireAcpApiVersion(
  request: NextRequest,
  origin: string | null,
  env: Partial<Env>,
  methods: readonly string[],
) {
  const requestedVersion = request.headers.get(ACP_VERSION_HEADER);

  if (!requestedVersion) {
    return {
      version: null,
      response: corsJson(
        origin,
        env,
        {
          error: "API-Version header required",
          code: "missing_api_version",
          supported_versions: ACP_SUPPORTED_API_VERSIONS,
        },
        {
          status: 400,
          headers: {
            [ACP_VERSION_HEADER]: ACP_LATEST_API_VERSION,
          },
        },
        methods,
      ),
    };
  }

  if (!isSupportedAcpApiVersion(requestedVersion)) {
    return {
      version: null,
      response: corsJson(
        origin,
        env,
        {
          error: `Unsupported API-Version: ${requestedVersion}`,
          code: "unsupported_api_version",
          supported_versions: ACP_SUPPORTED_API_VERSIONS,
        },
        {
          status: 400,
          headers: {
            [ACP_VERSION_HEADER]: ACP_LATEST_API_VERSION,
          },
        },
        methods,
      ),
    };
  }

  return {
    version: requestedVersion,
    response: null,
  } as const;
}

export function createAcpDiscoveryResponse(request: NextRequest) {
  return {
    protocol: {
      name: ACP_PROTOCOL_NAME,
      version: ACP_LATEST_API_VERSION,
      supported_versions: [...ACP_SUPPORTED_API_VERSIONS],
      documentation_url: ACP_DOCUMENTATION_URL,
    },
    api_base_url: new URL("/api", request.url).toString(),
    transports: ["rest"],
    capabilities: {
      services: ["checkout"],
      supported_currencies: ["usd"],
      supported_locales: ["en-US"],
    },
  };
}