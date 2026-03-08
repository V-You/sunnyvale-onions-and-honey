import { NextRequest, NextResponse } from "next/server";
import { ACP_VERSION_HEADER, requireAcpApiVersion } from "@/lib/acp";
import { routeToPSP } from "@/lib/psp-router";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { resolveMerchantSavedPaymentMethod } from "@/lib/merchant-saved-payment-methods";
import type {
  CardPaymentMethod,
  CheckoutSession,
  PaymentMethod,
  Env,
  MerchantSavedPaymentMethod,
  PaymentFlowName,
  SavedEvervaultPaymentMethod,
  StripeSharedPaymentTokenMethod,
} from "@/lib/types";
import { getSessionsKV, getEnv } from "@/lib/kv";

export const runtime = "edge";

const CHECKOUT_COMPLETE_METHODS = ["POST", "OPTIONS"] as const;

function isEncryptedCardPaymentMethod(
  paymentMethod: PaymentMethod,
): paymentMethod is CardPaymentMethod | SavedEvervaultPaymentMethod {
  return paymentMethod.type === "card" || paymentMethod.type === "saved_evervault";
}

function isMerchantSavedPaymentMethod(
  paymentMethod: PaymentMethod,
): paymentMethod is MerchantSavedPaymentMethod {
  return paymentMethod.type === "merchant_saved_payment";
}

function hasValidEncryptedCardData(
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
) {
  return (
    typeof paymentMethod.card_number === "string" &&
    typeof paymentMethod.expiry_month === "string" &&
    typeof paymentMethod.expiry_year === "string" &&
    typeof paymentMethod.cvv === "string" &&
    paymentMethod.card_number.length > 0 &&
    paymentMethod.expiry_month.length > 0 &&
    paymentMethod.expiry_year.length > 0 &&
    paymentMethod.cvv.length > 0
  );
}

function hasValidDelegatedStripeToken(
  paymentMethod: StripeSharedPaymentTokenMethod,
) {
  return Boolean(
    paymentMethod.payment_method_id || paymentMethod.confirmation_token,
  );
}

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
  const versionResult = requireAcpApiVersion(
    request,
    origin,
    env,
    CHECKOUT_COMPLETE_METHODS,
  );
  if (versionResult.response) {
    return versionResult.response;
  }

  const apiVersion = versionResult.version;
  const acpJson = (
    body: unknown,
    init?: { status?: number; headers?: HeadersInit },
  ) =>
    corsJson(
      origin,
      env,
      body,
      {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          [ACP_VERSION_HEADER]: apiVersion,
        },
      },
      CHECKOUT_COMPLETE_METHODS,
    );
  const authResponse = requireAcpAuth(request, env, CHECKOUT_COMPLETE_METHODS);
  if (authResponse) {
    authResponse.headers.set(ACP_VERSION_HEADER, apiVersion);
    return authResponse;
  }

  const { id } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return acpJson(
      { error: "Idempotency-Key header required" },
      { status: 400 },
    );
  }

  const kv = getSessionsKV();
  if (!kv || !env) {
    return acpJson(
      { error: "Service unavailable" },
      { status: 503 },
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return acpJson(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  const session: CheckoutSession = JSON.parse(raw);
  if (session.status !== "open") {
    return acpJson(
      { error: "Session not open or already completed" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as { payment_method?: PaymentMethod };
  const pm = body.payment_method;

  if (!pm) {
    return acpJson(
      { error: "payment_method is required" },
      { status: 400 },
    );
  }

  let processorPaymentMethod: PaymentMethod = pm;
  let paymentFlow: PaymentFlowName = pm.type;

  if (isMerchantSavedPaymentMethod(pm)) {
    const resolvedPaymentMethod = resolveMerchantSavedPaymentMethod(
      pm.payment_method_id,
    );

    if (!resolvedPaymentMethod) {
      return acpJson(
        {
          error:
            "Unknown merchant_saved_payment id. Request a fresh checkout session and use one of the advertised merchant_saved_payment_methods.",
        },
        { status: 400 },
      );
    }

    processorPaymentMethod = resolvedPaymentMethod;
    paymentFlow = "merchant_saved_payment";
  }

  if (
    isEncryptedCardPaymentMethod(processorPaymentMethod) &&
    !hasValidEncryptedCardData(processorPaymentMethod)
  ) {
    return acpJson(
      {
        error:
          "Encrypted card payment methods require card_number, expiry_month, expiry_year, and cvv",
      },
      { status: 400 },
    );
  }

  if (
    processorPaymentMethod.type === "stripe_spt" &&
    !hasValidDelegatedStripeToken(processorPaymentMethod)
  ) {
    return acpJson(
      {
        error:
          "Delegated Stripe payments require payment_method_id or confirmation_token",
      },
      { status: 400 },
    );
  }

  if (
    !isEncryptedCardPaymentMethod(processorPaymentMethod) &&
    processorPaymentMethod.type !== "stripe_spt"
  ) {
    return acpJson(
      {
        error:
          "Unsupported payment_method type. Use card, merchant_saved_payment, saved_evervault, or stripe_spt.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await routeToPSP(
      env as Env,
      session,
      processorPaymentMethod,
    );
    result.payment_flow = paymentFlow;

    session.status = result.success ? "completed" : "failed";
    session.order_id = result.order_id || undefined;
    session.processor = result.processor;
    session.merchant_transaction_id =
      result.merchant_transaction_id ?? session.id;
    session.psp_transaction_id = result.psp_transaction_id || undefined;
    session.result_code = result.result_code;
    session.result_description = result.result_description ?? result.error;
    session.completed_at = Date.now();
    session.payment_metrics = result.payment_metrics;

    await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

    return acpJson(
      {
        status: session.status,
        order_id: result.order_id,
        amount_total_cents: session.amount_total_cents,
        currency: session.currency,
        completed_at: session.completed_at,
        processor: result.processor,
        payment_flow: result.payment_flow,
        payment_metrics: result.payment_metrics,
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
    );
  } catch (error) {
    return acpJson(
      {
        status: "failed",
        error: "Payment processing failed",
        technical_message:
          error instanceof Error
            ? error.message
            : "Unknown payment processing error",
      },
      { status: 502 },
    );
  }
}
