import { NextRequest, NextResponse } from "next/server";
import { ACP_VERSION_HEADER, requireAcpApiVersion } from "@/lib/acp";
import {
  createCheckoutCapabilities,
  createCheckoutSessionResponse,
  normalizeAgentCapabilities,
  normalizeCheckoutItems,
} from "@/lib/acp-checkout";
import { getProductBySku } from "@/lib/catalog";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv, getSessionsKV } from "@/lib/kv";
import { resolveMerchantCustomerId } from "@/lib/merchant-customers";
import { getMerchantSavedPaymentMethods } from "@/lib/merchant-saved-payment-methods";
import { getProductEffectivePriceCents } from "@/lib/product-pricing";
import type {
  AcpCheckoutSessionCreateRequest,
  CheckoutSession,
  CartItem,
} from "@/lib/types";

export const runtime = "edge";

const CHECKOUT_SESSION_DETAIL_METHODS = ["GET", "PATCH", "OPTIONS"] as const;

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const versionResult = requireAcpApiVersion(
    request,
    origin,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
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
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  const authResponse = requireAcpAuth(
    request,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
  if (authResponse) {
    authResponse.headers.set(ACP_VERSION_HEADER, apiVersion);
    return authResponse;
  }

  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return acpJson(
      { error: "Session storage unavailable" },
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

  return acpJson(
    createCheckoutSessionResponse(JSON.parse(raw), env.ACTIVE_PSP),
    undefined,
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const versionResult = requireAcpApiVersion(
    request,
    origin,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
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
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  const authResponse = requireAcpAuth(
    request,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
  if (authResponse) {
    authResponse.headers.set(ACP_VERSION_HEADER, apiVersion);
    return authResponse;
  }

  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return acpJson(
      { error: "Session storage unavailable" },
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
      { error: "Session is not open" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as AcpCheckoutSessionCreateRequest;
  const items = normalizeCheckoutItems(body.items);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return acpJson(
      { error: "items array is required" },
      { status: 400 },
    );
  }

  const cartItems: CartItem[] = [];
  for (const item of items) {
    const product = getProductBySku(item.sku);
    if (!product) {
      return acpJson(
        { error: `Unknown SKU: ${item.sku}` },
        { status: 400 },
      );
    }
    if (!product.in_stock) {
      return acpJson(
        { error: `Out of stock: ${item.sku}` },
        { status: 400 },
      );
    }
    if (!item.quantity || item.quantity < 1) {
      return acpJson(
        { error: `Invalid quantity for ${item.sku}` },
        { status: 400 },
      );
    }
    cartItems.push({
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      price_cents: getProductEffectivePriceCents(product),
    });
  }

  session.items = cartItems;
  session.amount_total_cents = cartItems.reduce(
    (sum, i) => sum + i.price_cents * i.quantity,
    0,
  );
  session.agent_capabilities = normalizeAgentCapabilities(
    body.capabilities ?? session.agent_capabilities,
  );
  if (Object.prototype.hasOwnProperty.call(body, "buyer")) {
    session.merchant_customer_id = resolveMerchantCustomerId(body.buyer) ?? undefined;
  }
  session.merchant_saved_payment_methods = getMerchantSavedPaymentMethods(
    env.ACTIVE_PSP,
    session.merchant_customer_id,
  );
  session.allowed_payment_methods = [
    "card",
    ...(session.merchant_saved_payment_methods.length > 0
      ? ["merchant_saved_payment"]
      : []),
  ];
  session.capabilities = createCheckoutCapabilities(
    env.ACTIVE_PSP,
    session.merchant_saved_payment_methods,
    session.agent_capabilities,
  );

  await kv.put(session.id, JSON.stringify(session), {
    expirationTtl: 1800,
  });

  return acpJson(
    createCheckoutSessionResponse(session, env.ACTIVE_PSP),
    undefined,
  );
}
