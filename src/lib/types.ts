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

export type PSPName = "aci" | "stripe" | "braintree";
export type PaymentFlowName =
  | "card"
  | "saved_evervault"
  | "merchant_saved_payment"
  | "stripe_spt";
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

export type AcpInterventionType =
  | "3ds"
  | "biometric"
  | "address_verification";

export interface AcpInterventionRequestCapabilities {
  supported: AcpInterventionType[];
  display_context?: string;
  redirect_context?: string;
  max_redirects?: number;
  max_interaction_depth?: number;
}

export interface AcpInterventionResponseCapabilities {
  supported: AcpInterventionType[];
  required?: AcpInterventionType[];
  enforcement?: "always" | "conditional";
}

export interface AcpAgentCapabilities {
  interventions?: AcpInterventionRequestCapabilities;
}

export interface AcpPaymentMethodDescriptor {
  method: string;
  brands?: string[];
  funding_types?: Array<"credit" | "debit" | "prepaid">;
}

export interface AcpPaymentHandler {
  id: string;
  name: string;
  version: string;
  spec: string;
  requires_delegate_payment: boolean;
  requires_pci_compliance: boolean;
  psp: string;
  config_schema: string;
  instrument_schemas: string[];
  config: Record<string, unknown>;
  display_order?: number;
  display_name?: string;
}

export interface CheckoutCapabilities {
  payment_methods: Array<string | AcpPaymentMethodDescriptor>;
  interventions?: AcpInterventionResponseCapabilities;
  payment?: {
    handlers: AcpPaymentHandler[];
  };
}

export interface AcpCheckoutItemInput {
  id?: string;
  sku?: string;
  quantity: number;
}

export interface AcpCheckoutBuyer {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
}

export interface AcpAddress {
  name?: string;
  line_one?: string;
  line_two?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
}

export interface AcpCheckoutSessionCreateRequest {
  items?: AcpCheckoutItemInput[];
  buyer?: AcpCheckoutBuyer;
  capabilities?: AcpAgentCapabilities;
}

export interface AcpDelegatePaymentAllowance {
  reason: "one_time";
  max_amount: number;
  currency: string;
  checkout_session_id: string;
  merchant_id: string;
  expires_at: string;
}

export interface AcpDelegatePaymentRiskSignal {
  type: string;
  score?: number;
  action?: string;
}

export interface AcpDelegatePaymentCardMethod {
  type: "card";
  number?: string;
  card_number?: string;
  exp_month?: string;
  expiry_month?: string;
  exp_year?: string;
  expiry_year?: string;
  name?: string;
  card_holder?: string;
  cvc?: string;
  cvv?: string;
  display_brand?: string;
  display_last4?: string;
  display_card_funding_type?: string;
  metadata?: Record<string, string>;
}

export interface AcpDelegatePaymentSellerBackedSavedCardMethod {
  type: "seller_backed_saved_card";
  payment_method_id?: string;
}

export type AcpDelegatePaymentMethod =
  | AcpDelegatePaymentCardMethod
  | AcpDelegatePaymentSellerBackedSavedCardMethod;

export interface AcpDelegatePaymentRequest {
  handler_id: string;
  payment_method: AcpDelegatePaymentMethod;
  allowance: AcpDelegatePaymentAllowance;
  billing_address?: AcpAddress;
  risk_signals: AcpDelegatePaymentRiskSignal[];
  metadata: Record<string, string>;
}

export interface AcpDelegatePaymentResponse {
  id: string;
  created: string;
  metadata: Record<string, string>;
}

export interface AcpTokenCredential {
  type: "spt";
  token: string;
  allowance?: {
    max_amount?: number;
    currency?: string;
    expires_at?: string;
  };
}

export interface AcpPaymentInstrument {
  id?: string;
  handler_id?: string;
  type: string;
  credential: AcpTokenCredential | Record<string, unknown>;
  metadata?: Record<string, string>;
}

export interface AcpPaymentData {
  handler_id: string;
  instrument: AcpPaymentInstrument;
  billing_address?: AcpAddress;
}

export interface AcpCheckoutSessionCompleteRequest {
  buyer?: AcpCheckoutBuyer;
  payment_data?: AcpPaymentData;
  authentication_result?: AcpAuthenticationResult;
  payment_method?: PaymentMethod;
}

export interface AcpAuthenticationMetadata {
  acquirer_details: {
    acquirer_bin: string;
    acquirer_country: string;
    acquirer_merchant_id: string;
    merchant_name: string;
    requestor_id?: string;
  };
  directory_server: "visa" | "mastercard" | "american_express";
  flow_preference?: {
    type: "challenge" | "frictionless";
    challenge?: {
      challenge_window_size?: "01" | "02" | "03" | "04" | "05";
    };
  };
}

