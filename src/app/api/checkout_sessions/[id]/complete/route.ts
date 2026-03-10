import { NextRequest, NextResponse } from "next/server";
import { ACP_VERSION_HEADER, requireAcpApiVersion } from "@/lib/acp";
import {
  createCheckoutCompletionResponse,
  createCheckoutSessionResponse,
  getCheckoutPaymentHandler,
  getHandlerPaymentMethodId,
  isSellerBackedSavedCardHandler,
  isTokenizedCardHandler,
} from "@/lib/acp-checkout";
import {
  createAuthenticationMetadata,
  delegatedTokenRequires3ds,
  handlerSupports3ds,
  isSuccessfulAuthenticationResult,
} from "@/lib/acp-authentication";
import {
  isDelegatedPaymentTokenExpired,
  markDelegatedPaymentTokenUsed,
  readDelegatedPaymentToken,
} from "@/lib/acp-delegate-payment";
import { createAcpError } from "@/lib/acp-errors";
import { storeMerchantVaultRecord } from "@/lib/merchant-vault";
import { routeToPSP } from "@/lib/psp-router";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { resolveMerchantSavedPaymentMethod } from "@/lib/merchant-saved-payment-methods";
import {
  checkRateLimit,
  createRateLimitHeaders,
  getRateLimitIdentifier,
} from "@/lib/rate-limit";
import type {
  AcpCheckoutSessionCompleteRequest,
  AcpTokenCredential,
  CardPaymentMethod,
  CheckoutSession,
  PaymentMethod,
  Env,
  MerchantEvervaultPaymentReference,
  MerchantVaultRecord,
  MerchantSavedPaymentMethod,
  PaymentFlowName,
  SavedEvervaultPaymentMethod,
  StripeSharedPaymentTokenMethod,
} from "@/lib/types";
import { getSessionsKV, getEnv } from "@/lib/kv";

export const runtime = "edge";

