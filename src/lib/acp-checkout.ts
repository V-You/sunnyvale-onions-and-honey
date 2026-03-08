import type {
  AcpAgentCapabilities,
  AcpCheckoutBuyer,
  AcpCheckoutSessionCompleteResponse,
  AcpCheckoutItemInput,
  AcpCheckoutSessionLineItem,
  AcpCheckoutSessionResponse,
  AcpCheckoutTotal,
  AcpInterventionRequestCapabilities,
  AcpInterventionResponseCapabilities,
  AcpInterventionType,
  AcpPaymentHandler,
  AcpPaymentMethodDescriptor,
  CartItem,
  CheckoutCapabilities,
  CheckoutSession,
  MerchantSavedPaymentOption,
  PSPName,
} from "./types";

export const ACP_MERCHANT_ID = "sunnyvale-onions-and-honey";
export const ACP_TOKENIZED_CARD_HANDLER_ID = "card_primary";
const SELLER_SUPPORTED_INTERVENTIONS: AcpInterventionType[] = [];
const SUPPORTED_CARD_BRANDS = ["visa", "mastercard", "amex", "discover"];
const SUPPORTED_CARD_FUNDING_TYPES: Array<"credit" | "debit"> = [
  "credit",
  "debit",
];

function normalizeProcessor(activeProcessor: string | undefined): PSPName {
  return activeProcessor === "stripe" ? "stripe" : "aci";
}

function normalizeInterventionCapabilities(
  value: AcpInterventionRequestCapabilities | undefined,
): AcpInterventionRequestCapabilities {
  const supported = Array.isArray(value?.supported)
    ? value.supported.filter((candidate): candidate is AcpInterventionType =>
        candidate === "3ds" ||
        candidate === "biometric" ||
        candidate === "address_verification",
      )
    : [];

  return {
    supported,
    display_context: value?.display_context,
    redirect_context: value?.redirect_context,
    max_redirects: value?.max_redirects,
    max_interaction_depth: value?.max_interaction_depth,
  };
}

export function normalizeAgentCapabilities(
  capabilities: AcpAgentCapabilities | undefined,
): AcpAgentCapabilities {
  return {
    interventions: normalizeInterventionCapabilities(capabilities?.interventions),
  };
}

export function normalizeCheckoutItems(
  items: AcpCheckoutItemInput[] | undefined,
): Array<{ sku: string; quantity: number }> {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => ({
    sku: typeof item.id === "string" && item.id.length > 0
      ? item.id
      : typeof item.sku === "string"
        ? item.sku
        : "",
    quantity: item.quantity,
  }));
}

function createNegotiatedInterventions(
  agentCapabilities: AcpAgentCapabilities | undefined,
): AcpInterventionResponseCapabilities {
  const requested = agentCapabilities?.interventions?.supported ?? [];
  const supported = requested.filter((candidate) =>
    SELLER_SUPPORTED_INTERVENTIONS.includes(candidate),
  );

  return {
    supported,
    required: [],
    enforcement: "conditional",
  };
}

function createPaymentMethods(
  merchantSavedPaymentMethods: MerchantSavedPaymentOption[],
): Array<string | AcpPaymentMethodDescriptor> {
  const paymentMethods: Array<string | AcpPaymentMethodDescriptor> = [
    {
      method: "card",
      brands: [...SUPPORTED_CARD_BRANDS],
      funding_types: [...SUPPORTED_CARD_FUNDING_TYPES],
    },
  ];

  if (merchantSavedPaymentMethods.length > 0) {
    paymentMethods.push("merchant_saved_payment");
  }

  return paymentMethods;
}

function createTokenizedCardHandler(
  activeProcessor: string | undefined,
): AcpPaymentHandler {
  const processor = normalizeProcessor(activeProcessor);

  return {
    id: ACP_TOKENIZED_CARD_HANDLER_ID,
    name: "dev.acp.tokenized.card",
    version: "2026-01-22",
    spec: "https://acp.dev/handlers/tokenized.card",
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: processor,
    config_schema: "https://acp.dev/schemas/handlers/tokenized.card/config.json",
    instrument_schemas: [
      "https://acp.dev/schemas/handlers/tokenized.card/instrument.json",
    ],
    config: {
      merchant_id: ACP_MERCHANT_ID,
      psp: processor,
      accepted_brands: [...SUPPORTED_CARD_BRANDS],
      accepted_funding_types: [...SUPPORTED_CARD_FUNDING_TYPES],
      supports_3ds: false,
      environment: "sandbox",
    },
    display_order: 0,
    display_name: "Card",
  };
}

