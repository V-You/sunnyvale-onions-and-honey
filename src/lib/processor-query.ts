import type {
  Env,
  ProcessorQueryLookupMode,
  ProcessorQueryResponse,
} from "./types";

const ACI_QUERY_BASE_URL = "https://eu-test.oppwa.com";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readProcessorResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (isRecord(payload)) {
    const maybeError = payload as {
      error?: { message?: string };
      message?: string;
      detail?: string;
      title?: string;
    };

    if (isRecord(maybeError.error) && typeof maybeError.error.message === "string") {
      return maybeError.error.message;
    }
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
    if (typeof maybeError.detail === "string") {
      return maybeError.detail;
    }
    if (typeof maybeError.title === "string") {
      return maybeError.title;
    }
  }

  return fallback;
}

function extractRecordArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  if (typeof payload.id === "string") {
    return [payload];
  }

  for (const key of ["data", "payments", "transactions", "records", "results", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      const records = value.filter(isRecord);
      if (records.length > 0) {
        return records;
      }
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      const records = value.filter(isRecord);
      if (records.length > 0) {
        return records;
      }
    }
  }

  return [];
}

function extractTransactionIds(records: Record<string, unknown>[]): string[] {
  return records
    .map((record) => (typeof record.id === "string" ? record.id : null))
    .filter((value): value is string => value !== null);
}

function buildAciPayload(
  requestedReference: string,
  lookupMode: ProcessorQueryLookupMode,
  response: Response,
  body: unknown,
): { status: number; payload: ProcessorQueryResponse } {
  const records = extractRecordArray(body);
  const fallbackRecord = isRecord(body) ? body : null;
  const primaryRecord = records[0] ?? fallbackRecord;
  const transactionIds = extractTransactionIds(records);
  const result = isRecord(primaryRecord?.result)
    ? (primaryRecord.result as { code?: unknown; description?: unknown })
    : isRecord(fallbackRecord?.result)
      ? (fallbackRecord.result as { code?: unknown; description?: unknown })
      : undefined;
  const merchantTransactionId =
    typeof primaryRecord?.merchantTransactionId === "string"
      ? primaryRecord.merchantTransactionId
      : lookupMode === "merchant_transaction_id"
        ? requestedReference
        : undefined;
  const pspTransactionId =
    typeof primaryRecord?.id === "string"
      ? primaryRecord.id
      : transactionIds[0] ?? requestedReference;
  const noMatches =
    lookupMode === "merchant_transaction_id" && response.ok && transactionIds.length === 0;

  return {
    status: noMatches ? 404 : response.ok ? 200 : response.status,
    payload: {
      success: response.ok && !noMatches,
      processor: "aci",
      transaction_id: requestedReference,
      merchant_transaction_id: merchantTransactionId,
      psp_transaction_id: pspTransactionId,
      queried_at: Date.now(),
      lookup_mode: lookupMode,
      match_count: lookupMode === "merchant_transaction_id" ? transactionIds.length : undefined,
      matched_transaction_ids:
        lookupMode === "merchant_transaction_id" && transactionIds.length > 0
          ? transactionIds
          : undefined,
      result_code: typeof result?.code === "string" ? result.code : undefined,
      result_description:
        typeof result?.description === "string"
          ? result.description
          : undefined,
      response_body: body,
      message: noMatches
        ? "No ACI transactions matched this merchant transaction id"
        : response.ok
          ? undefined
          : getMessage(body, `ACI query failed with HTTP ${response.status}`),
    },
  };
}

function buildStripePayload(
  requestedReference: string,
  lookupMode: ProcessorQueryLookupMode,
  response: Response,
  body: unknown,
): { status: number; payload: ProcessorQueryResponse } {
  const records = extractRecordArray(body);
  const fallbackRecord = isRecord(body) ? body : null;
  const primaryRecord = records[0] ?? fallbackRecord;
  const transactionIds = extractTransactionIds(records);
  const metadata = isRecord(primaryRecord?.metadata)
    ? (primaryRecord.metadata as { merchantTransactionId?: unknown })
    : undefined;
  const lastPaymentError = isRecord(primaryRecord?.last_payment_error)
    ? (primaryRecord.last_payment_error as { message?: unknown })
    : undefined;
  const message = lookupMode === "merchant_transaction_id" && response.ok && transactionIds.length === 0
    ? "No Stripe payment intents matched this merchant transaction id yet. Stripe metadata search is not read-after-write consistent and can lag by up to about a minute."
    : response.ok
      ? undefined
      : getMessage(body, `Stripe query failed with HTTP ${response.status}`);
  const noMatches =
    lookupMode === "merchant_transaction_id" && response.ok && transactionIds.length === 0;

  return {
    status: noMatches ? 404 : response.ok ? 200 : response.status,
    payload: {
      success: response.ok && !noMatches,
      processor: "stripe",
      transaction_id: requestedReference,
      merchant_transaction_id:
        typeof metadata?.merchantTransactionId === "string"
          ? metadata.merchantTransactionId
          : lookupMode === "merchant_transaction_id"
            ? requestedReference
            : undefined,
      psp_transaction_id:
        typeof primaryRecord?.id === "string"
          ? primaryRecord.id
          : transactionIds[0] ?? requestedReference,
      queried_at: Date.now(),
      lookup_mode: lookupMode,
      match_count: lookupMode === "merchant_transaction_id" ? transactionIds.length : undefined,
      matched_transaction_ids:
        lookupMode === "merchant_transaction_id" && transactionIds.length > 0
          ? transactionIds
          : undefined,
      status:
        typeof primaryRecord?.status === "string"
          ? primaryRecord.status
          : undefined,
      result_code:
        typeof primaryRecord?.status === "string"
          ? primaryRecord.status
          : undefined,
      result_description:
        typeof lastPaymentError?.message === "string"
          ? lastPaymentError.message
          : typeof primaryRecord?.cancellation_reason === "string"
            ? primaryRecord.cancellation_reason
            : undefined,
      response_body: body,
      message,
    },
  };
}

