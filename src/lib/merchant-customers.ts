import type { AcpCheckoutBuyer } from "./types";

interface MerchantCustomerRecord {
  id: string;
  email: string;
  display_name: string;
  active: boolean;
}

const MERCHANT_CUSTOMER_RECORDS: MerchantCustomerRecord[] = [
  {
    id: "customer_demo_buyer",
    email: "buyer@example.com",
    display_name: "Demo buyer",
    active: true,
  },
  {
    id: "customer_demo_vip",
    email: "vip@example.com",
    display_name: "VIP buyer",
    active: true,
  },
  {
    id: "customer_demo_disabled",
    email: "disabled@example.com",
    display_name: "Disabled buyer",
    active: false,
  },
];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function resolveMerchantCustomerId(
  buyer: AcpCheckoutBuyer | undefined,
): string | null {
  if (typeof buyer?.email !== "string" || buyer.email.trim().length === 0) {
    return null;
  }

  const normalizedEmail = normalizeEmail(buyer.email);
  const customer = MERCHANT_CUSTOMER_RECORDS.find(
    (candidate) =>
      candidate.active && normalizeEmail(candidate.email) === normalizedEmail,
  );

  return customer?.id ?? null;
}