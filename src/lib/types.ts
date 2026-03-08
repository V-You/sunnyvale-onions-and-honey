// product type matching TinaCMS schema
export interface Product {
  sku: string;
  name: string;
  category: "onion" | "honey";
  price_cents: number;
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
}

// payment method submitted by agent or checkout form
export interface PaymentMethod {
  type: "card";
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
}

// PSP router result
export interface PSPResult {
  success: boolean;
  order_id: string;
  psp_transaction_id: string;
  processor: PSPName;
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
  result_code?: string;
  result_description?: string;
  amount_total_cents: number;
  currency: string;
  items: CartItem[];
  recorded_at: number;
}

export interface ProcessorQueryResponse {
  success: boolean;
  processor: PSPName;
  transaction_id: string;
  merchant_transaction_id?: string;
  psp_transaction_id: string;
  queried_at: number;
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
  ACI_ENTITY_ID: string;
  ACI_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  SESSIONS: unknown;
  ALLOWED_ORIGINS: string;
}
