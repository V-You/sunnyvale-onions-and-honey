import { NextRequest, NextResponse } from "next/server";
import { ACP_VERSION_HEADER, requireAcpApiVersion } from "@/lib/acp";
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
    JSON.parse(raw),
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

  const body = (await request.json()) as {
    items?: { sku: string; quantity: number }[];
  };
  const items = body.items;

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

  await kv.put(session.id, JSON.stringify(session), {
    expirationTtl: 1800,
  });

  return acpJson(
    session,
    undefined,
  );
}
