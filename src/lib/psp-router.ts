import type {
  CardPaymentMethod,
  CheckoutSession,
  PaymentMethod,
  PSPName,
  PSPResult,
  SavedEvervaultPaymentMethod,
  StripeSharedPaymentTokenMethod,
  Env,
} from "./types";

const ACI_SUCCESS_CODE_REGEX =
  /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.1(?:10|20))/;

const BRAINTREE_SUCCESS_STATUSES = new Set([
  "authorized",
  "submitted_for_settlement",
  "settlement_pending",
  "settling",
  "settled",
]);

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

function normalizeProcessor(activeProcessor: string | undefined): PSPName {
  if (activeProcessor === "stripe" || activeProcessor === "braintree") {
    return activeProcessor;
  }

  return "aci";
}

function getXmlTagValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)</${tagName}>`),
  );

  return match?.[1]?.trim();
}

function getBraintreeTransactionXml(xml: string): string {
  const match = xml.match(/<transaction>([\s\S]*?)<\/transaction>/);

  return match?.[1] ?? xml;
}

function readBraintreeTransaction(xml: string) {
  const transactionXml = getBraintreeTransactionXml(xml);

  return {
    id: getXmlTagValue(transactionXml, "id"),
    status: getXmlTagValue(transactionXml, "status"),
    processorResponseCode: getXmlTagValue(
      transactionXml,
      "processor-response-code",
    ),
    processorResponseText: getXmlTagValue(
      transactionXml,
      "processor-response-text",
    ),
    gatewayRejectionReason: getXmlTagValue(
      transactionXml,
      "gateway-rejection-reason",
    ),
  };
}

function getBraintreeErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) {
    return (
      getXmlTagValue(body, "message") ??
      getXmlTagValue(body, "processor-response-text") ??
      getXmlTagValue(body, "gateway-rejection-reason") ??
      fallback
    );
  }

  return getErrorMessage(body, fallback);
}

function isEncryptedCardPaymentMethod(
  paymentMethod: PaymentMethod,
): paymentMethod is CardPaymentMethod | SavedEvervaultPaymentMethod {
  return paymentMethod.type === "card" || paymentMethod.type === "saved_evervault";
}

function normalizeExpiryMonth(expiryMonth: string): string {
  const trimmed = expiryMonth.trim();

  if (/^[0-9]{1,2}$/.test(trimmed)) {
    return trimmed.padStart(2, "0");
  }

  return trimmed;
}

function normalizeExpiryYear(expiryYear: string): string {
  const trimmed = expiryYear.trim();

  if (/^[0-9]{4}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^[0-9]{2}$/.test(trimmed)) {
    return `20${trimmed}`;
  }

  return trimmed;
}

function getEncryptedCardData(
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
) {
  return {
    card_number: paymentMethod.card_number,
    expiry_month: normalizeExpiryMonth(paymentMethod.expiry_month),
    expiry_year: normalizeExpiryYear(paymentMethod.expiry_year),
    cvv: paymentMethod.cvv,
    card_holder: paymentMethod.card_holder,
  };
}

function createPaymentMetrics(
  startedAt: number,
  steps: Array<{ name: string; started_at: number; ended_at: number }>,
) {
  return {
    total_duration_ms: Date.now() - startedAt,
    relay_round_trips: steps.length,
    steps: steps.map((step) => ({
      name: step.name,
      duration_ms: step.ended_at - step.started_at,
    })),
  };
}

export async function routeToPSP(
  env: Env,
  session: CheckoutSession,
  paymentMethod: PaymentMethod,
): Promise<PSPResult> {
  const psp = normalizeProcessor(env.ACTIVE_PSP);

  if (psp === "stripe") {
    if (paymentMethod.type === "stripe_spt") {
      return routeToStripeDelegated(env, session, paymentMethod);
    }
    if (isEncryptedCardPaymentMethod(paymentMethod)) {
      return routeToStripe(env, session, paymentMethod);
    }
  }

  if (psp === "braintree" && isEncryptedCardPaymentMethod(paymentMethod)) {
    return routeToBraintree(env, session, paymentMethod);
  }

  if (paymentMethod.type === "stripe_spt") {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: psp,
      payment_flow: "stripe_spt",
      merchant_transaction_id: session.merchant_transaction_id ?? session.id,
      error:
        "Delegated Stripe tokens can only be processed when ACTIVE_PSP=stripe",
    };
  }

  if (!isEncryptedCardPaymentMethod(paymentMethod)) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: psp,
      payment_flow: paymentMethod.type,
      merchant_transaction_id: session.merchant_transaction_id ?? session.id,
      error:
        "Merchant-side saved payments must be resolved to card data before processor routing.",
    };
  }

  return routeToACI(env, session, paymentMethod);
}

async function routeToBraintree(
  env: Env,
  session: CheckoutSession,
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
): Promise<PSPResult> {
  const startedAt = Date.now();
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;
  const authHeader = `Basic ${btoa(
    `${env.BRAINTREE_PUBLIC_KEY}:${env.BRAINTREE_PRIVATE_KEY}`,
  )}`;
  const pm = getEncryptedCardData(paymentMethod);
  const requestBody = {
    transaction: {
      type: "sale",
      amount: (session.amount_total_cents / 100).toFixed(2),
      order_id: merchantTransactionId,
      credit_card: {
        number: pm.card_number,
        expiration_month: pm.expiry_month,
        expiration_year: pm.expiry_year,
        cvv: pm.cvv,
        ...(pm.card_holder ? { cardholder_name: pm.card_holder } : {}),
      },
      options: {
        submit_for_settlement: true,
      },
    },
  };

  let response: Response;
  let requestStartedAt = Date.now();

  try {
    response = await fetch(
      `https://${env.BRAINTREE_RELAY_DOMAIN}/merchants/${encodeURIComponent(env.BRAINTREE_MERCHANT_ID)}/transactions`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "X-ApiVersion": "6",
          Accept: "application/xml",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );
  } catch (error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "braintree",
      payment_flow: paymentMethod.type,
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "braintree_transaction",
          started_at: requestStartedAt,
          ended_at: Date.now(),
        },
      ]),
      merchant_transaction_id: merchantTransactionId,
      error:
        error instanceof Error
          ? error.message
          : "Braintree relay request failed before a response was received",
    };
  }

  const { body } = await readGatewayResponse(response);
  const transaction =
    typeof body === "string" ? readBraintreeTransaction(body) : null;
  const transactionId = transaction?.id ?? "";
  const transactionStatus = transaction?.status;
  const success =
    response.ok &&
    typeof transactionStatus === "string" &&
    BRAINTREE_SUCCESS_STATUSES.has(transactionStatus);

  return {
    success,
    order_id: transactionId,
    psp_transaction_id: transactionId,
    processor: "braintree",
    payment_flow: paymentMethod.type,
    payment_metrics: createPaymentMetrics(startedAt, [
      {
        name: "braintree_transaction",
        started_at: requestStartedAt,
        ended_at: Date.now(),
      },
    ]),
    merchant_transaction_id: merchantTransactionId,
    result_code:
      transaction?.processorResponseCode ?? transaction?.status ?? undefined,
    result_description:
      transaction?.processorResponseText ??
      transaction?.gatewayRejectionReason ??
      undefined,
    response_body: body,
    error: success
      ? undefined
      : getBraintreeErrorMessage(
          body,
          `Braintree transaction failed with HTTP ${response.status}`,
        ),
  };
}

