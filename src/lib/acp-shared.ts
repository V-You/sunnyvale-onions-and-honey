export const ACP_PROTOCOL_NAME = "acp";
export const ACP_SUPPORTED_API_VERSIONS = [
  "2026-01-16",
  "2026-01-30",
] as const;

export type AcpApiVersion = (typeof ACP_SUPPORTED_API_VERSIONS)[number];

export const ACP_LATEST_API_VERSION =
  ACP_SUPPORTED_API_VERSIONS[ACP_SUPPORTED_API_VERSIONS.length - 1];

export const ACP_DOCUMENTATION_URL = "https://www.agenticcommerce.dev/docs";

export function isSupportedAcpApiVersion(
  value: string,
): value is AcpApiVersion {
  return ACP_SUPPORTED_API_VERSIONS.includes(value as AcpApiVersion);
}