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

  const body = (await request.json()) as { payment_method?: PaymentMethod };
  const pm = body.payment_method;

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

  try {
    const result = await routeToPSP(env as Env, session, pm);

    session.status = result.success ? "completed" : "failed";
    session.order_id = result.order_id || undefined;
    session.processor = result.processor;
    session.merchant_transaction_id =
      result.merchant_transaction_id ?? session.id;
    session.psp_transaction_id = result.psp_transaction_id || undefined;
    session.result_code = result.result_code;
    session.result_description = result.result_description ?? result.error;
    session.completed_at = Date.now();

    await kv.put(id, JSON.stringify(session), { expirationTtl: 1800 });

    return NextResponse.json({
      status: session.status,
      order_id: result.order_id,
      processor: result.processor,
      merchant_transaction_id: session.merchant_transaction_id,
      psp_transaction_id: result.psp_transaction_id,
      result_code: result.result_code,
      result_description: result.result_description,
      response_body: result.response_body,
      message: result.success
        ? "The onions are on their way!"
        : result.error ?? result.result_description,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: "Payment processing failed",
        technical_message:
          error instanceof Error
            ? error.message
            : "Unknown payment processing error",
      },
      { status: 502 },
    );
  }
}