export interface AcpAuthenticationResult {
  outcome:
    | "authenticated"
    | "attempt_acknowledged"
    | "denied"
    | "not_authenticated"
    | "unavailable";
  outcome_details?: {
    three_ds_cryptogram?: string;
    electronic_commerce_indicator?: string;
    transaction_id?: string;
    version?: string;
    authentication_value?: string;
    trans_status?: string;
    trans_status_reason?: string;
    cardholder_info?: string;
  };
}

export interface AcpCheckoutSessionLineItem {
  id: string;
  item: {
    id: string;
    quantity: number;
  };
  base_amount: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  name?: string;
  description?: string;
  unit_amount?: number;
}

export interface AcpCheckoutTotal {
  type: string;
  display_text: string;
  amount: number;
  description?: string;
}

export interface AcpCheckoutMessage {
  type: "info" | "error";
  code?: string;
  severity?: "info" | "warning" | "error";
  resolution?: "recoverable" | "requires_buyer_action" | "requires_buyer_input";
  param?: string;
  content_type: "plain" | "markdown";
  content: string;
}

export interface AcpCheckoutLink {
  type: "terms_of_use" | "privacy_policy" | "return_policy";
  url: string;
}

export interface AcpCheckoutSessionResponse {
  id: string;
  status:
    | "not_ready_for_payment"
    | "ready_for_payment"
    | "authentication_required"
    | "completed"
    | "canceled"
    | "in_progress";
  currency: string;
  capabilities: CheckoutCapabilities;
  line_items: AcpCheckoutSessionLineItem[];
  totals: AcpCheckoutTotal[];
  messages: AcpCheckoutMessage[];
  links: AcpCheckoutLink[];
  authentication_metadata?: AcpAuthenticationMetadata;
}

export interface AcpCheckoutOrder {
  id: string;
  checkout_session_id: string;
  permalink_url: string;
}

export interface AcpCheckoutSessionCompleteResponse
  extends AcpCheckoutSessionResponse {
  buyer?: AcpCheckoutBuyer;
  order: AcpCheckoutOrder;
}

export interface MerchantEvervaultPaymentReference {
  id: string;
  source: "card" | "saved_evervault";
  card_token: string;
  card_token_preview: string;
  card_holder?: string;
}

export interface MerchantVaultCiphertextRecord {
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  card_holder?: string;
  source_reference_id?: string;
}

export interface MerchantVaultRecord {
  id: string;
  created_at: number;
  status: "completed" | "failed";
  source: "card" | "saved_evervault";
  checkout_session_id: string;
  order_id?: string;
  merchant_transaction_id?: string;
  psp_transaction_id?: string;
  merchant_customer_id?: string;
  processor?: PSPName;
  payment_flow?: PaymentFlowName;
  card_token_preview: string;
  ciphertext_record: MerchantVaultCiphertextRecord;
  retention: {
    omitted_fields: string[];
  };
}

export interface MerchantSavedPaymentDisplayMetadata {
  brand?: string;
  last4?: string;
  cardholder_name?: string;
  processor?: PSPName;
  source?: "merchant_demo";
}

export interface MerchantSavedPaymentOption {
  id: string;
  display_name: string;
  display_metadata?: MerchantSavedPaymentDisplayMetadata;
  supports_3ds?: boolean;
  demo?: boolean;
}

// checkout session (KV-stored)
export interface CheckoutSession {
  id: string;
  status:
    | "open"
    | "authentication_required"
    | "completed"
    | "failed"
    | "cancelled";
  items: CartItem[];
  amount_total_cents: number;
  currency: string;
  allowed_payment_methods: string[];
  capabilities?: CheckoutCapabilities;
  agent_capabilities?: AcpAgentCapabilities;
  merchant_customer_id?: string;
  merchant_saved_payment_methods?: MerchantSavedPaymentOption[];
  merchant_evervault_payment?: MerchantEvervaultPaymentReference;
  authentication_metadata?: AcpAuthenticationMetadata;
  authentication_requirement?: {
    handler_id: string;
    token_id: string;
    instrument_type: string;
    payment_flow: PaymentFlowName;
  };
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

export interface MerchantSavedPaymentMethod {
  type: "merchant_saved_payment";
  payment_method_id: string;
}

export interface StripeSharedPaymentTokenMethod {
  type: "stripe_spt";
  payment_method_id?: string;
  confirmation_token?: string;
}

export type PaymentMethod =
  | CardPaymentMethod
  | SavedEvervaultPaymentMethod
  | MerchantSavedPaymentMethod
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
  merchant_evervault_payment_id?: string;
  merchant_evervault_card_token_preview?: string;
  merchant_evervault_source?: "card" | "saved_evervault";
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
  BRAINTREE_RELAY_DOMAIN: string;
  ACTIVE_PSP: string;
  ACP_API_KEYS: string;
  ACI_ENTITY_ID: string;
  ACI_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  BRAINTREE_MERCHANT_ID: string;
  BRAINTREE_PUBLIC_KEY: string;
  BRAINTREE_PRIVATE_KEY: string;
  SESSIONS: unknown;
  ALLOWED_ORIGINS: string;
}
