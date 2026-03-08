import type {
  CardPaymentMethod,
  MerchantSavedPaymentOption,
  PSPName,
} from "./types";

interface MerchantDemoPaymentDefinition {
  id: string;
  processor: PSPName;
  option: MerchantSavedPaymentOption;
  payment_method: CardPaymentMethod;
}

const MERCHANT_DEMO_PAYMENT_DEFINITIONS: MerchantDemoPaymentDefinition[] = [
  {
    id: "merchant_demo_saved_card_aci_primary",
    processor: "aci",
    option: {
      id: "merchant_demo_saved_card_aci_primary",
      display_name: "Merchant demo Visa ending in 0000",
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
    processor: "stripe",
    option: {
      id: "merchant_demo_saved_card_stripe_primary",
      display_name: "Merchant demo Visa ending in 4242",
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
];

function normalizeProcessor(activeProcessor: string | undefined): PSPName {
  return activeProcessor === "stripe" ? "stripe" : "aci";
}

export function getMerchantSavedPaymentMethods(
  activeProcessor: string | undefined,
): MerchantSavedPaymentOption[] {
  const processor = normalizeProcessor(activeProcessor);

  return MERCHANT_DEMO_PAYMENT_DEFINITIONS
    .filter((definition) => definition.processor === processor)
    .map((definition) => definition.option);
}

export function resolveMerchantSavedPaymentMethod(
  paymentMethodId: string,
): CardPaymentMethod | null {
  const definition = MERCHANT_DEMO_PAYMENT_DEFINITIONS.find(
    (candidate) => candidate.id === paymentMethodId,
  );

  return definition ? { ...definition.payment_method } : null;
}