function createSellerBackedSavedCardHandlers(
  merchantSavedPaymentMethods: MerchantSavedPaymentOption[],
): AcpPaymentHandler[] {
  return merchantSavedPaymentMethods.map((paymentMethod, index) => ({
    id: paymentMethod.id,
    name: "dev.acp.seller_backed.saved_card",
    version: "2026-02-05",
    spec: "https://acp.dev/handlers/seller_backed/saved_card",
    requires_delegate_payment: true,
    requires_pci_compliance: false,
    psp: "seller_managed",
    config_schema:
      "https://acp.dev/schemas/handlers/seller_backed/saved_card/config.json",
    instrument_schemas: [
      "https://acp.dev/schemas/handlers/seller_backed/saved_card/instrument.json",
    ],
    config: {
      merchant_id: ACP_MERCHANT_ID,
      psp: "seller_managed",
      payment_method_id: paymentMethod.id,
      display_name: paymentMethod.display_name,
      display_metadata: paymentMethod.display_metadata ?? {},
      supports_3ds: false,
    },
    display_order: index + 1,
    display_name: paymentMethod.display_name,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function getCheckoutPaymentHandler(
  session: CheckoutSession,
  handlerId: string,
): AcpPaymentHandler | null {
  const handlers = session.capabilities?.payment?.handlers;

  if (!handlers) {
    return null;
  }

  return handlers.find((handler) => handler.id === handlerId) ?? null;
}

export function isTokenizedCardHandler(handler: AcpPaymentHandler): boolean {
  return handler.name === "dev.acp.tokenized.card";
}

export function isSellerBackedSavedCardHandler(
  handler: AcpPaymentHandler,
): boolean {
  return handler.name === "dev.acp.seller_backed.saved_card";
}

export function getHandlerMerchantId(handler: AcpPaymentHandler): string | null {
  const merchantId = isRecord(handler.config)
    ? handler.config.merchant_id
    : undefined;

  return typeof merchantId === "string" && merchantId.length > 0
    ? merchantId
    : null;
}

export function getHandlerPaymentMethodId(
  handler: AcpPaymentHandler,
): string | null {
  const paymentMethodId = isRecord(handler.config)
    ? handler.config.payment_method_id
    : undefined;

  return typeof paymentMethodId === "string" && paymentMethodId.length > 0
    ? paymentMethodId
    : null;
}

export function createCheckoutCapabilities(
  activeProcessor: string | undefined,
  merchantSavedPaymentMethods: MerchantSavedPaymentOption[],
  agentCapabilities: AcpAgentCapabilities | undefined,
): CheckoutCapabilities {
  return {
    payment_methods: createPaymentMethods(merchantSavedPaymentMethods),
    interventions: createNegotiatedInterventions(agentCapabilities),
    payment: {
      handlers: [
        createTokenizedCardHandler(activeProcessor),
        ...createSellerBackedSavedCardHandlers(merchantSavedPaymentMethods),
      ],
    },
  };
}

function mapCheckoutStatus(
  status: CheckoutSession["status"],
): AcpCheckoutSessionResponse["status"] {
  switch (status) {
    case "open":
      return "ready_for_payment";
    case "completed":
      return "completed";
    case "cancelled":
      return "canceled";
    case "failed":
      return "in_progress";
    default:
      return "not_ready_for_payment";
  }
}

function createLineItems(items: CartItem[]): AcpCheckoutSessionLineItem[] {
  return items.map((item) => {
    const subtotal = item.price_cents * item.quantity;

    return {
      id: `line_item_${item.sku}`,
      item: {
        id: item.sku,
        quantity: item.quantity,
      },
      base_amount: subtotal,
      discount: 0,
      subtotal,
      tax: 0,
      total: subtotal,
      name: item.name,
      unit_amount: item.price_cents,
    };
  });
}

function createTotals(amountTotalCents: number): AcpCheckoutTotal[] {
  return [
    {
      type: "items_base_amount",
      display_text: "Item(s) total",
      amount: amountTotalCents,
    },
    {
      type: "subtotal",
      display_text: "Subtotal",
      amount: amountTotalCents,
    },
    {
      type: "tax",
      display_text: "Tax",
      amount: 0,
    },
    {
      type: "total",
      display_text: "Total",
      amount: amountTotalCents,
    },
  ];
}

export function createCheckoutSessionResponse(
  session: CheckoutSession,
  activeProcessor: string | undefined,
): AcpCheckoutSessionResponse &
  Omit<CheckoutSession, "status" | "currency" | "capabilities"> {
  const merchantSavedPaymentMethods = session.merchant_saved_payment_methods ?? [];
  const capabilities =
    session.capabilities ??
    createCheckoutCapabilities(
      activeProcessor,
      merchantSavedPaymentMethods,
      session.agent_capabilities,
    );

  return {
    ...session,
    status: mapCheckoutStatus(session.status),
    currency: session.currency.toLowerCase(),
    capabilities,
    line_items: createLineItems(session.items),
    totals: createTotals(session.amount_total_cents),
    messages: [],
    links: [],
  };
}

export function createCheckoutCompletionResponse(
  session: CheckoutSession,
  activeProcessor: string | undefined,
  origin: string,
  buyer?: AcpCheckoutBuyer,
): AcpCheckoutSessionCompleteResponse {
  const orderId = session.order_id ?? session.id;

  return {
    ...createCheckoutSessionResponse(session, activeProcessor),
    ...(buyer ? { buyer } : {}),
    order: {
      id: orderId,
      checkout_session_id: session.id,
      permalink_url: new URL(
        `/confirmation?order_id=${encodeURIComponent(orderId)}`,
        origin,
      ).toString(),
    },
  };
}