const CHECKOUT_COMPLETE_METHODS = ["POST", "OPTIONS"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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

function isEvervaultCiphertextToken(value: string): boolean {
  return value.startsWith("ev:");
}

function createCiphertextPreview(value: string): string {
  if (value.length <= 40) {
    return value;
  }

  return `${value.slice(0, 18)}...${value.slice(-12)}`;
}

function createMerchantEvervaultPaymentReference(
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
): MerchantEvervaultPaymentReference | null {
  if (!isEvervaultCiphertextToken(paymentMethod.card_number)) {
    return null;
  }

  return {
    id: `mev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: paymentMethod.type,
    card_token: paymentMethod.card_number,
    card_token_preview: createCiphertextPreview(paymentMethod.card_number),
    card_holder: paymentMethod.card_holder,
  };
}

function createMerchantVaultRecord(
  session: CheckoutSession,
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
  paymentFlow: PaymentFlowName,
  reference: MerchantEvervaultPaymentReference,
): MerchantVaultRecord {
  return {
    id: reference.id,
    created_at: Date.now(),
    status: session.status === "completed" ? "completed" : "failed",
    source: reference.source,
    checkout_session_id: session.id,
    order_id: session.order_id,
    merchant_transaction_id: session.merchant_transaction_id,
    psp_transaction_id: session.psp_transaction_id,
    merchant_customer_id: session.merchant_customer_id,
    processor: session.processor,
    payment_flow: paymentFlow,
    card_token_preview: reference.card_token_preview,
    ciphertext_record: {
      card_number: paymentMethod.card_number,
      expiry_month: paymentMethod.expiry_month,
      expiry_year: paymentMethod.expiry_year,
      ...(paymentMethod.card_holder
        ? { card_holder: paymentMethod.card_holder }
        : {}),
      ...(paymentMethod.type === "saved_evervault"
        ? { source_reference_id: paymentMethod.saved_payment_id }
        : {}),
    },
    retention: {
      omitted_fields: ["cvv"],
    },
  };
}

function readSptCredential(
  credential: unknown,
): AcpTokenCredential | null {
  if (!isRecord(credential)) {
    return null;
  }

  return credential.type === "spt" && typeof credential.token === "string"
    ? {
        type: "spt",
        token: credential.token,
        allowance: isRecord(credential.allowance)
          ? {
              max_amount:
                typeof credential.allowance.max_amount === "number"
                  ? credential.allowance.max_amount
                  : undefined,
              currency:
                typeof credential.allowance.currency === "string"
                  ? credential.allowance.currency
                  : undefined,
              expires_at:
                typeof credential.allowance.expires_at === "string"
                  ? credential.allowance.expires_at
                  : undefined,
            }
          : undefined,
      }
    : null;
}

function getFlatErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.message === "string" ? payload.message : null;
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
    const completeRateLimit = await checkRateLimit(
      "checkout_session_complete",
      getRateLimitIdentifier(request),
      20,
      60,
    );
    if (completeRateLimit.limited) {
      return acpJson(
        { error: "Too many checkout completion requests. Slow down and try again soon." },
        {
          status: 429,
          headers: createRateLimitHeaders(completeRateLimit),
        },
      );
    }
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
  if (session.status !== "open" && session.status !== "authentication_required") {
    return acpJson(
      { error: "Session not open or already completed" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as AcpCheckoutSessionCompleteRequest;
  const pm = body.payment_method;
  const paymentData = body.payment_data;

  if (session.status === "authentication_required" && !body.authentication_result) {
    return acpJson(
      createAcpError(
        "This checkout session requires issuer authentication. The request must include 'authentication_result'.",
        {
          code: "requires_3ds",
          param: "$.authentication_result",
        },
      ),
      { status: 400 },
    );
  }

  let processorPaymentMethod: PaymentMethod | null = null;
  let paymentFlow: PaymentFlowName = "card";
  let delegatedTokenIdFromContext: string | null = null;

  if (paymentData || session.authentication_requirement) {
    const handlerId = paymentData?.handler_id ?? session.authentication_requirement?.handler_id;
    const instrumentType =
      paymentData?.instrument.type ?? session.authentication_requirement?.instrument_type;
    const delegatedTokenId =
      (paymentData
        ? readSptCredential(paymentData.instrument.credential)?.token
        : null) ?? session.authentication_requirement?.token_id;

    if (!handlerId || !instrumentType || !delegatedTokenId) {
      return acpJson(
        { error: "payment_data is required for handler-based completion" },
        { status: 400 },
      );
    }

    delegatedTokenIdFromContext = delegatedTokenId;

    const handler = getCheckoutPaymentHandler(session, handlerId);
    if (!handler) {
      return acpJson(
        { error: "payment_data.handler_id is not valid for this checkout session" },
        { status: 400 },
      );
    }

    if (
      paymentData?.instrument.handler_id &&
      paymentData.instrument.handler_id !== handlerId
    ) {
      return acpJson(
        { error: "payment_data.instrument.handler_id must match payment_data.handler_id" },
        { status: 400 },
      );
    }

    const delegatedToken = await readDelegatedPaymentToken(delegatedTokenId);
    if (!delegatedToken) {
      return acpJson(
        { error: "Delegated payment token not found" },
        { status: 400 },
      );
    }

    if (delegatedToken.used_at) {
      return acpJson(
        { error: "Delegated payment token has already been used" },
        { status: 409 },
      );
    }

    if (isDelegatedPaymentTokenExpired(delegatedToken)) {
      return acpJson(
        { error: "Delegated payment token has expired" },
        { status: 400 },
      );
    }

    if (delegatedToken.checkout_session_id !== session.id) {
      return acpJson(
        { error: "Delegated payment token does not belong to this checkout session" },
        { status: 400 },
      );
    }

    if (delegatedToken.handler_id !== handlerId) {
      return acpJson(
        { error: "Delegated payment token does not match payment_data.handler_id" },
        { status: 400 },
      );
    }

    if (
      delegatedToken.merchant_customer_id &&
      delegatedToken.merchant_customer_id !== session.merchant_customer_id
    ) {
      return acpJson(
        { error: "Delegated payment token does not belong to the current merchant customer" },
        { status: 400 },
      );
    }

    if (delegatedToken.allowance.max_amount < session.amount_total_cents) {
      return acpJson(
        { error: "Delegated payment token allowance is lower than the checkout total" },
        { status: 400 },
      );
    }

    if (
      delegatedToken.allowance.currency.toLowerCase() !==
      session.currency.toLowerCase()
    ) {
      return acpJson(
        { error: "Delegated payment token currency does not match the checkout session" },
        { status: 400 },
      );
    }

    if (isTokenizedCardHandler(handler)) {
      if (instrumentType !== "card") {
        return acpJson(
          { error: "Tokenized card handler requires instrument.type=card" },
          { status: 400 },
        );
      }

      if (delegatedToken.payment_method.type !== "card") {
        return acpJson(
          { error: "Delegated payment token does not contain card data" },
          { status: 400 },
        );
      }

      processorPaymentMethod = delegatedToken.payment_method;
      paymentFlow = "card";
    } else if (isSellerBackedSavedCardHandler(handler)) {
      if (instrumentType !== "seller_backed_saved_card") {
        return acpJson(
          { error: "Seller-backed saved card handler requires instrument.type=seller_backed_saved_card" },
          { status: 400 },
        );
      }

      const paymentMethodId =
        delegatedToken.payment_method.type === "seller_backed_saved_card"
          ? delegatedToken.payment_method.payment_method_id
          : getHandlerPaymentMethodId(handler);

      if (!paymentMethodId) {
        return acpJson(
          { error: "Unable to resolve merchant saved payment method for handler" },
          { status: 400 },
        );
      }

      const resolvedPaymentMethod = resolveMerchantSavedPaymentMethod(
        paymentMethodId,
        session.merchant_customer_id,
      );
      if (!resolvedPaymentMethod) {
        return acpJson(
          { error: "Unable to resolve seller-backed saved card to processor payment data" },
          { status: 400 },
        );
      }

      processorPaymentMethod = resolvedPaymentMethod;
      paymentFlow = "merchant_saved_payment";
    } else {
      return acpJson(
        { error: "Unsupported payment handler for checkout completion" },
        { status: 400 },
      );
    }

    if (
      session.status !== "authentication_required" &&
      handlerSupports3ds(handler) &&
      delegatedTokenRequires3ds(delegatedToken.metadata)
    ) {
      session.status = "authentication_required";
      session.authentication_metadata = createAuthenticationMetadata(
        session,
        handler,
      );
      session.authentication_requirement = {
        handler_id: handler.id,
        token_id: delegatedToken.id,
        instrument_type: instrumentType,
        payment_flow: paymentFlow,
      };

      await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

      return acpJson(
        createCheckoutSessionResponse(session, env.ACTIVE_PSP),
        undefined,
      );
    }

    if (
      session.status === "authentication_required" &&
      !isSuccessfulAuthenticationResult(body.authentication_result)
    ) {
      return acpJson(
        createAcpError(
          "Issuer authentication did not succeed. Provide a successful authentication_result before completing checkout.",
          {
            code: "authentication_failed",
            param: "$.authentication_result",
          },
        ),
        { status: 400 },
      );
    }

    session.authentication_metadata = undefined;
    session.authentication_requirement = undefined;
    await markDelegatedPaymentTokenUsed(delegatedToken);
  } else {
    if (!pm) {
      return acpJson(
        { error: "payment_data or payment_method is required" },
        { status: 400 },
      );
    }

    processorPaymentMethod = pm;
    paymentFlow = pm.type;

    if (isMerchantSavedPaymentMethod(pm)) {
      const resolvedPaymentMethod = resolveMerchantSavedPaymentMethod(
        pm.payment_method_id,
        session.merchant_customer_id,
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
  }

  if (!processorPaymentMethod) {
    return acpJson(
      { error: "Unable to resolve payment method for checkout completion" },
      { status: 400 },
    );
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

  const merchantEvervaultPayment = isEncryptedCardPaymentMethod(
    processorPaymentMethod,
  )
    ? createMerchantEvervaultPaymentReference(processorPaymentMethod)
    : null;

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
    session.merchant_evervault_payment = merchantEvervaultPayment ?? undefined;

    if (
      merchantEvervaultPayment &&
      isEncryptedCardPaymentMethod(processorPaymentMethod)
    ) {
      await storeMerchantVaultRecord(
        createMerchantVaultRecord(
          session,
          processorPaymentMethod,
          paymentFlow,
          merchantEvervaultPayment,
        ),
      );
    }

    await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

    if (!result.success) {
      const failurePayload = {
        ...createCheckoutSessionResponse(session, env.ACTIVE_PSP),
        amount_total_cents: session.amount_total_cents,
        completed_at: session.completed_at,
        processor: result.processor,
        payment_flow: result.payment_flow,
        payment_metrics: result.payment_metrics,
        merchant_transaction_id: session.merchant_transaction_id,
        psp_transaction_id: result.psp_transaction_id,
        result_code: result.result_code,
        result_description: result.result_description,
        response_body: result.response_body,
        message: result.error ?? result.result_description,
      };

      return acpJson(
        {
          ...failurePayload,
          messages:
            failurePayload.messages.length > 0
              ? failurePayload.messages
              : [
                  {
                    type: "error",
                    code: "payment_declined",
                    severity: "error",
                    resolution: "recoverable",
                    content_type: "plain",
                    content:
                      result.error ??
                      result.result_description ??
                      "Payment authorization failed.",
                  },
                ],
        },
        undefined,
      );
    }

    const acpCompletionResponse = createCheckoutCompletionResponse(
      session,
      env.ACTIVE_PSP,
      request.nextUrl.origin,
      body.buyer,
    );

    return acpJson(
      {
        ...acpCompletionResponse,
        status: session.status,
        order_id: acpCompletionResponse.order.id,
        amount_total_cents: session.amount_total_cents,
        currency: acpCompletionResponse.currency,
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
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown payment processing error";

    return acpJson(
      {
        status: "failed",
        type: "processing_error",
        code: "processor_failure",
        message: errorMessage,
        error: "Payment processing failed",
        technical_message: errorMessage,
      },
      { status: 502 },
    );
  }
}
