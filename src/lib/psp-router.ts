import type {
  CheckoutSession,
  PaymentMethod,
  PSPResult,
  Env,
} from "./types";

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
  const params = new URLSearchParams();
  params.append("entityId", env.ACI_ENTITY_ID);
  params.append("amount", (session.amount_total_cents / 100).toFixed(2));
  params.append("currency", session.currency);
  params.append("paymentType", "DB");
  params.append("card.number", pm.card_number); // ev:ct:xxx -- relay decrypts
  params.append("card.expiryMonth", pm.expiry_month);
  params.append("card.expiryYear", pm.expiry_year);
  params.append("card.cvv", pm.cvv);

  const resp = await fetch(
    `https://${env.ACI_RELAY_DOMAIN}/v1/payments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ACI_TOKEN}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  const data: Record<string, unknown> = await resp.json();
  const result = data.result as { code?: string; description?: string } | undefined;
  const success = result?.code?.startsWith("000") ?? false;

  return {
    success,
    order_id: (data.id as string) ?? "",
    psp_transaction_id: (data.id as string) ?? "",
    error: success ? undefined : result?.description,
  };
}

async function routeToStripe(
  env: Env,
  session: CheckoutSession,
  pm: PaymentMethod,
): Promise<PSPResult> {
  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;

  // step 1: create a PaymentMethod with encrypted card data
  const pmParams = new URLSearchParams();
  pmParams.append("type", "card");
  pmParams.append("card[number]", pm.card_number); // ev:ct:xxx
  pmParams.append("card[exp_month]", pm.expiry_month);
  pmParams.append("card[exp_year]", pm.expiry_year);
  pmParams.append("card[cvc]", pm.cvv);

  const pmResp = await fetch(
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

  const pmData: Record<string, unknown> = await pmResp.json();
  if (pmData.error) {
    const err = pmData.error as { message?: string };
    return {
      success: false,
      order_id: "",
      psp_transaction_id: "",
      error: err.message,
    };
  }

  // step 2: create and confirm a PaymentIntent
  const piParams = new URLSearchParams();
  piParams.append("amount", String(session.amount_total_cents));
  piParams.append("currency", session.currency.toLowerCase());
  piParams.append("payment_method", pmData.id as string);
  piParams.append("confirm", "true");

  const piResp = await fetch(
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

  const piData: Record<string, unknown> = await piResp.json();
  const success = piData.status === "succeeded";
  const piError = piData.last_payment_error as { message?: string } | undefined;
  const topError = piData.error as { message?: string } | undefined;

  return {
    success,
    order_id: (piData.id as string) ?? "",
    psp_transaction_id: (piData.id as string) ?? "",
    error: success
      ? undefined
      : piError?.message ?? topError?.message,
  };
}
