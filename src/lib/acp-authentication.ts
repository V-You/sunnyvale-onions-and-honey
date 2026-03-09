import {
  getHandlerPaymentMethodId,
  isSellerBackedSavedCardHandler,
} from "./acp-checkout";
import type {
  AcpAuthenticationMetadata,
  AcpAuthenticationResult,
  AcpPaymentHandler,
  CheckoutSession,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readHandlerConfigBoolean(
  handler: AcpPaymentHandler,
  field: string,
): boolean {
  if (!isRecord(handler.config)) {
    return false;
  }

  return handler.config[field] === true;
}

function normalizeDirectoryServer(
  brand: string | undefined,
): AcpAuthenticationMetadata["directory_server"] {
  switch (brand) {
    case "mastercard":
      return "mastercard";
    case "amex":
      return "american_express";
    default:
      return "visa";
  }
}

function readSavedCardBrand(
  handler: AcpPaymentHandler,
): string | undefined {
  if (!isRecord(handler.config)) {
    return undefined;
  }

  const displayMetadata = isRecord(handler.config.display_metadata)
    ? handler.config.display_metadata
    : null;
  const brand = displayMetadata?.brand;

  return typeof brand === "string" ? brand : undefined;
}

export function handlerSupports3ds(handler: AcpPaymentHandler): boolean {
  return readHandlerConfigBoolean(handler, "supports_3ds");
}

export function delegatedTokenRequires3ds(
  metadata: Record<string, string>,
): boolean {
  return metadata.requires_3ds === "true";
}

export function createAuthenticationMetadata(
  session: CheckoutSession,
  handler: AcpPaymentHandler,
): AcpAuthenticationMetadata {
  const handlerPaymentMethodId = isSellerBackedSavedCardHandler(handler)
    ? getHandlerPaymentMethodId(handler)
    : undefined;
  const savedCardBrand = readSavedCardBrand(handler);

  return {
    acquirer_details: {
      acquirer_bin: "412345",
      acquirer_country: "US",
      acquirer_merchant_id:
        session.merchant_customer_id ?? handlerPaymentMethodId ?? session.id,
      merchant_name: "Sunnyvale Onions & Honey",
      requestor_id: "sunnyvale_acp_demo",
    },
    directory_server: normalizeDirectoryServer(savedCardBrand),
    flow_preference: {
      type: "challenge",
      challenge: {
        challenge_window_size: "05",
      },
    },
  };
}

export function isSuccessfulAuthenticationResult(
  authenticationResult: AcpAuthenticationResult | undefined,
): boolean {
  return (
    authenticationResult?.outcome === "authenticated" ||
    authenticationResult?.outcome === "attempt_acknowledged"
  );
}