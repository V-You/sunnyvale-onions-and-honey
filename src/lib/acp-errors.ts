export function createAcpError(
  message: string,
  options?: {
    type?: "invalid_request" | "processing_error" | "service_unavailable";
    code?: string;
    param?: string;
  },
) {
  return {
    type: options?.type ?? "invalid_request",
    code: options?.code ?? "invalid",
    message,
    ...(options?.param ? { param: options.param } : {}),
  };
}