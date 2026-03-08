import { NextRequest, NextResponse } from "next/server";
import { routeToPSP } from "@/lib/psp-router";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import type { CheckoutSession, PaymentMethod, Env } from "@/lib/types";
import { getSessionsKV, getEnv } from "@/lib/kv";

export const runtime = "edge";

const CHECKOUT_COMPLETE_METHODS = ["POST", "OPTIONS"] as const;

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    CHECKOUT_COMPLETE_METHODS,
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const authResponse = requireAcpAuth(request, env, CHECKOUT_COMPLETE_METHODS);
  if (authResponse) {
    return authResponse;
  }

  const { id } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return corsJson(
      origin,
      env,
      { error: "Idempotency-Key header required" },
      { status: 400 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }

  const kv = getSessionsKV();
  if (!kv || !env) {
    return corsJson(
      origin,
      env,
      { error: "Service unavailable" },
      { status: 503 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return corsJson(
      origin,
      env,
      { error: "Session not found" },
      { status: 404 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }

  const session: CheckoutSession = JSON.parse(raw);
  if (session.status !== "open") {
    return corsJson(
      origin,
      env,
      { error: "Session not open or already completed" },
      { status: 409 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }

  const body = (await request.json()) as { payment_method?: PaymentMethod };
  const pm = body.payment_method;

  if (
    !pm ||
    pm.type !== "card" ||
    typeof pm.card_number !== "string" ||
    typeof pm.expiry_month !== "string" ||
    typeof pm.expiry_year !== "string" ||
    typeof pm.cvv !== "string" ||
    !pm.card_number ||
    !pm.expiry_month ||
    !pm.expiry_year ||
    !pm.cvv
  ) {
    return corsJson(
      origin,
      env,
      { error: "Valid payment_method with encrypted card data is required" },
      { status: 400 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }

  try {
    const result = await routeToPSP(env as Env, session, pm);

    session.status = result.success ? "completed" : "failed";
    session.order_id = result.order_id || undefined;
    session.processor = result.processor;
    session.merchant_transaction_id =
      result.merchant_transaction_id ?? session.id;
    session.psp_transaction_id = result.psp_transaction_id || undefined;
    session.result_code = result.result_code;
    session.result_description = result.result_description ?? result.error;
    session.completed_at = Date.now();

    await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

    return corsJson(
      origin,
      env,
      {
        status: session.status,
        order_id: result.order_id,
        processor: result.processor,
        merchant_transaction_id: session.merchant_transaction_id,
        psp_transaction_id: result.psp_transaction_id,
        result_code: result.result_code,
        result_description: result.result_description,
        response_body: result.response_body,
        message: result.success
          ? "The onions are on their way!"
          : result.error ?? result.result_description,
      },
      undefined,
      CHECKOUT_COMPLETE_METHODS,
    );
  } catch (error) {
    return corsJson(
      origin,
      env,
      {
        status: "failed",
        error: "Payment processing failed",
        technical_message:
          error instanceof Error
            ? error.message
            : "Unknown payment processing error",
      },
      { status: 502 },
      CHECKOUT_COMPLETE_METHODS,
    );
  }
}
