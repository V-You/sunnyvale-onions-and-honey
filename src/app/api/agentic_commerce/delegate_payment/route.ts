import { NextRequest } from "next/server";
import { ACP_VERSION_HEADER, requireAcpApiVersion } from "@/lib/acp";
import {
  getCheckoutPaymentHandler,
  getHandlerMerchantId,
  getHandlerPaymentMethodId,
  isSellerBackedSavedCardHandler,
  isTokenizedCardHandler,
} from "@/lib/acp-checkout";
import { handlerSupports3ds } from "@/lib/acp-authentication";
import { requireAcpAuth } from "@/lib/acp-auth";
import {
  normalizeDelegateCardMethod,
  normalizeStringMap,
  storeDelegatedPaymentToken,
} from "@/lib/acp-delegate-payment";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv, getSessionsKV } from "@/lib/kv";
import type {
  AcpDelegatePaymentRequest,
  AcpDelegatePaymentResponse,
  CheckoutSession,
} from "@/lib/types";

export const runtime = "edge";

const DELEGATE_PAYMENT_METHODS = ["POST", "OPTIONS"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasValidRiskSignals(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    DELEGATE_PAYMENT_METHODS,
  );
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const versionResult = requireAcpApiVersion(
    request,
    origin,
    env,
    DELEGATE_PAYMENT_METHODS,
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
      DELEGATE_PAYMENT_METHODS,
    );

  const authResponse = requireAcpAuth(request, env, DELEGATE_PAYMENT_METHODS);
  if (authResponse) {
    authResponse.headers.set(ACP_VERSION_HEADER, apiVersion);
    return authResponse;
  }

  const body = (await request.json()) as AcpDelegatePaymentRequest;
  const normalizedMetadata = normalizeStringMap(body.metadata);


  if (!body || typeof body.handler_id !== "string" || body.handler_id.length === 0) {
    return acpJson(
      { error: "handler_id is required" },
      { status: 400 },
    );
  }

  if (!body.allowance || !isRecord(body.allowance)) {
    return acpJson(
      { error: "allowance is required" },
      { status: 400 },
    );
  }

  if (!body.payment_method || !isRecord(body.payment_method)) {
    return acpJson(
      { error: "payment_method is required" },
      { status: 400 },
    );
  }

  if (!hasValidRiskSignals(body.risk_signals)) {
    return acpJson(
      { error: "risk_signals must contain at least one entry" },
      { status: 400 },
    );
  }

  if (!isRecord(body.metadata)) {
    return acpJson(
      { error: "metadata is required" },
      { status: 400 },
    );
  }

  if (
    typeof body.allowance.checkout_session_id !== "string" ||
    body.allowance.checkout_session_id.length === 0
  ) {
    return acpJson(
      { error: "allowance.checkout_session_id is required" },
      { status: 400 },
    );
  }

  if (
    typeof body.allowance.merchant_id !== "string" ||
    body.allowance.merchant_id.length === 0
  ) {
    return acpJson(
      { error: "allowance.merchant_id is required" },
      { status: 400 },
    );
  }

  if (
    body.allowance.reason !== "one_time" ||
    !Number.isFinite(body.allowance.max_amount) ||
    body.allowance.max_amount < 1 ||
    typeof body.allowance.currency !== "string" ||
    body.allowance.currency.length === 0 ||
    typeof body.allowance.expires_at !== "string" ||
    body.allowance.expires_at.length === 0
  ) {
    return acpJson(
      { error: "allowance must include reason, max_amount, currency, and expires_at" },
      { status: 400 },
    );
  }

  const expiresAt = Date.parse(body.allowance.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return acpJson(
      { error: "allowance.expires_at must be a future ISO-8601 timestamp" },
      { status: 400 },
    );
  }

  const kv = getSessionsKV();
  const rawSession = await kv.get(body.allowance.checkout_session_id);
  if (!rawSession) {
    return acpJson(
      { error: "Checkout session not found" },
      { status: 404 },
    );
  }

  const session: CheckoutSession = JSON.parse(rawSession);
  const handler = getCheckoutPaymentHandler(session, body.handler_id);
  if (!handler) {
    return acpJson(
      { error: "Unknown handler_id for this checkout session" },
      { status: 400 },
    );
  }

  if (!handler.requires_delegate_payment) {
    return acpJson(
      { error: "Selected handler does not support delegated payment" },
      { status: 400 },
    );
  }

  const handlerMerchantId = getHandlerMerchantId(handler);
  if (!handlerMerchantId || handlerMerchantId !== body.allowance.merchant_id) {
    return acpJson(
      { error: "allowance.merchant_id does not match handler configuration" },
      { status: 400 },
    );
  }

  if (body.allowance.checkout_session_id !== session.id) {
    return acpJson(
      { error: "allowance.checkout_session_id does not match the target session" },
      { status: 400 },
    );
  }

  if (body.allowance.currency.toLowerCase() !== session.currency.toLowerCase()) {
    return acpJson(
      { error: "allowance.currency must match the checkout session currency" },
      { status: 400 },
    );
  }

  if (body.allowance.max_amount < session.amount_total_cents) {
    return acpJson(
      { error: "allowance.max_amount must be at least the checkout total" },
      { status: 400 },
    );
  }

  let storedPaymentMethod;
  const shouldRequire3ds =
    handlerSupports3ds(handler) &&
    (normalizedMetadata.force_3ds === "true" ||
      body.risk_signals.some(
        (signal) =>
          signal.type === "3ds_required" ||
          (typeof signal.score === "number" && signal.score >= 80),
      ));

  if (isTokenizedCardHandler(handler)) {
    if (body.payment_method.type !== "card") {
      return acpJson(
        { error: "Tokenized card handler requires payment_method.type=card" },
        { status: 400 },
      );
    }

    const normalizedCard = normalizeDelegateCardMethod(body.payment_method);
    if (!normalizedCard) {
      return acpJson(
        { error: "Card delegated payment requires number, exp_month, exp_year, and cvc" },
        { status: 400 },
      );
    }

    storedPaymentMethod = normalizedCard;
  } else if (isSellerBackedSavedCardHandler(handler)) {
    if (body.payment_method.type !== "seller_backed_saved_card") {
      return acpJson(
        { error: "Seller-backed saved card handler requires payment_method.type=seller_backed_saved_card" },
        { status: 400 },
      );
    }

    const handlerPaymentMethodId = getHandlerPaymentMethodId(handler);
    const requestedPaymentMethodId = body.payment_method.payment_method_id;

    if (
      typeof requestedPaymentMethodId === "string" &&
      requestedPaymentMethodId.length > 0 &&
      requestedPaymentMethodId !== handlerPaymentMethodId
    ) {
      return acpJson(
        { error: "payment_method.payment_method_id does not match handler configuration" },
        { status: 400 },
      );
    }

    if (!handlerPaymentMethodId) {
      return acpJson(
        { error: "Handler does not define a seller payment method identifier" },
        { status: 400 },
      );
    }

    storedPaymentMethod = {
      type: "seller_backed_saved_card" as const,
      payment_method_id: handlerPaymentMethodId,
    };
  } else {
    return acpJson(
      { error: "Unsupported delegated payment handler" },
      { status: 400 },
    );
  }

  const token = await storeDelegatedPaymentToken({
    handler_id: handler.id,
    checkout_session_id: session.id,
    merchant_id: body.allowance.merchant_id,
    merchant_customer_id: session.merchant_customer_id,
    allowance: {
      ...body.allowance,
      currency: body.allowance.currency.toLowerCase(),
    },
    payment_method: storedPaymentMethod,
    metadata: {
      ...normalizedMetadata,
      requires_3ds: shouldRequire3ds ? "true" : "false",
    },
  });

  const response: AcpDelegatePaymentResponse = {
    id: token.id,
    created: new Date(token.created_at).toISOString(),
    metadata: {
      source: "agent_checkout",
      merchant_id: token.merchant_id,
      handler_id: token.handler_id,
      checkout_session_id: token.checkout_session_id,
      ...token.metadata,
    },
  };

  return acpJson(response, { status: 201 });
}