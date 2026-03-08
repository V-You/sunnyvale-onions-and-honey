// product type matching TinaCMS schema
export interface Product {
  sku: string;
  name: string;
  category: "onion" | "honey";
  price_cents: number;
  on_sale: boolean;
  sale_percent_off: number;
  featured_on_homepage: boolean;
  currency: string;
  description: string;
  short_tagline: string;
  color: string;
  flavor_profile: string[];
  intensity: number;
  gift_score: number;
  weight_grams: number;
  allergens: string[];
  tags: string[];
  image_url: string;
  in_stock: boolean;
}

// cart
export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  price_cents: number;
}

export type PSPName = "aci" | "stripe";
export type PaymentFlowName = "card" | "saved_evervault" | "stripe_spt";
export type ProcessorQueryLookupMode =
  | "psp_transaction_id"
  | "merchant_transaction_id";

export interface PaymentMetricStep {
  name: string;
  duration_ms: number;
}

export interface PaymentMetrics {
  total_duration_ms: number;
  relay_round_trips: number;
  steps: PaymentMetricStep[];
}

// checkout session (KV-stored)
export interface CheckoutSession {
  id: string;
  status: "open" | "completed" | "failed" | "cancelled";
  items: CartItem[];
  amount_total_cents: number;
  currency: string;
  allowed_payment_methods: string[];
  created_at: number;
  order_id?: string;
  merchant_transaction_id?: string;
  psp_transaction_id?: string;
  processor?: PSPName;
  result_code?: string;
  result_description?: string;
  completed_at?: number;
  payment_metrics?: PaymentMetrics;
}

// payment method submitted by agent or checkout form
export interface CardPaymentMethod {
  type: "card";
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
  card_holder?: string;
}

export interface SavedEvervaultPaymentMethod {
  type: "saved_evervault";
  saved_payment_id: string;
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
  card_holder?: string;
}

export interface StripeSharedPaymentTokenMethod {
  type: "stripe_spt";
  payment_method_id?: string;
  confirmation_token?: string;
}

export type PaymentMethod =
  | CardPaymentMethod
  | SavedEvervaultPaymentMethod
  | StripeSharedPaymentTokenMethod;

// PSP router result
export interface PSPResult {
  success: boolean;
  order_id: string;
  psp_transaction_id: string;
  processor: PSPName;
  payment_flow: PaymentFlowName;
  payment_metrics?: PaymentMetrics;
  merchant_transaction_id?: string;
  result_code?: string;
  result_description?: string;
  response_body?: unknown;
  error?: string;
}

export interface RecentTransactionEntry {
  history_id: string;
  status: "completed" | "failed";
  order_id?: string;
  merchant_transaction_id?: string;
  psp_transaction_id?: string;
  processor: PSPName;
  payment_flow?: PaymentFlowName;
  payment_metrics?: PaymentMetrics;
  result_code?: string;
  result_description?: string;
  amount_total_cents: number;
  currency: string;
  items: CartItem[];
  recorded_at: number;
}

export interface SavedEvervaultPaymentRecord {
  id: string;
  created_at: number;
  brand?: string | null;
  last_four?: string | null;
  cardholder_name?: string | null;
  payment_method: SavedEvervaultPaymentMethod;
}

export interface DemoBenchmarkRun {
  id: string;
  created_at: number;
  iterations: number;
  processor_hint?: PSPName;
  product_feed_average_ms: number;
  product_feed_requests_per_second: number;
  checkout_session_average_ms: number;
  checkout_session_requests_per_second: number;
}

export interface ProcessorQueryResponse {
  success: boolean;
  processor: PSPName;
  transaction_id: string;
  merchant_transaction_id?: string;
  psp_transaction_id: string;
  queried_at: number;
  lookup_mode: ProcessorQueryLookupMode;
  match_count?: number;
  matched_transaction_ids?: string[];
  status?: string;
  result_code?: string;
  result_description?: string;
  response_body: unknown;
  message?: string;
}

// worker environment bindings
export interface Env {
  EV_API_KEY: string;
  EV_APP_ID: string;
  ACI_RELAY_DOMAIN: string;
  STRIPE_RELAY_DOMAIN: string;
  ACTIVE_PSP: string;
  ACP_API_KEYS: string;
  ACI_ENTITY_ID: string;
  ACI_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  SESSIONS: unknown;
  ALLOWED_ORIGINS: string;
}
