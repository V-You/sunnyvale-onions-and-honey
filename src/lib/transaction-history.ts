import type { RecentTransactionEntry } from "./types";

const STORAGE_KEY = "transaction-history";
const MAX_HISTORY_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 12;

function isRecentTransactionEntry(value: unknown): value is RecentTransactionEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<RecentTransactionEntry>;

  return (
    typeof entry.history_id === "string" &&
    (entry.status === "completed" || entry.status === "failed") &&
    (entry.processor === "aci" || entry.processor === "stripe") &&
    typeof entry.amount_total_cents === "number" &&
    typeof entry.currency === "string" &&
    Array.isArray(entry.items) &&
    (entry.merchant_evervault_payment_id === undefined ||
      typeof entry.merchant_evervault_payment_id === "string") &&
    (entry.merchant_evervault_card_token_preview === undefined ||
      typeof entry.merchant_evervault_card_token_preview === "string") &&
    (entry.merchant_evervault_source === undefined ||
      entry.merchant_evervault_source === "card" ||
      entry.merchant_evervault_source === "saved_evervault") &&
    typeof entry.recorded_at === "number"
  );
}

export function createTransactionHistoryId(
  entry: Pick<
    RecentTransactionEntry,
    "processor" | "merchant_transaction_id" | "psp_transaction_id" | "recorded_at"
  >,
): string {
  return [
    entry.processor,
    entry.merchant_transaction_id ?? entry.psp_transaction_id ?? String(entry.recorded_at),
  ].join(":");
}

export function normalizeTransactionHistory(
  entries: RecentTransactionEntry[],
  now: number = Date.now(),
): RecentTransactionEntry[] {
  return [...entries]
    .filter((entry) => now - entry.recorded_at <= MAX_HISTORY_AGE_MS)
    .sort((left, right) => right.recorded_at - left.recorded_at)
    .slice(0, MAX_HISTORY_ENTRIES);
}

function readTransactionHistoryFromStorage(): RecentTransactionEntry[] {
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

    return parsed.filter(isRecentTransactionEntry);
  } catch {
    return [];
  }
}

export function loadTransactionHistory(): RecentTransactionEntry[] {
  const normalized = normalizeTransactionHistory(readTransactionHistoryFromStorage());

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function saveTransactionHistory(
  entries: RecentTransactionEntry[],
): RecentTransactionEntry[] {
  const normalized = normalizeTransactionHistory(entries);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function addTransactionHistoryEntry(
  entry: RecentTransactionEntry,
): RecentTransactionEntry[] {
  const existing = loadTransactionHistory().filter(
    (current) => current.history_id !== entry.history_id,
  );

  return saveTransactionHistory([entry, ...existing]);
}