import { NextRequest, NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog";
import type { CheckoutSession, CartItem } from "@/lib/types";
import { getSessionsKV } from "@/lib/kv";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return NextResponse.json(
      { error: "Session storage unavailable" },
      { status: 503 },
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(JSON.parse(raw));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kv = getSessionsKV();
  if (!kv) {
    return NextResponse.json(
      { error: "Session storage unavailable" },
      { status: 503 },
    );
  }

  const raw = await kv.get(id);
  if (!raw) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }

  const session: CheckoutSession = JSON.parse(raw);
  if (session.status !== "open") {
    return NextResponse.json(
      { error: "Session is not open" },
      { status: 409 },
    );
  }

  const body = await request.json();
  const items: { sku: string; quantity: number }[] = body.items;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items array is required" },
      { status: 400 },
    );
  }

  const cartItems: CartItem[] = [];
  for (const item of items) {
    const product = getProductBySku(item.sku);
    if (!product) {
      return NextResponse.json(
        { error: `Unknown SKU: ${item.sku}` },
        { status: 400 },
      );
    }
    if (!product.in_stock) {
      return NextResponse.json(
        { error: `Out of stock: ${item.sku}` },
        { status: 400 },
      );
    }
    if (!item.quantity || item.quantity < 1) {
      return NextResponse.json(
        { error: `Invalid quantity for ${item.sku}` },
        { status: 400 },
      );
    }
    cartItems.push({
      sku: product.sku,
      name: product.name,
      quantity: item.quantity,
      price_cents: product.price_cents,
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

  return NextResponse.json(session);
}
