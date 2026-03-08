import type {
  CheckoutSession,
  PaymentMethod,
  PSPResult,
  Env,
} from "./types";

const ACI_SUCCESS_CODE_REGEX =
  /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.1(?:10|20))/;

async function readGatewayResponse(response: Response): Promise<{
  body: unknown;
  json: Record<string, unknown> | null;
}> {
  const text = await response.text();

  if (!text) {
    return {
      body: null,
      json: null,
    };
  }

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return {
      body: json,
      json,
    };
  } catch {
    return {
      body: text,
      json: null,
    };
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const maybeError = body as {
      error?: { message?: string };
      message?: string;
      detail?: string;
      title?: string;
    };

    if (maybeError.error?.message) {
      return maybeError.error.message;
    }
    if (maybeError.message) {
      return maybeError.message;
    }
    if (maybeError.detail) {
      return maybeError.detail;
    }
    if (maybeError.title) {
      return maybeError.title;
    }
  }

  return fallback;
}

export async function routeToPSP(
  env: Env,
  session: CheckoutSession,
  paymentMethod: PaymentMethod,
): Promise<PSPResult> {
  const psp = env.ACTIVE_PSP || "aci";

  if (psp === "stripe") {
    return routeToStripe(env, session, paymentMethod);
  }
  return routeToACI(env, session, paymentMethod);
}

async function routeToACI(
  env: Env,
  session: CheckoutSession,
  pm: PaymentMethod,
): Promise<PSPResult> {
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;
  const params = new URLSearchParams();
  params.append("entityId", env.ACI_ENTITY_ID);
  params.append("amount", (session.amount_total_cents / 100).toFixed(2));
  params.append("currency", session.currency);
  params.append("merchantTransactionId", merchantTransactionId);
  params.append("paymentType", "DB");
  params.append("card.number", pm.card_number); // ev:ct:xxx -- relay decrypts
  params.append("card.expiryMonth", pm.expiry_month);
  params.append("card.expiryYear", pm.expiry_year);
  params.append("card.cvv", pm.cvv);

  let response: Response;

  try {
    response = await fetch(`https://${env.ACI_RELAY_DOMAIN}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ACI_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "aci",
      merchant_transaction_id: merchantTransactionId,
      error:
        error instanceof Error
          ? error.message
          : "ACI relay request failed before a response was received",
    };
  }

  const { body, json } = await readGatewayResponse(response);
  const result = json?.result as { code?: string; description?: string } | undefined;
  const resultCode = result?.code;
  const resultDescription = result?.description;
  const paymentId = typeof json?.id === "string" ? json.id : "";
  const success =
    response.ok && !!resultCode && ACI_SUCCESS_CODE_REGEX.test(resultCode);

  return {
    success,
    order_id: paymentId,
    psp_transaction_id: paymentId,
    processor: "aci",
    merchant_transaction_id: merchantTransactionId,
    result_code: resultCode,
    result_description: resultDescription,
    response_body: body,
    error: success
      ? undefined
      : resultDescription ??
        getErrorMessage(
          body,
          `ACI request failed with HTTP ${response.status}`,
        ),
  };
}

async function routeToStripe(
  env: Env,
  session: CheckoutSession,
  pm: PaymentMethod,
): Promise<PSPResult> {
  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;

  // step 1: create a PaymentMethod with encrypted card data
  const pmParams = new URLSearchParams();
  pmParams.append("type", "card");
  pmParams.append("card[number]", pm.card_number); // ev:ct:xxx
  pmParams.append("card[exp_month]", pm.expiry_month);
  pmParams.append("card[exp_year]", pm.expiry_year);
  pmParams.append("card[cvc]", pm.cvv);

  let paymentMethodResponse: Response;

  try {
    paymentMethodResponse = await fetch(
      `https://${env.STRIPE_RELAY_DOMAIN}/v1/payment_methods`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: pmParams.toString(),
      },
    );
  } catch (error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "stripe",
      merchant_transaction_id: merchantTransactionId,
      error:
        error instanceof Error
          ? error.message
          : "Stripe relay request failed before a response was received",
    };
  }

  const paymentMethodParsed = await readGatewayResponse(paymentMethodResponse);
  const pmData = paymentMethodParsed.json;

  if (!pmData || paymentMethodResponse.status >= 400 || pmData.error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "stripe",
      merchant_transaction_id: merchantTransactionId,
      response_body: paymentMethodParsed.body,
      error: getErrorMessage(
        paymentMethodParsed.body,
        `Stripe payment method creation failed with HTTP ${paymentMethodResponse.status}`,
      ),
    };
  }

  // step 2: create and confirm a PaymentIntent
  const piParams = new URLSearchParams();
  piParams.append("amount", String(session.amount_total_cents));
  piParams.append("currency", session.currency.toLowerCase());
  piParams.append("payment_method", pmData.id as string);
  piParams.append("confirm", "true");
  piParams.append("metadata[merchantTransactionId]", merchantTransactionId);

  let paymentIntentResponse: Response;

  try {
    paymentIntentResponse = await fetch(
      `https://${env.STRIPE_RELAY_DOMAIN}/v1/payment_intents`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: piParams.toString(),
      },
    );
  } catch (error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "stripe",
      merchant_transaction_id: merchantTransactionId,
      error:
        error instanceof Error
          ? error.message
          : "Stripe payment intent request failed before a response was received",
    };
  }

  const paymentIntentParsed = await readGatewayResponse(paymentIntentResponse);
  const piData = paymentIntentParsed.json;
  const success =
    paymentIntentResponse.ok && piData?.status === "succeeded";
  const piError = piData?.last_payment_error as { message?: string } | undefined;
  const topError = piData?.error as { message?: string } | undefined;
  const paymentIntentId = typeof piData?.id === "string" ? piData.id : "";

  return {
    success,
    order_id: paymentIntentId,
    psp_transaction_id: paymentIntentId,
    processor: "stripe",
    merchant_transaction_id: merchantTransactionId,
    result_code: typeof piData?.status === "string" ? piData.status : undefined,
    result_description:
      piError?.message ?? topError?.message ?? undefined,
    response_body: paymentIntentParsed.body,
    error: success
      ? undefined
      : piError?.message ??
        topError?.message ??
        getErrorMessage(
          paymentIntentParsed.body,
          `Stripe payment intent failed with HTTP ${paymentIntentResponse.status}`,
        ),
  };
}