async function routeToACI(
  env: Env,
  session: CheckoutSession,
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
): Promise<PSPResult> {
  const startedAt = Date.now();
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;
  const pm = getEncryptedCardData(paymentMethod);
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
  if (pm.card_holder) {
    params.append("card.holder", pm.card_holder);
  }

  let response: Response;
  let requestStartedAt = Date.now();

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
      payment_flow: paymentMethod.type,
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "aci_payment",
          started_at: requestStartedAt,
          ended_at: Date.now(),
        },
      ]),
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
    payment_flow: paymentMethod.type,
    payment_metrics: createPaymentMetrics(startedAt, [
      {
        name: "aci_payment",
        started_at: requestStartedAt,
        ended_at: Date.now(),
      },
    ]),
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
  paymentMethod: CardPaymentMethod | SavedEvervaultPaymentMethod,
): Promise<PSPResult> {
  const startedAt = Date.now();
  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;
  const pm = getEncryptedCardData(paymentMethod);

  // step 1: create a PaymentMethod with encrypted card data
  const pmParams = new URLSearchParams();
  pmParams.append("type", "card");
  pmParams.append("card[number]", pm.card_number); // ev:ct:xxx
  pmParams.append("card[exp_month]", pm.expiry_month);
  pmParams.append("card[exp_year]", pm.expiry_year);
  pmParams.append("card[cvc]", pm.cvv);
  if (pm.card_holder) {
    pmParams.append("billing_details[name]", pm.card_holder);
  }

  let paymentMethodResponse: Response;
  let paymentMethodStartedAt = Date.now();

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
      payment_flow: paymentMethod.type,
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "stripe_payment_method",
          started_at: paymentMethodStartedAt,
          ended_at: Date.now(),
        },
      ]),
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
      payment_flow: paymentMethod.type,
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "stripe_payment_method",
          started_at: paymentMethodStartedAt,
          ended_at: Date.now(),
        },
      ]),
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
  let paymentIntentStartedAt = Date.now();

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
      payment_flow: paymentMethod.type,
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "stripe_payment_method",
          started_at: paymentMethodStartedAt,
          ended_at: paymentIntentStartedAt,
        },
        {
          name: "stripe_payment_intent",
          started_at: paymentIntentStartedAt,
          ended_at: Date.now(),
        },
      ]),
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
    payment_flow: paymentMethod.type,
    payment_metrics: createPaymentMetrics(startedAt, [
      {
        name: "stripe_payment_method",
        started_at: paymentMethodStartedAt,
        ended_at: paymentIntentStartedAt,
      },
      {
        name: "stripe_payment_intent",
        started_at: paymentIntentStartedAt,
        ended_at: Date.now(),
      },
    ]),
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

