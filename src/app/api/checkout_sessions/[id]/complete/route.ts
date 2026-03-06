import { NextRequest, NextResponse } from "next/server";
import { routeToPSP } from "@/lib/psp-router";
import type { CheckoutSession, PaymentMethod, Env } from "@/lib/types";
import { getSessionsKV, getEnv } from "@/lib/kv";

export const runtime = "edge";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "Idempotency-Key header required" },
      { status: 400 },
    );
  }

  const kv = getSessionsKV();
  const env = getEnv();
  if (!kv || !env) {
    return NextResponse.json(
      { error: "Service unavailable" },
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
      { error: "Session not open or already completed" },
      { status: 409 },
    );
  }

  const body = await request.json();
  const pm: PaymentMethod = body.payment_method;

  if (
    !pm ||
    pm.type !== "card" ||
    typeof pm.card_number !== "string" ||
    typeof pm.expiry_month !== "string" ||
    typeof pm.expiry_year !== "string" ||
    typeof pm.cvv !== "string" ||
    !pm.card_number ||
    !pm.expiry_month ||
    !pm.expiry_year ||
    !pm.cvv
  ) {
    return NextResponse.json(
      { error: "Valid payment_method with encrypted card data is required" },
      { status: 400 },
    );
  }

  const result = await routeToPSP(env as Env, session, pm);

  session.status = result.success ? "completed" : "failed";
  await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

  return NextResponse.json({
    status: session.status,
    order_id: result.order_id,
    psp_transaction_id: result.psp_transaction_id,
    message: result.success
      ? "The onions are on their way!"
      : result.error,
  });
}
