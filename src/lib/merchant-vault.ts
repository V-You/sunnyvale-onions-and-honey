import { getSessionsKV } from "./kv";
import type { MerchantVaultRecord } from "./types";

const MERCHANT_VAULT_KEY_PREFIX = "merchant_vault:";
const MERCHANT_VAULT_INDEX_KEY = "merchant_vault:index";
const MERCHANT_VAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const MERCHANT_VAULT_MAX_RECORDS = 50;

function buildMerchantVaultRecordKey(recordId: string): string {
  return `${MERCHANT_VAULT_KEY_PREFIX}${recordId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMerchantVaultRecord(value: unknown): value is MerchantVaultRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.created_at === "number" &&
    (value.status === "completed" || value.status === "failed") &&
    (value.source === "card" || value.source === "saved_evervault") &&
    typeof value.checkout_session_id === "string" &&
    typeof value.card_token_preview === "string" &&
    isRecord(value.ciphertext_record) &&
    typeof value.ciphertext_record.card_number === "string" &&
    typeof value.ciphertext_record.expiry_month === "string" &&
    typeof value.ciphertext_record.expiry_year === "string" &&
    isRecord(value.retention) &&
    Array.isArray(value.retention.omitted_fields)
  );
}

async function readMerchantVaultIndex(): Promise<string[]> {
  const kv = getSessionsKV();
  const raw = await kv.get(MERCHANT_VAULT_INDEX_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } catch {
    return [];
  }
}

async function writeMerchantVaultIndex(recordIds: string[]): Promise<void> {
  const kv = getSessionsKV();
  await kv.put(MERCHANT_VAULT_INDEX_KEY, JSON.stringify(recordIds), {
    expirationTtl: MERCHANT_VAULT_RETENTION_SECONDS,
  });
}

export async function storeMerchantVaultRecord(
  record: MerchantVaultRecord,
): Promise<MerchantVaultRecord> {
  const kv = getSessionsKV();

  await kv.put(buildMerchantVaultRecordKey(record.id), JSON.stringify(record), {
    expirationTtl: MERCHANT_VAULT_RETENTION_SECONDS,
  });

  const existingIndex = await readMerchantVaultIndex();
  const nextIndex = [record.id, ...existingIndex.filter((id) => id !== record.id)];
  const retainedIndex = nextIndex.slice(0, MERCHANT_VAULT_MAX_RECORDS);
  const droppedIds = nextIndex.slice(MERCHANT_VAULT_MAX_RECORDS);

  await writeMerchantVaultIndex(retainedIndex);

  await Promise.all(
    droppedIds.map((recordId) => kv.delete(buildMerchantVaultRecordKey(recordId))),
  );

  return record;
}

export async function getMerchantVaultRecord(
  recordId: string,
): Promise<MerchantVaultRecord | null> {
  const kv = getSessionsKV();
  const raw = await kv.get(buildMerchantVaultRecordKey(recordId));

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isMerchantVaultRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function listMerchantVaultRecords(
  limit: number = MERCHANT_VAULT_MAX_RECORDS,
): Promise<MerchantVaultRecord[]> {
  const kv = getSessionsKV();
  const index = await readMerchantVaultIndex();
  const records = await Promise.all(
    index.slice(0, limit).map((recordId) => getMerchantVaultRecord(recordId)),
  );
  const validRecords = records.filter(
    (record): record is MerchantVaultRecord => record !== null,
  );

  const validIds = validRecords.map((record) => record.id);
  const needsIndexRepair =
    validIds.length !== index.length ||
    validIds.some((recordId, indexPosition) => recordId !== index[indexPosition]);

  if (needsIndexRepair) {
    await writeMerchantVaultIndex(validIds);

    const staleIds = index.filter((recordId) => !validIds.includes(recordId));
    await Promise.all(
      staleIds.map((recordId) => kv.delete(buildMerchantVaultRecordKey(recordId))),
    );
  }

  return validRecords;
}