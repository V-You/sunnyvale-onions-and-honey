import type { SavedEvervaultPaymentRecord } from "./types";

const STORAGE_KEY = "saved-evervault-payment-methods";
const MAX_SAVED_PAYMENTS = 3;
const MAX_PAYMENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSavedEvervaultPaymentRecord(
  value: unknown,
): value is SavedEvervaultPaymentRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.created_at === "number" &&
    isRecord(value.payment_method) &&
    value.payment_method.type === "saved_evervault" &&
    typeof value.payment_method.saved_payment_id === "string" &&
    typeof value.payment_method.card_number === "string" &&
    typeof value.payment_method.expiry_month === "string" &&
    typeof value.payment_method.expiry_year === "string" &&
    typeof value.payment_method.cvv === "string"
  );
}

function normalizeSavedPayments(
  records: SavedEvervaultPaymentRecord[],
  now: number = Date.now(),
): SavedEvervaultPaymentRecord[] {
  return [...records]
    .filter((record) => now - record.created_at <= MAX_PAYMENT_AGE_MS)
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, MAX_SAVED_PAYMENTS);
}

function readSavedPaymentsFromStorage(): SavedEvervaultPaymentRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSavedEvervaultPaymentRecord);
  } catch {
    return [];
  }
}

export function loadSavedPaymentMethods(): SavedEvervaultPaymentRecord[] {
  const normalized = normalizeSavedPayments(readSavedPaymentsFromStorage());

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function saveSavedPaymentMethods(
  records: SavedEvervaultPaymentRecord[],
): SavedEvervaultPaymentRecord[] {
  const normalized = normalizeSavedPayments(records);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function addSavedPaymentMethod(
  record: SavedEvervaultPaymentRecord,
): SavedEvervaultPaymentRecord[] {
  const existing = loadSavedPaymentMethods().filter(
    (current) => current.id !== record.id,
  );

  return saveSavedPaymentMethods([record, ...existing]);
}