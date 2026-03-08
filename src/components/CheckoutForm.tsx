"use client";

import { useEffect, useState } from "react";
import { Card, EvervaultProvider, themes, type CardPayload } from "@evervault/react";
import { useRouter } from "next/navigation";
import { ACP_LATEST_API_VERSION } from "@/lib/acp-shared";
import {
  formatProductPrice,
  getProductEffectivePriceCents,
} from "@/lib/product-pricing";
import {
  addSavedPaymentMethod,
  loadSavedPaymentMethods,
} from "@/lib/saved-payment-methods";
import {
  addTransactionHistoryEntry,
  createTransactionHistoryId,
} from "@/lib/transaction-history";
import type {
  CartItem,
  PaymentFlowName,
  PaymentMethod,
  Product,
  PSPName,
  RecentTransactionEntry,
  SavedEvervaultPaymentRecord,
} from "@/lib/types";

interface CartEntry {
  sku: string;
  quantity: number;
}

interface EncryptedCardDetails {
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
}

interface CardPreview {
  brand: string | null;
  lastFour: string | null;
  name: string | null;
}

interface SessionErrorResponse {
  error?: string;
}

interface SessionCreateResponse {
  id: string;
  currency?: string;
}

interface CheckoutCompleteResponse {
  status?: string;
  order_id?: string;
  amount_total_cents?: number;
  currency?: string;
  completed_at?: number;
  processor?: string;
  payment_flow?: PaymentFlowName;
  payment_metrics?: RecentTransactionEntry["payment_metrics"];
  merchant_transaction_id?: string;
  psp_transaction_id?: string;
  result_code?: string;
  result_description?: string;
  response_body?: unknown;
  message?: string;
  error?: string;
  technical_message?: string;
}

type CheckoutMode = "card" | "saved_evervault" | "stripe_spt";
type DelegatedStripeTokenMode = "confirmation_token" | "payment_method_id";

function formatTechnicalResponse(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  return JSON.stringify(payload, null, 2);
}

async function readApiResponse(response: Response): Promise<unknown> {
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

function getResponseMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const maybePayload = payload as {
      error?: string;
      message?: string;
      technical_message?: string;
      result_description?: string;
    };

    if (maybePayload.error) {
      return maybePayload.error;
    }
    if (maybePayload.message) {
      return maybePayload.message;
    }
    if (maybePayload.technical_message) {
      return maybePayload.technical_message;
    }
    if (maybePayload.result_description) {
      return maybePayload.result_description;
    }
  }

  return fallback;
}

function resolveCartItems(cart: CartEntry[], products: Product[]): CartItem[] {
  return cart.map((entry) => {
    const product = products.find((candidate) => candidate.sku === entry.sku);

    return {
      sku: entry.sku,
      name: product?.name ?? entry.sku,
      quantity: entry.quantity,
      price_cents: product ? getProductEffectivePriceCents(product) : 0,
    };
  });
}

function formatSavedPaymentLabel(record: SavedEvervaultPaymentRecord): string {
  const brand = record.brand?.toUpperCase() ?? "saved card";
  const lastFour = record.last_four ? `•••• ${record.last_four}` : "encrypted payload";
  return `${brand} ${lastFour}`;
}

function formatActiveProcessorLabel(processor: PSPName): string {
  return processor === "stripe" ? "Stripe" : "ACI";
}

const EVERVAULT_APP_ID = process.env.NEXT_PUBLIC_EVERVAULT_APP_ID ?? "";
const EVERVAULT_TEAM_ID = process.env.NEXT_PUBLIC_EVERVAULT_TEAM_ID ?? "";
const ACP_API_KEY = process.env.NEXT_PUBLIC_ACP_API_KEY ?? "";
const EVERVAULT_CONFIGURED =
  EVERVAULT_APP_ID.length > 0 && EVERVAULT_TEAM_ID.length > 0;
const ACP_CONFIGURED = ACP_API_KEY.length > 0;
const EVERVAULT_CARD_THEME = themes.clean();

