// PayRam showcase - backend adapter for creating a headless payment intent.
// The frontend (CheckoutForm) POSTs cart details here, this route calls the
// PayRam Operator, and returns a { payment_url } the browser redirects to.
//
// Switching showcase: no browser SDK is involved. The Evervault showcase
// collects card data in-browser via EvervaultProvider + Card and sends an
// encrypted payload to /api/checkout_sessions/[id]/complete instead.

import { NextRequest } from "next/server";
import { corsJson, corsPreflight } from "@/lib/cors";
import { requireAcpAuth } from "@/lib/acp-auth";
import { getEnv } from "@/lib/kv";

export const runtime = "edge";

const PAYRAM_CREATE_PAYMENT_METHODS = ["POST", "OPTIONS"] as const;

interface PayRamCreatePaymentRequest {
  // amount in smallest currency unit (cents for USD)
  amount_cents: number;
  // fiat currency of the charge - defaults to PAYRAM_DEFAULT_CURRENCY env var
  currency?: string;
  // destination chain - defaults to PAYRAM_DEFAULT_CHAIN env var
  chain?: string;
  // "UTM for money" reference tag carried on-chain and in webhook payloads
  reference_id: string;
  // arbitrary key/value pairs for operator reconciliation
  metadata?: Record<string, string>;
}

interface PayRamOperatorPayload {
  amount: number;
  currency: string;
  chain: string;
  merchant_id: string;
  reference_id: string;
  metadata?: Record<string, string>;
}

interface PayRamCreatePaymentResponse {
  payment_url?: string;
  checkout_url?: string;
  url?: string;
  [key: string]: unknown;
}

export async function OPTIONS(request: NextRequest) {
  const env = getEnv();
  return corsPreflight(
    request.headers.get("origin"),
    env,
    PAYRAM_CREATE_PAYMENT_METHODS,
  );
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const origin = request.headers.get("origin");

  const acpJson = (body: unknown, init?: { status?: number }) =>
    corsJson(origin, env, body, init, PAYRAM_CREATE_PAYMENT_METHODS);

  // reuse the existing ACP bearer key so no new browser credentials are needed
  const authResponse = requireAcpAuth(
    request,
    env,
    PAYRAM_CREATE_PAYMENT_METHODS,
  );
  if (authResponse) {
    return authResponse;
  }

  const operatorBaseUrl = env.PAYRAM_OPERATOR_BASE_URL;
  const merchantId = env.PAYRAM_MERCHANT_ID;
  const merchantKey = env.PAYRAM_MERCHANT_KEY;

  if (!operatorBaseUrl || !merchantId || !merchantKey) {
    return acpJson(
      {
        error:
          "PayRam is not configured on this server. Set PAYRAM_OPERATOR_BASE_URL, PAYRAM_MERCHANT_ID, and PAYRAM_MERCHANT_KEY.",
      },
      { status: 503 },
    );
  }

  let body: PayRamCreatePaymentRequest;
  try {
    body = (await request.json()) as PayRamCreatePaymentRequest;
  } catch {
    return acpJson({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!body.amount_cents || body.amount_cents < 1) {
    return acpJson(
      { error: "amount_cents is required and must be a positive integer" },
      { status: 400 },
    );
  }
  if (!body.reference_id || typeof body.reference_id !== "string") {
    return acpJson({ error: "reference_id is required" }, { status: 400 });
  }

  // PAYRAM_DEFAULT_CHAIN=84532 (Base Sepolia testnet) and
  // PAYRAM_DEFAULT_CURRENCY=USD are configured in Cloudflare env.
  const chain = body.chain ?? env.PAYRAM_DEFAULT_CHAIN ?? "84532";
  const currency = body.currency ?? env.PAYRAM_DEFAULT_CURRENCY ?? "USD";
  // PayRam API expects a decimal amount, not cents
  const amount = body.amount_cents / 100;

  const operatorPayload: PayRamOperatorPayload = {
    amount,
    currency,
    chain,
    merchant_id: merchantId,
    reference_id: body.reference_id,
    ...(body.metadata ? { metadata: body.metadata } : {}),
  };

  let operatorResponse: Response;
  try {
    operatorResponse = await fetch(
      `${operatorBaseUrl.replace(/\/$/, "")}/api/v3/payments/create_payment`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${merchantKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(operatorPayload),
      },
    );
  } catch (err) {
    return acpJson(
      {
        error:
          "PayRam Operator request failed before a response was received",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const responseText = await operatorResponse.text();
  let paymentData: unknown;
  try {
    paymentData = JSON.parse(responseText);
  } catch {
    paymentData = responseText;
  }

  if (!operatorResponse.ok) {
    return acpJson(
      {
        error: `PayRam Operator returned HTTP ${operatorResponse.status}`,
        detail: paymentData,
      },
      { status: 502 },
    );
  }

  // Extract the hosted checkout URL from the PayRam Operator response.
  // The operator response shape may use payment_url, checkout_url, or url.
  const typed = paymentData as PayRamCreatePaymentResponse;
  const redirectUrl =
    typed.payment_url ?? typed.checkout_url ?? typed.url ?? null;

  if (!redirectUrl || typeof redirectUrl !== "string") {
    // Return the full operator payload so the developer can inspect it;
    // the frontend will surface this as a technical response.
    return acpJson(
      {
        error:
          "PayRam Operator did not return a hosted checkout URL. Check payment_url, checkout_url, or url fields in the operator response.",
        operator_response: paymentData,
      },
      { status: 502 },
    );
  }

  return acpJson({ payment_url: redirectUrl }, { status: 200 });
}
