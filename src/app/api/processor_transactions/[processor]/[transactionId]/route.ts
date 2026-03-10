import { NextRequest } from "next/server";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv } from "@/lib/kv";
import { queryProcessorByTransactionId } from "@/lib/processor-query";
import type { Env, PSPName } from "@/lib/types";

export const runtime = "edge";

const PROCESSOR_TRANSACTION_METHODS = ["GET", "OPTIONS"] as const;

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ processor: string; transactionId: string }> },
) {
  const { processor, transactionId } = await params;
  const env = getEnv();
  const origin = request.headers.get("origin");

  if (!transactionId) {
    return corsJson(
      origin,
      env,
      { error: "Transaction id is required" },
      { status: 400 },
      PROCESSOR_TRANSACTION_METHODS,
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
      PROCESSOR_TRANSACTION_METHODS,
    );
  }

  const result = await queryProcessorByTransactionId(
    env as Env,
    processor as PSPName,
    transactionId,
  );

  return corsJson(
    origin,
    env,
    result.payload,
    { status: result.status },
    PROCESSOR_TRANSACTION_METHODS,
  );
}

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    PROCESSOR_TRANSACTION_METHODS,
  );
}