async function routeToStripeDelegated(
  env: Env,
  session: CheckoutSession,
  paymentMethod: StripeSharedPaymentTokenMethod,
): Promise<PSPResult> {
  const startedAt = Date.now();
  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;
  const merchantTransactionId = session.merchant_transaction_id ?? session.id;
  const params = new URLSearchParams();

  params.append("amount", String(session.amount_total_cents));
  params.append("currency", session.currency.toLowerCase());
  params.append("confirm", "true");
  params.append("metadata[merchantTransactionId]", merchantTransactionId);

  if (paymentMethod.confirmation_token) {
    params.append("confirmation_token", paymentMethod.confirmation_token);
    params.append("automatic_payment_methods[enabled]", "true");
  } else if (paymentMethod.payment_method_id) {
    params.append("payment_method", paymentMethod.payment_method_id);
  } else {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "stripe",
      payment_flow: "stripe_spt",
      merchant_transaction_id: merchantTransactionId,
      error:
        "A delegated Stripe payment requires either payment_method_id or confirmation_token",
    };
  }

  let paymentIntentResponse: Response;
  let paymentIntentStartedAt = Date.now();

  try {
    paymentIntentResponse = await fetch(
      `https://${env.STRIPE_RELAY_DOMAIN}/v1/payment_intents`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
  } catch (error) {
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      processor: "stripe",
      payment_flow: "stripe_spt",
      payment_metrics: createPaymentMetrics(startedAt, [
        {
          name: "stripe_delegated_payment_intent",
          started_at: paymentIntentStartedAt,
          ended_at: Date.now(),
        },
      ]),
      merchant_transaction_id: merchantTransactionId,
      error:
        error instanceof Error
          ? error.message
          : "Stripe delegated payment request failed before a response was received",
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
    payment_flow: "stripe_spt",
    payment_metrics: createPaymentMetrics(startedAt, [
      {
        name: "stripe_delegated_payment_intent",
        started_at: paymentIntentStartedAt,
        ended_at: Date.now(),
      },
    ]),
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
          `Stripe delegated payment failed with HTTP ${paymentIntentResponse.status}`,
        ),
  };
}