export async function queryProcessorByTransactionId(
  env: Env,
  processor: "aci" | "stripe",
  transactionId: string,
): Promise<{ status: number; payload: ProcessorQueryResponse }> {
  if (processor === "aci") {
    const params = new URLSearchParams();
    params.append("entityId", env.ACI_ENTITY_ID);
    params.append("includeLinkedTransactions", "true");

    try {
      const response = await fetch(
        `${ACI_QUERY_BASE_URL}/v3/query/${encodeURIComponent(transactionId)}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${env.ACI_TOKEN}`,
          },
        },
      );

      const body = await readProcessorResponse(response);
      return buildAciPayload(
        transactionId,
        "psp_transaction_id",
        response,
        body,
      );
    } catch (error) {
      return {
        status: 502,
        payload: {
          success: false,
          processor: "aci",
          transaction_id: transactionId,
          psp_transaction_id: transactionId,
          queried_at: Date.now(),
          lookup_mode: "psp_transaction_id",
          response_body: null,
          message:
            error instanceof Error
              ? error.message
              : "ACI query request failed before a response was received",
        },
      };
    }
  }

  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: authHeader,
        },
      },
    );

    const body = await readProcessorResponse(response);
    return buildStripePayload(
      transactionId,
      "psp_transaction_id",
      response,
      body,
    );
  } catch (error) {
    return {
      status: 502,
      payload: {
        success: false,
        processor: "stripe",
        transaction_id: transactionId,
        psp_transaction_id: transactionId,
        queried_at: Date.now(),
        lookup_mode: "psp_transaction_id",
        response_body: null,
        message:
          error instanceof Error
            ? error.message
            : "Stripe query request failed before a response was received",
      },
    };
  }
}

export async function queryProcessorByMerchantTransactionId(
  env: Env,
  processor: "aci" | "stripe",
  merchantTransactionId: string,
): Promise<{ status: number; payload: ProcessorQueryResponse }> {
  if (processor === "aci") {
    const params = new URLSearchParams();
    params.append("merchantTransactionId", merchantTransactionId);
    params.append("entityId", env.ACI_ENTITY_ID);
    params.append("includeLinkedTransactions", "true");

    try {
      const response = await fetch(
        `${ACI_QUERY_BASE_URL}/v3/query?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${env.ACI_TOKEN}`,
          },
        },
      );

      const body = await readProcessorResponse(response);
      return buildAciPayload(
        merchantTransactionId,
        "merchant_transaction_id",
        response,
        body,
      );
    } catch (error) {
      return {
        status: 502,
        payload: {
          success: false,
          processor: "aci",
          transaction_id: merchantTransactionId,
          merchant_transaction_id: merchantTransactionId,
          psp_transaction_id: merchantTransactionId,
          queried_at: Date.now(),
          lookup_mode: "merchant_transaction_id",
          response_body: null,
          message:
            error instanceof Error
              ? error.message
              : "ACI merchant transaction query failed before a response was received",
        },
      };
    }
  }

  const authHeader = `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`;
  const params = new URLSearchParams();
  params.append(
    "query",
    `metadata["merchantTransactionId"]:"${merchantTransactionId}"`,
  );
  params.append("limit", "10");

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/payment_intents/search?${params.toString()}`,
      {
        headers: {
          Authorization: authHeader,
        },
      },
    );

    const body = await readProcessorResponse(response);
    return buildStripePayload(
      merchantTransactionId,
      "merchant_transaction_id",
      response,
      body,
    );
  } catch (error) {
    return {
      status: 502,
      payload: {
        success: false,
        processor: "stripe",
        transaction_id: merchantTransactionId,
        merchant_transaction_id: merchantTransactionId,
        psp_transaction_id: merchantTransactionId,
        queried_at: Date.now(),
        lookup_mode: "merchant_transaction_id",
        response_body: null,
        message:
          error instanceof Error
            ? error.message
            : "Stripe merchant transaction query failed before a response was received",
      },
    };
  }
}