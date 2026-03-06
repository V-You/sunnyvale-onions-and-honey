import { NextRequest, NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog";
import type { CheckoutSession, CartItem } from "@/lib/types";
import { getSessionsKV } from "@/lib/kv";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const items: { sku: string; quantity: number }[] = body.items;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items array is required" },
      { status: 400 },
    );
  }

  // resolve items against catalog
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

  return NextResponse.json(session, { status: 201 });
}
