import { NextRequest, NextResponse } from "next/server";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv } from "@/lib/kv";
import type { Env, PSPName, ProcessorQueryResponse } from "@/lib/types";

export const runtime = "edge";

const PROCESSOR_TRANSACTION_METHODS = ["GET", "OPTIONS"] as const;

const ACI_QUERY_BASE_URL = "https://eu-test.oppwa.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readProcessorResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (isRecord(payload)) {
    const maybeError = payload as {
      error?: { message?: string };
      message?: string;
      detail?: string;
      title?: string;
    };

    if (isRecord(maybeError.error) && typeof maybeError.error.message === "string") {
      return maybeError.error.message;
    }
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
    if (typeof maybeError.detail === "string") {
      return maybeError.detail;
    }
    if (typeof maybeError.title === "string") {
      return maybeError.title;
    }
  }

  return fallback;
}

async function queryACI(
  env: Env,
  transactionId: string,
): Promise<{ status: number; payload: ProcessorQueryResponse }> {
  const params = new URLSearchParams();
  params.append("entityId", env.ACI_ENTITY_ID);
  params.append("includeLinkedTransactions", "true");

  let response: Response;

  try {
    response = await fetch(
      `${ACI_QUERY_BASE_URL}/v3/query/${encodeURIComponent(transactionId)}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${env.ACI_TOKEN}`,
        },
      },
    );
  } catch (error) {
    return {
      status: 502,
      payload: {
        success: false,
        processor: "aci",
        transaction_id: transactionId,
        psp_transaction_id: transactionId,
        queried_at: Date.now(),
        response_body: null,
        message:
          error instanceof Error
            ? error.message
            : "ACI query request failed before a response was received",
      },
    };
  }

  const body = await readProcessorResponse(response);
  const json = isRecord(body) ? body : null;
  const result = isRecord(json?.result)
    ? (json.result as { code?: unknown; description?: unknown })
    : undefined;

  return {
    status: response.ok ? 200 : response.status,
    payload: {
      success: response.ok,
      processor: "aci",
      transaction_id: transactionId,
      psp_transaction_id: transactionId,
      queried_at: Date.now(),
      result_code: typeof result?.code === "string" ? result.code : undefined,
      result_description:
        typeof result?.description === "string"
          ? result.description
          : undefined,
      response_body: body,
      message: response.ok
        ? undefined
        : getMessage(body, `ACI query failed with HTTP ${response.status}`),
    },
  };
}

async function queryStripe(
  env: Env,
  transactionId: string,
): Promise<{ status: number; payload: ProcessorQueryResponse }> {
  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;

  let response: Response;

  try {
    response = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: authHeader,
        },
      },
    );
  } catch (error) {
    return {
      status: 502,
      payload: {
        success: false,
        processor: "stripe",
        transaction_id: transactionId,
        psp_transaction_id: transactionId,
        queried_at: Date.now(),
        response_body: null,
        message:
          error instanceof Error
            ? error.message
            : "Stripe query request failed before a response was received",
      },
    };
  }

  const body = await readProcessorResponse(response);
  const json = isRecord(body) ? body : null;
  const lastPaymentError = isRecord(json?.last_payment_error)
    ? (json.last_payment_error as { message?: unknown })
    : undefined;
  const metadata = isRecord(json?.metadata)
    ? (json.metadata as { merchantTransactionId?: unknown })
    : undefined;

  return {
    status: response.ok ? 200 : response.status,
    payload: {
      success: response.ok,
      processor: "stripe",
      transaction_id: transactionId,
      psp_transaction_id: transactionId,
      merchant_transaction_id:
        typeof metadata?.merchantTransactionId === "string"
          ? metadata.merchantTransactionId
          : undefined,
      queried_at: Date.now(),
      status: typeof json?.status === "string" ? json.status : undefined,
      result_code: typeof json?.status === "string" ? json.status : undefined,
      result_description:
        typeof lastPaymentError?.message === "string"
          ? lastPaymentError.message
          : typeof json?.cancellation_reason === "string"
            ? json.cancellation_reason
            : undefined,
      response_body: body,
      message: response.ok
        ? undefined
        : getMessage(body, `Stripe query failed with HTTP ${response.status}`),
    },
  };
}

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

  if (processor !== "aci" && processor !== "stripe") {
    return corsJson(
      origin,
      env,
      { error: "Unsupported processor" },
      { status: 400 },
      PROCESSOR_TRANSACTION_METHODS,
    );
  }

  const typedEnv = env as Env;
  const result =
    (processor as PSPName) === "aci"
      ? await queryACI(typedEnv, transactionId)
      : await queryStripe(typedEnv, transactionId);

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