import { NextRequest } from "next/server";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv } from "@/lib/kv";
import { queryProcessorByMerchantTransactionId } from "@/lib/processor-query";
import {
  checkRateLimit,
  createRateLimitHeaders,
  getRateLimitIdentifier,
} from "@/lib/rate-limit";
import type { Env, PSPName } from "@/lib/types";

export const runtime = "edge";

const PROCESSOR_LOOKUP_METHODS = ["GET", "OPTIONS"] as const;

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ processor: string }> },
) {
  const { processor } = await params;
  const env = getEnv();
  const origin = request.headers.get("origin");
  const lookupRateLimit = await checkRateLimit(
    "processor_lookup",
    getRateLimitIdentifier(request),
    60,
    60,
  );
  if (lookupRateLimit.limited) {
    return corsJson(
      origin,
      env,
      { error: "Too many processor lookup requests. Slow down and try again soon." },
      {
        status: 429,
        headers: createRateLimitHeaders(lookupRateLimit),
      },
      PROCESSOR_LOOKUP_METHODS,
    );
  }
  const merchantTransactionId =
    request.nextUrl.searchParams.get("merchantTransactionId") ??
    request.nextUrl.searchParams.get("merchant_transaction_id");

  if (!merchantTransactionId) {
    return corsJson(
      origin,
      env,
      { error: "merchantTransactionId query parameter is required" },
      { status: 400 },
      PROCESSOR_LOOKUP_METHODS,
    );
  }

  if (
    processor !== "aci" &&
    processor !== "stripe" &&
    processor !== "braintree"
  ) {
    return corsJson(
      origin,
      env,
      { error: "Unsupported processor" },
      { status: 400 },
      PROCESSOR_LOOKUP_METHODS,
    );
  }

  const result = await queryProcessorByMerchantTransactionId(
    env as Env,
    processor as PSPName,
    merchantTransactionId,
  );

  return corsJson(
    origin,
    env,
    result.payload,
    { status: result.status },
    PROCESSOR_LOOKUP_METHODS,
  );
}

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    PROCESSOR_LOOKUP_METHODS,
  );
}