import type {
  Env,
  ProcessorQueryLookupMode,
  ProcessorQueryResponse,
} from "./types";

const ACI_QUERY_BASE_URL = "https://eu-test.oppwa.com";
const BRAINTREE_QUERY_BASE_URL = "https://api.sandbox.braintreegateway.com";

function getXmlTagValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}(?: [^>]*)?>([\\s\\S]*?)</${tagName}>`),
  );

  return match?.[1]?.trim();
}

function getBraintreeTransactionXml(xml: string): string {
  const match = xml.match(/<transaction>([\s\S]*?)<\/transaction>/);

  return match?.[1] ?? xml;
}

function extractBraintreeTransaction(payload: unknown) {
  const xml = typeof payload === "string" ? getBraintreeTransactionXml(payload) : "";

  return {
    id: getXmlTagValue(xml, "id"),
    orderId: getXmlTagValue(xml, "order-id"),
    status: getXmlTagValue(xml, "status"),
    processorResponseCode: getXmlTagValue(xml, "processor-response-code"),
    processorResponseText: getXmlTagValue(xml, "processor-response-text"),
    gatewayRejectionReason: getXmlTagValue(xml, "gateway-rejection-reason"),
  };
}

function extractBraintreeSearchIds(payload: unknown): string[] {
  if (typeof payload !== "string") {
    return [];
  }

  const idsSection = payload.match(/<ids(?: [^>]*)?>([\s\S]*?)<\/ids>/);
  if (!idsSection) {
    return [];
  }

  return [...idsSection[1].matchAll(/<item>([^<]+)<\/item>/g)].map(
    (match) => match[1],
  );
}

function createBraintreeAuthHeader(env: Env): string {
  return `Basic ${btoa(
    `${env.BRAINTREE_PUBLIC_KEY}:${env.BRAINTREE_PRIVATE_KEY}`,
  )}`;
}

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
    if (payload.trim().startsWith("<")) {
      return (
        getXmlTagValue(payload, "message") ??
        getXmlTagValue(payload, "processor-response-text") ??
        getXmlTagValue(payload, "gateway-rejection-reason") ??
        fallback
      );
    }

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

function buildBraintreePayload(
  requestedReference: string,
  lookupMode: ProcessorQueryLookupMode,
  response: Response,
  transactionBody: unknown,
  responseBody: unknown,
  matchedTransactionIds?: string[],
): { status: number; payload: ProcessorQueryResponse } {
  const transaction = extractBraintreeTransaction(transactionBody);
  const noMatches =
    lookupMode === "merchant_transaction_id" &&
    response.ok &&
    (matchedTransactionIds?.length ?? 0) === 0;

  return {
    status: noMatches ? 404 : response.ok ? 200 : response.status,
    payload: {
      success: response.ok && !noMatches,
      processor: "braintree",
      transaction_id: requestedReference,
      merchant_transaction_id:
        transaction.orderId ??
        (lookupMode === "merchant_transaction_id"
          ? requestedReference
          : undefined),
      psp_transaction_id:
        transaction.id ?? matchedTransactionIds?.[0] ?? requestedReference,
      queried_at: Date.now(),
      lookup_mode: lookupMode,
      match_count:
        lookupMode === "merchant_transaction_id"
          ? matchedTransactionIds?.length ?? 0
          : undefined,
      matched_transaction_ids:
        lookupMode === "merchant_transaction_id" &&
        matchedTransactionIds &&
        matchedTransactionIds.length > 0
          ? matchedTransactionIds
          : undefined,
      status: transaction.status,
      result_code:
        transaction.processorResponseCode ?? transaction.status ?? undefined,
      result_description:
        transaction.processorResponseText ??
        transaction.gatewayRejectionReason ??
        undefined,
      response_body: responseBody,
      message: noMatches
        ? "No Braintree transactions matched this merchant transaction id"
        : response.ok
          ? undefined
          : getMessage(
              transactionBody,
              `Braintree query failed with HTTP ${response.status}`,
            ),
    },
  };
}

async function fetchBraintreeTransaction(
  env: Env,
  transactionId: string,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(
    `${BRAINTREE_QUERY_BASE_URL}/merchants/${encodeURIComponent(env.BRAINTREE_MERCHANT_ID)}/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: createBraintreeAuthHeader(env),
        "X-ApiVersion": "6",
        Accept: "application/xml",
      },
    },
  );

  return {
    response,
    body: await readProcessorResponse(response),
  };
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
  processor: "aci" | "stripe" | "braintree",
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

  if (processor === "braintree") {
    try {
      const result = await fetchBraintreeTransaction(env, transactionId);
      return buildBraintreePayload(
        transactionId,
        "psp_transaction_id",
        result.response,
        result.body,
        result.body,
      );
    } catch (error) {
      return {
        status: 502,
        payload: {
          success: false,
          processor: "braintree",
          transaction_id: transactionId,
          psp_transaction_id: transactionId,
          queried_at: Date.now(),
          lookup_mode: "psp_transaction_id",
          response_body: null,
          message:
            error instanceof Error
              ? error.message
              : "Braintree query request failed before a response was received",
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
  processor: "aci" | "stripe" | "braintree",
  merchantTransactionId: string,
): Promise<{ status: number; payload: ProcessorQueryResponse }> {
  if (processor === "aci") {
    const params = new URLSearchParams();
    params.append("merchantTransactionId", merchantTransactionId);
    params.append("entityId", env.ACI_ENTITY_ID);

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

  if (processor === "braintree") {
    try {
      const searchResponse = await fetch(
        `${BRAINTREE_QUERY_BASE_URL}/merchants/${encodeURIComponent(env.BRAINTREE_MERCHANT_ID)}/transactions/advanced_search_ids`,
        {
          method: "POST",
          headers: {
            Authorization: createBraintreeAuthHeader(env),
            "X-ApiVersion": "6",
            Accept: "application/xml",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            search: {
              order_id: {
                is: merchantTransactionId,
              },
            },
          }),
        },
      );

      const searchBody = await readProcessorResponse(searchResponse);
      const matchedTransactionIds = extractBraintreeSearchIds(searchBody);

      if (!searchResponse.ok || matchedTransactionIds.length === 0) {
        return {
          status:
            searchResponse.ok && matchedTransactionIds.length === 0
              ? 404
              : searchResponse.status,
          payload: {
            success: false,
            processor: "braintree",
            transaction_id: merchantTransactionId,
            merchant_transaction_id: merchantTransactionId,
            psp_transaction_id:
              matchedTransactionIds[0] ?? merchantTransactionId,
            queried_at: Date.now(),
            lookup_mode: "merchant_transaction_id",
            match_count: matchedTransactionIds.length,
            matched_transaction_ids:
              matchedTransactionIds.length > 0
                ? matchedTransactionIds
                : undefined,
            response_body: searchBody,
            message:
              searchResponse.ok && matchedTransactionIds.length === 0
                ? "No Braintree transactions matched this merchant transaction id"
                : getMessage(
                    searchBody,
                    `Braintree merchant transaction query failed with HTTP ${searchResponse.status}`,
                  ),
          },
        };
      }

      const transactionResult = await fetchBraintreeTransaction(
        env,
        matchedTransactionIds[0],
      );

      return buildBraintreePayload(
        merchantTransactionId,
        "merchant_transaction_id",
        transactionResult.response,
        transactionResult.body,
        {
          search_response: searchBody,
          transaction_response: transactionResult.body,
        },
        matchedTransactionIds,
      );
    } catch (error) {
      return {
        status: 502,
        payload: {
          success: false,
          processor: "braintree",
          transaction_id: merchantTransactionId,
          merchant_transaction_id: merchantTransactionId,
          psp_transaction_id: merchantTransactionId,
          queried_at: Date.now(),
          lookup_mode: "merchant_transaction_id",
          response_body: null,
          message:
            error instanceof Error
              ? error.message
              : "Braintree merchant transaction query failed before a response was received",
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