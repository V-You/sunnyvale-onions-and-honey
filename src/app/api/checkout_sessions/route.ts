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
import { getMerchantSavedPaymentMethods } from "@/lib/merchant-saved-payment-methods";
import { getProductEffectivePriceCents } from "@/lib/product-pricing";
import type {
  AcpCheckoutSessionCreateRequest,
  CheckoutSession,
  CartItem,
} from "@/lib/types";

export const runtime = "edge";

const CHECKOUT_SESSIONS_METHODS = ["POST", "OPTIONS"] as const;

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    CHECKOUT_SESSIONS_METHODS,
  );
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const versionResult = requireAcpApiVersion(
    request,
    origin,
    env,
    CHECKOUT_SESSIONS_METHODS,
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
      CHECKOUT_SESSIONS_METHODS,
    );
  const authResponse = requireAcpAuth(request, env, CHECKOUT_SESSIONS_METHODS);
  if (authResponse) {
    authResponse.headers.set(ACP_VERSION_HEADER, apiVersion);
    return authResponse;
  }

  const body = (await request.json()) as AcpCheckoutSessionCreateRequest;
  const items = normalizeCheckoutItems(body.items);
  const agentCapabilities = normalizeAgentCapabilities(body.capabilities);

  if (!items || !Array.isArray(items) || items.length === 0) {
    return acpJson(
      { error: "items array is required" },
      { status: 400 },
    );
  }

  // resolve items against catalog
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

  const amountTotal = cartItems.reduce(
    (sum, i) => sum + i.price_cents * i.quantity,
    0,
  );
  const merchantSavedPaymentMethods = getMerchantSavedPaymentMethods(
    env.ACTIVE_PSP,
  );
  const allowedPaymentMethods = [
    "card",
    ...(merchantSavedPaymentMethods.length > 0
      ? ["merchant_saved_payment"]
      : []),
  ];
  const capabilities = createCheckoutCapabilities(
    env.ACTIVE_PSP,
    merchantSavedPaymentMethods,
    agentCapabilities,
  );

  const session: CheckoutSession = {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "open",
    items: cartItems,
    amount_total_cents: amountTotal,
    currency: "USD",
    allowed_payment_methods: allowedPaymentMethods,
    capabilities,
    agent_capabilities: agentCapabilities,
    merchant_saved_payment_methods: merchantSavedPaymentMethods,
    created_at: Date.now(),
  };

  const kv = getSessionsKV();
  if (kv) {
    await kv.put(session.id, JSON.stringify(session), {
      expirationTtl: 1800,
    });
  }

  return acpJson(
    createCheckoutSessionResponse(session, env.ACTIVE_PSP),
    { status: 201 },
  );
}