export default function CheckoutForm(
  {
    products,
    activeProcessor,
  }: {
    products: Product[];
    activeProcessor: PSPName;
  },
) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [savedPayments, setSavedPayments] = useState<SavedEvervaultPaymentRecord[]>([]);
  const [selectedSavedPaymentId, setSelectedSavedPaymentId] = useState("");
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>("card");
  const [delegatedTokenMode, setDelegatedTokenMode] =
    useState<DelegatedStripeTokenMode>("confirmation_token");
  const [delegatedStripeToken, setDelegatedStripeToken] = useState("");
  const [rememberEncryptedCard, setRememberEncryptedCard] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicalResponse, setTechnicalResponse] = useState<unknown>(null);
  const [cardholderName, setCardholderName] = useState("");
  const [cardComplete, setCardComplete] = useState(false);
  const [encryptedCard, setEncryptedCard] =
    useState<EncryptedCardDetails | null>(null);
  const [cardPreview, setCardPreview] = useState<CardPreview | null>(null);
  const [evervaultLoadError, setEvervaultLoadError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const rawCart = localStorage.getItem("cart");
    if (rawCart) {
      setCart(JSON.parse(rawCart));
    }

    const storedPayments = loadSavedPaymentMethods();
    setSavedPayments(storedPayments);
    if (storedPayments.length > 0) {
      setSelectedSavedPaymentId(storedPayments[0].id);
    }
  }, []);

  useEffect(() => {
    if (activeProcessor !== "stripe" && checkoutMode === "stripe_spt") {
      setCheckoutMode("card");
    }
  }, [activeProcessor, checkoutMode]);

  const total = cart.reduce((sum, entry) => {
    const product = products.find((candidate) => candidate.sku === entry.sku);
    return sum + (product ? getProductEffectivePriceCents(product) * entry.quantity : 0);
  }, 0);

  function persistTransactionHistory(payload: unknown, currency: string) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const result = payload as CheckoutCompleteResponse;
    if (result.processor !== "aci" && result.processor !== "stripe") {
      return;
    }

    const entryBase: Omit<RecentTransactionEntry, "history_id"> = {
      status: result.status === "completed" ? "completed" : "failed",
      order_id: result.order_id,
      merchant_transaction_id: result.merchant_transaction_id,
      psp_transaction_id: result.psp_transaction_id,
      processor: result.processor as PSPName,
      payment_flow: result.payment_flow,
      payment_metrics: result.payment_metrics,
      result_code: result.result_code,
      result_description:
        result.result_description ?? result.message ?? result.error,
      amount_total_cents: total,
      currency,
      items: resolveCartItems(cart, products),
      recorded_at: Date.now(),
    };

    addTransactionHistoryEntry({
      ...entryBase,
      history_id: createTransactionHistoryId(entryBase),
    });
  }

  function handleCardUpdate(payload: CardPayload) {
    const preview = {
      brand: payload.card.brand,
      lastFour: payload.card.lastFour,
      name: payload.card.name,
    };

    setCardPreview(
      preview.brand || preview.lastFour || preview.name ? preview : null,
    );

    const isReady = payload.isComplete && payload.isValid;
    setCardComplete(isReady);

    if (!isReady) {
      setEncryptedCard(null);
      return;
    }

    const number = payload.card.number;
    const month = payload.card.expiry.month;
    const year = payload.card.expiry.year;
    const cvc = payload.card.cvc;

    if (!number || !month || !year || !cvc) {
      setEncryptedCard(null);
      return;
    }

    setEncryptedCard({
      card_number: number,
      expiry_month: month,
      expiry_year: year,
      cvv: cvc,
    });
  }

  function buildPaymentMethod(): PaymentMethod {
    if (checkoutMode === "card") {
      if (!EVERVAULT_CONFIGURED) {
        throw new Error(
          "Evervault is not configured. Set NEXT_PUBLIC_EVERVAULT_TEAM_ID and NEXT_PUBLIC_EVERVAULT_APP_ID.",
        );
      }
      if (evervaultLoadError) {
        throw new Error("Evervault UI Components failed to load.");
      }
      if (!cardComplete || !encryptedCard) {
        throw new Error("Enter valid card details before submitting.");
      }

      return {
        type: "card",
        card_number: encryptedCard.card_number,
        expiry_month: encryptedCard.expiry_month,
        expiry_year: encryptedCard.expiry_year,
        cvv: encryptedCard.cvv,
        card_holder: cardholderName.trim() || cardPreview?.name || undefined,
      };
    }

    if (checkoutMode === "saved_evervault") {
      const savedPayment = savedPayments.find(
        (record) => record.id === selectedSavedPaymentId,
      );

      if (!savedPayment) {
        throw new Error(
          "Select a saved Evervault payment payload before submitting.",
        );
      }

      return savedPayment.payment_method;
    }

    if (activeProcessor !== "stripe") {
      throw new Error(
        "Delegated Stripe tokens are only available when ACTIVE_PSP=stripe.",
      );
    }

    const token = delegatedStripeToken.trim();
    if (!token) {
      throw new Error("Enter a delegated Stripe token before submitting.");
    }

    return delegatedTokenMode === "payment_method_id"
      ? {
          type: "stripe_spt",
          payment_method_id: token,
        }
      : {
          type: "stripe_spt",
          confirmation_token: token,
        };
  }

  function rememberCurrentEncryptedCard() {
    if (!encryptedCard) {
      return;
    }

    const savedPaymentId = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: SavedEvervaultPaymentRecord = {
      id: savedPaymentId,
      created_at: Date.now(),
      brand: cardPreview?.brand ?? null,
      last_four: cardPreview?.lastFour ?? null,
      cardholder_name: cardholderName.trim() || cardPreview?.name || null,
      payment_method: {
        type: "saved_evervault",
        saved_payment_id: savedPaymentId,
        card_number: encryptedCard.card_number,
        expiry_month: encryptedCard.expiry_month,
        expiry_year: encryptedCard.expiry_year,
        cvv: encryptedCard.cvv,
        card_holder: cardholderName.trim() || cardPreview?.name || undefined,
      },
    };

    const updatedRecords = addSavedPaymentMethod(record);
    setSavedPayments(updatedRecords);
    setSelectedSavedPaymentId(record.id);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setTechnicalResponse(null);

    try {
      if (!ACP_CONFIGURED) {
        throw new Error(
          "ACP auth is not configured. Set NEXT_PUBLIC_ACP_API_KEY.",
        );
      }

      const paymentMethod = buildPaymentMethod();

      const sessionResp = await fetch("/api/checkout_sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "API-Version": ACP_LATEST_API_VERSION,
          Authorization: `Bearer ${ACP_API_KEY}`,
        },
        body: JSON.stringify({ items: cart }),
      });

      const sessionPayload = await readApiResponse(sessionResp);

      if (!sessionResp.ok) {
        const data = sessionPayload as SessionErrorResponse;
        throw new Error(data.error ?? "Failed to create session");
      }

      const session = sessionPayload as SessionCreateResponse;
      const sessionCurrency = session.currency ?? products[0]?.currency ?? "USD";

      if (!session.id) {
        throw new Error("Checkout session was created without an id");
      }

      const completeResp = await fetch(
        `/api/checkout_sessions/${session.id}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "API-Version": ACP_LATEST_API_VERSION,
            "Idempotency-Key": `idem_${Date.now()}`,
            Authorization: `Bearer ${ACP_API_KEY}`,
          },
          body: JSON.stringify({
            payment_method: paymentMethod,
          }),
        },
      );

      const resultPayload = await readApiResponse(completeResp);
      setTechnicalResponse(resultPayload);
      persistTransactionHistory(resultPayload, sessionCurrency);

      if (!completeResp.ok) {
        throw new Error(
          getResponseMessage(
            resultPayload,
            `Checkout request failed with HTTP ${completeResp.status}`,
          ),
        );
      }

      const result = resultPayload as CheckoutCompleteResponse;

      if (result.status === "completed" && result.order_id) {
        if (checkoutMode === "card" && rememberEncryptedCard) {
          rememberCurrentEncryptedCard();
        }

        localStorage.removeItem("cart");
        const confirmationParams = new URLSearchParams({
          order_id: result.order_id,
        });

        if (result.processor) {
          confirmationParams.set("processor", result.processor);
        }
        if (result.payment_flow) {
          confirmationParams.set("payment_flow", result.payment_flow);
        }
        if (result.merchant_transaction_id) {
          confirmationParams.set(
            "merchant_transaction_id",
            result.merchant_transaction_id,
          );
        }
        if (result.psp_transaction_id) {
          confirmationParams.set(
            "psp_transaction_id",
            result.psp_transaction_id,
          );
        }
        if (result.result_code) {
          confirmationParams.set("result_code", result.result_code);
        }
        if (result.result_description) {
          confirmationParams.set(
            "result_description",
            result.result_description,
          );
        }
        if (typeof result.amount_total_cents === "number") {
          confirmationParams.set(
            "amount_total_cents",
            String(result.amount_total_cents),
          );
        }
        if (result.currency) {
          confirmationParams.set("currency", result.currency);
        }
        if (typeof result.completed_at === "number") {
          confirmationParams.set("completed_at", String(result.completed_at));
        }
        if (result.status) {
          confirmationParams.set("status", result.status);
        }

        router.push(`/confirmation?${confirmationParams.toString()}`);
      } else if (result.status === "completed") {
        throw new Error("Payment completed but no order id was returned");
      } else {
        throw new Error(
          result.message ?? result.result_description ?? "Payment failed",
        );
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function renderPaymentModeTabs() {
    const options: Array<{ mode: CheckoutMode; label: string; enabled: boolean }> = [
      { mode: "card", label: "New encrypted card", enabled: true },
      {
        mode: "saved_evervault",
        label: "Saved Evervault payload",
        enabled: savedPayments.length > 0,
      },
    ];

    if (activeProcessor === "stripe") {
      options.push({
        mode: "stripe_spt",
        label: "Delegated Stripe token",
        enabled: true,
      });
    }

    return (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={!option.enabled}
            onClick={() => setCheckoutMode(option.mode)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              checkoutMode === option.mode
                ? "bg-[var(--color-green-dark)] text-[var(--color-cream)]"
                : "bg-gray-100 text-[var(--color-green-dark)] hover:bg-gray-200"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  function renderCardEntry() {
    return (
      <>
        <p className="text-xs text-gray-500">
          Card details are encrypted in the browser by Evervault before they are submitted.
        </p>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--color-brown)]">
            Cardholder name
          </span>
          <input
            type="text"
            value={cardholderName}
            onChange={(event) => setCardholderName(event.target.value)}
            placeholder="Alex Onion"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
          />
        </label>
        <div className="rounded-xl">
          <EvervaultProvider
            appId={EVERVAULT_APP_ID}
            teamId={EVERVAULT_TEAM_ID}
            onLoadError={() => setEvervaultLoadError(true)}
          >
            <Card
              theme={EVERVAULT_CARD_THEME}
              onChange={handleCardUpdate}
              onComplete={handleCardUpdate}
              onError={() => setEvervaultLoadError(true)}
              autoFocus
            />
          </EvervaultProvider>
        </div>
        {!cardComplete && (
          <p className="text-xs text-amber-700">
            Enter complete card details to continue.
          </p>
        )}
        <label className="flex items-center gap-3 rounded-lg bg-[var(--color-cream)] p-3 text-sm text-[var(--color-brown)]">
          <input
            type="checkbox"
            checked={rememberEncryptedCard}
            onChange={(event) => setRememberEncryptedCard(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-brown)]/30"
          />
          Save this Evervault-encrypted payload for a later demo checkout on this device.
        </label>
      </>
    );
  }

  function renderSavedPayments() {
    if (savedPayments.length === 0) {
      return (
        <p className="text-sm text-gray-500">
          No saved Evervault payment payloads are available on this device yet.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          This reuses the Evervault-encrypted card payload directly, not a PSP-native token.
        </p>
        {savedPayments.map((record) => (
          <label
            key={record.id}
            className={`block rounded-xl border p-4 transition ${
              selectedSavedPaymentId === record.id
                ? "border-[var(--color-green-dark)] bg-[var(--color-cream)]"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="saved-payment"
                checked={selectedSavedPaymentId === record.id}
                onChange={() => setSelectedSavedPaymentId(record.id)}
                className="mt-1 h-4 w-4"
              />
              <div className="space-y-1">
                <p className="font-medium text-[var(--color-green-dark)]">
                  {formatSavedPaymentLabel(record)}
                </p>
                <p className="text-xs text-gray-500">
                  Saved {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(record.created_at)}
                </p>
                {record.cardholder_name && (
                  <p className="text-xs text-gray-500">
                    Cardholder name: {record.cardholder_name}
                  </p>
                )}
              </div>
            </div>
          </label>
        ))}
      </div>
    );
  }

  function renderDelegatedStripeToken() {
    return (
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Agent-oriented path for a delegated Stripe token. This only succeeds when the server is routing to Stripe.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDelegatedTokenMode("confirmation_token")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              delegatedTokenMode === "confirmation_token"
                ? "bg-[var(--color-amber-dark)] text-white"
                : "bg-gray-100 text-[var(--color-green-dark)] hover:bg-gray-200"
            }`}
          >
            Confirmation token
          </button>
          <button
            type="button"
            onClick={() => setDelegatedTokenMode("payment_method_id")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              delegatedTokenMode === "payment_method_id"
                ? "bg-[var(--color-amber-dark)] text-white"
                : "bg-gray-100 text-[var(--color-green-dark)] hover:bg-gray-200"
            }`}
          >
            PaymentMethod ID
          </button>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--color-brown)]">
            {delegatedTokenMode === "confirmation_token"
              ? "Stripe confirmation token"
              : "Stripe PaymentMethod ID"}
          </span>
          <textarea
            value={delegatedStripeToken}
            onChange={(event) => setDelegatedStripeToken(event.target.value)}
            rows={4}
            placeholder={
              delegatedTokenMode === "confirmation_token"
                ? "ctoken_..."
                : "pm_..."
            }
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
          />
        </label>
      </div>
    );
  }

  function isSubmitDisabled() {
    if (submitting || !ACP_CONFIGURED) {
      return true;
    }

    if (checkoutMode === "card") {
      return (
        !EVERVAULT_CONFIGURED ||
        evervaultLoadError ||
        !cardComplete ||
        !encryptedCard
      );
    }

    if (checkoutMode === "saved_evervault") {
      return selectedSavedPaymentId.length === 0;
    }

    if (activeProcessor !== "stripe") {
      return true;
    }

    return delegatedStripeToken.trim().length === 0;
  }

  if (cart.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8">
        Your cart is empty. Nothing to check out.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-3">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {cart.map((entry) => {
            const product = products.find((candidate) => candidate.sku === entry.sku);
            return (
              <li key={entry.sku} className="flex justify-between">
                <span>
                  {product?.name ?? entry.sku} x {entry.quantity}
                </span>
                <span>
                  ${product ? formatProductPrice(getProductEffectivePriceCents(product) * entry.quantity) : "?"}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="border-t mt-3 pt-3 flex justify-between font-bold">
          <span>Total</span>
          <span className="text-[var(--color-amber-dark)]">
            ${(total / 100).toFixed(2)}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">Payment details</h2>
          <p className="text-sm text-gray-500">
            Active processor: {formatActiveProcessorLabel(activeProcessor)}
          </p>
          {renderPaymentModeTabs()}
        </div>

        {checkoutMode === "card" &&
          (EVERVAULT_CONFIGURED ? (
            renderCardEntry()
          ) : (
            <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
              Evervault is not configured. Add NEXT_PUBLIC_EVERVAULT_TEAM_ID and NEXT_PUBLIC_EVERVAULT_APP_ID.
            </p>
          ))}

        {checkoutMode === "saved_evervault" && renderSavedPayments()}

        {checkoutMode === "stripe_spt" && renderDelegatedStripeToken()}

        {evervaultLoadError && checkoutMode === "card" && (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
            Evervault UI Components failed to load. Please refresh and try again.
          </p>
        )}
        {!ACP_CONFIGURED && (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
            ACP auth is not configured. Add NEXT_PUBLIC_ACP_API_KEY.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {technicalResponse !== null && technicalResponse !== undefined && (
        <div className="bg-slate-950 text-slate-100 p-4 rounded-lg text-xs overflow-x-auto">
          <p className="font-semibold mb-2">Technical response</p>
          <pre className="whitespace-pre-wrap break-all font-mono">
            {formatTechnicalResponse(technicalResponse)}
          </pre>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitDisabled()}
        className="w-full py-3 rounded-lg font-semibold text-white bg-[var(--color-green-dark)] hover:bg-[var(--color-green-mid)] transition-colors disabled:opacity-60"
      >
        {submitting ? "Processing..." : `Pay $${(total / 100).toFixed(2)}`}
      </button>
    </form>
  );
}