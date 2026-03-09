import { getSessionsKV } from "./kv";
import type {
  AcpDelegatePaymentAllowance,
  AcpDelegatePaymentCardMethod,
  CardPaymentMethod,
} from "./types";

const ACP_DELEGATED_PAYMENT_PREFIX = "acp_delegate_payment:";

interface SellerBackedSavedCardDelegateMethod {
  type: "seller_backed_saved_card";
  payment_method_id: string;
}

export type StoredDelegatedPaymentMethod =
  | CardPaymentMethod
  | SellerBackedSavedCardDelegateMethod;

export interface StoredDelegatedPaymentToken {
  id: string;
  created_at: number;
  used_at?: number;
  handler_id: string;
  checkout_session_id: string;
  merchant_id: string;
  merchant_customer_id?: string;
  allowance: AcpDelegatePaymentAllowance;
  payment_method: StoredDelegatedPaymentMethod;
  metadata: Record<string, string>;
}

function buildDelegatedPaymentKey(tokenId: string): string {
  return `${ACP_DELEGATED_PAYMENT_PREFIX}${tokenId}`;
}

function createDelegatedPaymentTokenId(): string {
  return `vt_${crypto.randomUUID().replace(/-/g, "")}`;
}

function getExpirationTtlSeconds(expiresAtIso: string): number {
  const expiresAt = Date.parse(expiresAtIso);

  if (!Number.isFinite(expiresAt)) {
    return 300;
  }

  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeStringMap(
  value: unknown,
): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function normalizeDelegateCardMethod(
  paymentMethod: AcpDelegatePaymentCardMethod,
): CardPaymentMethod | null {
  const cardNumber =
    typeof paymentMethod.card_number === "string"
      ? paymentMethod.card_number
      : paymentMethod.number;
  const expiryMonth =
    typeof paymentMethod.expiry_month === "string"
      ? paymentMethod.expiry_month
      : paymentMethod.exp_month;
  const expiryYear =
    typeof paymentMethod.expiry_year === "string"
      ? paymentMethod.expiry_year
      : paymentMethod.exp_year;
  const cvv =
    typeof paymentMethod.cvv === "string"
      ? paymentMethod.cvv
      : paymentMethod.cvc;

  if (
    typeof cardNumber !== "string" ||
    typeof expiryMonth !== "string" ||
    typeof expiryYear !== "string" ||
    typeof cvv !== "string" ||
    cardNumber.length === 0 ||
    expiryMonth.length === 0 ||
    expiryYear.length === 0 ||
    cvv.length === 0
  ) {
    return null;
  }

  return {
    type: "card",
    card_number: cardNumber,
    expiry_month: expiryMonth,
    expiry_year: expiryYear,
    cvv,
    card_holder:
      paymentMethod.card_holder ?? paymentMethod.name ?? undefined,
  };
}

export async function storeDelegatedPaymentToken(
  token: Omit<StoredDelegatedPaymentToken, "id" | "created_at">,
): Promise<StoredDelegatedPaymentToken> {
  const kv = getSessionsKV();
  const record: StoredDelegatedPaymentToken = {
    id: createDelegatedPaymentTokenId(),
    created_at: Date.now(),
    ...token,
  };

  await kv.put(
    buildDelegatedPaymentKey(record.id),
    JSON.stringify(record),
    {
      expirationTtl: getExpirationTtlSeconds(record.allowance.expires_at),
    },
  );

  return record;
}

export async function readDelegatedPaymentToken(
  tokenId: string,
): Promise<StoredDelegatedPaymentToken | null> {
  const kv = getSessionsKV();
  const raw = await kv.get(buildDelegatedPaymentKey(tokenId));

  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as StoredDelegatedPaymentToken;
}

export async function markDelegatedPaymentTokenUsed(
  token: StoredDelegatedPaymentToken,
): Promise<StoredDelegatedPaymentToken> {
  const kv = getSessionsKV();
  const updated: StoredDelegatedPaymentToken = {
    ...token,
    used_at: Date.now(),
  };

  await kv.put(
    buildDelegatedPaymentKey(updated.id),
    JSON.stringify(updated),
    {
      expirationTtl: getExpirationTtlSeconds(updated.allowance.expires_at),
    },
  );

  return updated;
}

export function isDelegatedPaymentTokenExpired(
  token: StoredDelegatedPaymentToken,
): boolean {
  const expiresAt = Date.parse(token.allowance.expires_at);

  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}