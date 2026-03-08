import { NextRequest, NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog";
import { requireAcpAuth } from "@/lib/acp-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { getEnv, getSessionsKV } from "@/lib/kv";
import { getProductEffectivePriceCents } from "@/lib/product-pricing";
import type { CheckoutSession, CartItem } from "@/lib/types";

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
  const authResponse = requireAcpAuth(
    request,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
  if (authResponse) {
    return authResponse;
  }

  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return corsJson(
      origin,
      env,
      { error: "Session storage unavailable" },
      { status: 503 },
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return corsJson(
      origin,
      env,
      { error: "Session not found" },
      { status: 404 },
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  }

  return corsJson(
    origin,
    env,
    JSON.parse(raw),
    undefined,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const authResponse = requireAcpAuth(
    request,
    env,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
  if (authResponse) {
    return authResponse;
  }

  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return corsJson(
      origin,
      env,
      { error: "Session storage unavailable" },
      { status: 503 },
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return corsJson(
      origin,
      env,
      { error: "Session not found" },
      { status: 404 },
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  }

  const session: CheckoutSession = JSON.parse(raw);
  if (session.status !== "open") {
    return corsJson(
      origin,
      env,
      { error: "Session is not open" },
      { status: 409 },
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
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
      CHECKOUT_SESSION_DETAIL_METHODS,
    );
  }

  const cartItems: CartItem[] = [];
  for (const item of items) {
    const product = getProductBySku(item.sku);
    if (!product) {
      return corsJson(
        origin,
        env,
        { error: `Unknown SKU: ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSION_DETAIL_METHODS,
      );
    }
    if (!product.in_stock) {
      return corsJson(
        origin,
        env,
        { error: `Out of stock: ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSION_DETAIL_METHODS,
      );
    }
    if (!item.quantity || item.quantity < 1) {
      return corsJson(
        origin,
        env,
        { error: `Invalid quantity for ${item.sku}` },
        { status: 400 },
        CHECKOUT_SESSION_DETAIL_METHODS,
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

  await kv.put(session.id, JSON.stringify(session), {
    expirationTtl: 1800,
  });

  return corsJson(
    origin,
    env,
    session,
    undefined,
    CHECKOUT_SESSION_DETAIL_METHODS,
  );
}
