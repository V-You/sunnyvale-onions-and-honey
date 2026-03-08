import { NextRequest, NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv, getSessionsKV } from "@/lib/kv";
import { getProductEffectivePriceCents } from "@/lib/product-pricing";
import type { CheckoutSession, CartItem } from "@/lib/types";

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
  const authResponse = requireAcpAuth(request, env, CHECKOUT_SESSIONS_METHODS);
  if (authResponse) {
    return authResponse;
  }

  const body = (await request.json()) as {
    items?: { sku: string; quantity: number }[];
  };
  const items = body.items;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return corsJson(
      origin,
      env,
      { error: "items array is required" },
      { status: 400 },
      CHECKOUT_SESSIONS_METHODS,
    );
  }

  // resolve items against catalog
  const cartItems: CartItem[] = [];
  for (const item of items) {
    const product = getProductBySku(item.sku);
    if (!product) {
      return corsJson(
        origin,
        env,
        { error: `Unknown SKU: ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSIONS_METHODS,
      );
    }
    if (!product.in_stock) {
      return corsJson(
        origin,
        env,
        { error: `Out of stock: ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSIONS_METHODS,
      );
    }
    if (!item.quantity || item.quantity < 1) {
      return corsJson(
        origin,
        env,
        { error: `Invalid quantity for ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSIONS_METHODS,
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

  const session: CheckoutSession = {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: "open",
    items: cartItems,
    amount_total_cents: amountTotal,
    currency: "USD",
    allowed_payment_methods: ["card"],
    created_at: Date.now(),
  };

  const kv = getSessionsKV();
  if (kv) {
    await kv.put(session.id, JSON.stringify(session), {
      expirationTtl: 1800,
    });
  }

  return corsJson(
    origin,
    env,
    session,
    { status: 201 },
    CHECKOUT_SESSIONS_METHODS,
  );
}
