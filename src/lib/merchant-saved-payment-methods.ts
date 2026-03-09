import type {
  CardPaymentMethod,
  MerchantSavedPaymentOption,
  PSPName,
} from "./types";

interface MerchantCustomerSavedPaymentRecord {
  id: string;
  merchant_customer_id: string;
  processor: PSPName;
  active: boolean;
  expires_at?: string;
  disabled_at?: string;
  deleted_at?: string;
  option: MerchantSavedPaymentOption;
  payment_method: CardPaymentMethod;
}

const MERCHANT_CUSTOMER_SAVED_PAYMENT_RECORDS: MerchantCustomerSavedPaymentRecord[] = [
  {
    id: "merchant_demo_saved_card_aci_primary",
    merchant_customer_id: "customer_demo_buyer",
    processor: "aci",
    active: true,
    expires_at: "2030-12-31T00:00:00Z",
    option: {
      id: "merchant_demo_saved_card_aci_primary",
      display_name: "Merchant demo Visa ending in 0000",
      supports_3ds: true,
      display_metadata: {
        brand: "visa",
        last4: "0000",
        cardholder_name: "Sunnyvale ACP demo",
        processor: "aci",
        source: "merchant_demo",
      },
      demo: true,
    },
    payment_method: {
      type: "card",
      card_number: "4200000000000000",
      expiry_month: "12",
      expiry_year: "2030",
      cvv: "123",
      card_holder: "Sunnyvale ACP demo",
    },
  },
  {
    id: "merchant_demo_saved_card_stripe_primary",
    merchant_customer_id: "customer_demo_buyer",
    processor: "stripe",
    active: true,
    expires_at: "2030-12-31T00:00:00Z",
    option: {
      id: "merchant_demo_saved_card_stripe_primary",
      display_name: "Merchant demo Visa ending in 4242",
      supports_3ds: true,
      display_metadata: {
        brand: "visa",
        last4: "4242",
        cardholder_name: "Sunnyvale ACP demo",
        processor: "stripe",
        source: "merchant_demo",
      },
      demo: true,
    },
    payment_method: {
      type: "card",
      card_number: "4242424242424242",
      expiry_month: "12",
      expiry_year: "2030",
      cvv: "123",
      card_holder: "Sunnyvale ACP demo",
    },
  },
  {
    id: "merchant_demo_saved_card_stripe_vip",
    merchant_customer_id: "customer_demo_vip",
    processor: "stripe",
    active: true,
    expires_at: "2030-12-31T00:00:00Z",
    option: {
      id: "merchant_demo_saved_card_stripe_vip",
      display_name: "VIP Visa ending in 1111",
      supports_3ds: true,
      display_metadata: {
        brand: "visa",
        last4: "1111",
        cardholder_name: "Sunnyvale VIP",
        processor: "stripe",
        source: "merchant_demo",
      },
      demo: true,
    },
    payment_method: {
      type: "card",
      card_number: "4000000000001111",
      expiry_month: "12",
      expiry_year: "2030",
      cvv: "123",
      card_holder: "Sunnyvale VIP",
    },
  },
  {
    id: "merchant_demo_saved_card_stripe_expired",
    merchant_customer_id: "customer_demo_buyer",
    processor: "stripe",
    active: true,
    expires_at: "2025-01-01T00:00:00Z",
    option: {
      id: "merchant_demo_saved_card_stripe_expired",
      display_name: "Expired Visa ending in 1881",
      supports_3ds: true,
      display_metadata: {
        brand: "visa",
        last4: "1881",
        cardholder_name: "Expired demo",
        processor: "stripe",
        source: "merchant_demo",
      },
      demo: true,
    },
    payment_method: {
      type: "card",
      card_number: "4000000000001881",
      expiry_month: "12",
      expiry_year: "2025",
      cvv: "123",
      card_holder: "Expired demo",
    },
  },
  {
    id: "merchant_demo_saved_card_aci_disabled",
    merchant_customer_id: "customer_demo_buyer",
    processor: "aci",
    active: false,
    disabled_at: "2026-03-01T00:00:00Z",
    option: {
      id: "merchant_demo_saved_card_aci_disabled",
      display_name: "Disabled ACI card ending in 2222",
      supports_3ds: true,
      display_metadata: {
        brand: "visa",
        last4: "2222",
        cardholder_name: "Disabled demo",
        processor: "aci",
        source: "merchant_demo",
      },
      demo: true,
    },
    payment_method: {
      type: "card",
      card_number: "4200000000002222",
      expiry_month: "12",
      expiry_year: "2030",
      cvv: "123",
      card_holder: "Disabled demo",
    },
  },
];

function normalizeProcessor(activeProcessor: string | undefined): PSPName {
  return activeProcessor === "stripe" ? "stripe" : "aci";
}

function isRecordAvailable(
  record: MerchantCustomerSavedPaymentRecord,
  now: number,
): boolean {
  if (!record.active) {
    return false;
  }

  if (record.disabled_at || record.deleted_at) {
    return false;
  }

  if (!record.expires_at) {
    return true;
  }

  const expiresAt = Date.parse(record.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function findSavedPaymentRecord(
  paymentMethodId: string,
  merchantCustomerId: string,
  now: number,
): MerchantCustomerSavedPaymentRecord | null {
  return (
    MERCHANT_CUSTOMER_SAVED_PAYMENT_RECORDS.find(
      (candidate) =>
        candidate.id === paymentMethodId &&
        candidate.merchant_customer_id === merchantCustomerId &&
        isRecordAvailable(candidate, now),
    ) ?? null
  );
}

export function getMerchantSavedPaymentMethods(
  activeProcessor: string | undefined,
  merchantCustomerId: string | undefined,
  now: number = Date.now(),
): MerchantSavedPaymentOption[] {
  if (!merchantCustomerId) {
    return [];
  }

  const processor = normalizeProcessor(activeProcessor);

  return MERCHANT_CUSTOMER_SAVED_PAYMENT_RECORDS
    .filter(
      (record) =>
        record.processor === processor &&
        record.merchant_customer_id === merchantCustomerId &&
        isRecordAvailable(record, now),
    )
    .map((record) => record.option);
}

export function resolveMerchantSavedPaymentMethod(
  paymentMethodId: string,
  merchantCustomerId: string | undefined,
  now: number = Date.now(),
): CardPaymentMethod | null {
  if (!merchantCustomerId) {
    return null;
  }

  const definition = findSavedPaymentRecord(
    paymentMethodId,
    merchantCustomerId,
    now,
  );

  return definition ? { ...definition.payment_method } : null;
}