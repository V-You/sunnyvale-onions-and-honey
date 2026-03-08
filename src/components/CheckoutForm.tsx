"use client";

import { useState, useEffect } from "react";
import { Card, EvervaultProvider, type CardPayload } from "@evervault/react";
import { useRouter } from "next/navigation";
import { addTransactionHistoryEntry, createTransactionHistoryId } from "@/lib/transaction-history";
import type { CartItem, Product, PSPName, RecentTransactionEntry } from "@/lib/types";

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
  processor?: string;
  merchant_transaction_id?: string;
  psp_transaction_id?: string;
  result_code?: string;
  result_description?: string;
  response_body?: unknown;
  message?: string;
  error?: string;
  technical_message?: string;
}

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

function resolveCartItems(
  cart: CartEntry[],
  products: Product[],
): CartItem[] {
  return cart.map((entry) => {
    const product = products.find((candidate) => candidate.sku === entry.sku);

    return {
      sku: entry.sku,
      name: product?.name ?? entry.sku,
      quantity: entry.quantity,
      price_cents: product?.price_cents ?? 0,
    };
  });
}

const EVERVAULT_APP_ID = process.env.NEXT_PUBLIC_EVERVAULT_APP_ID ?? "";
const EVERVAULT_TEAM_ID = process.env.NEXT_PUBLIC_EVERVAULT_TEAM_ID ?? "";
const ACP_API_KEY = process.env.NEXT_PUBLIC_ACP_API_KEY ?? "";
const EVERVAULT_CONFIGURED =
  EVERVAULT_APP_ID.length > 0 && EVERVAULT_TEAM_ID.length > 0;
const ACP_CONFIGURED = ACP_API_KEY.length > 0;

export default function CheckoutForm({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicalResponse, setTechnicalResponse] = useState<unknown>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [encryptedCard, setEncryptedCard] =
    useState<EncryptedCardDetails | null>(null);
  const [evervaultLoadError, setEvervaultLoadError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const total = cart.reduce((sum, entry) => {
    const product = products.find((p) => p.sku === entry.sku);
    return sum + (product ? product.price_cents * entry.quantity : 0);
  }, 0);

  function persistTransactionHistory(
    payload: unknown,
    currency: string,
  ) {
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setTechnicalResponse(null);

    try {
      // step 1: create checkout session
      if (!ACP_CONFIGURED) {
        throw new Error(
          "ACP auth is not configured. Set NEXT_PUBLIC_ACP_API_KEY.",
        );
      }

      const sessionResp = await fetch("/api/checkout_sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

      // step 3: complete checkout
      const completeResp = await fetch(
        `/api/checkout_sessions/${session.id}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `idem_${Date.now()}`,
            Authorization: `Bearer ${ACP_API_KEY}`,
          },
          body: JSON.stringify({
            payment_method: {
              type: "card",
              card_number: encryptedCard.card_number,
              expiry_month: encryptedCard.expiry_month,
              expiry_year: encryptedCard.expiry_year,
              cvv: encryptedCard.cvv,
            },
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
        localStorage.removeItem("cart");
        const confirmationParams = new URLSearchParams({
          order_id: result.order_id,
        });

        if (result.processor) {
          confirmationParams.set("processor", result.processor);
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

        router.push(`/confirmation?${confirmationParams.toString()}`);
      } else if (result.status === "completed") {
        throw new Error("Payment completed but no order id was returned");
      } else {
        throw new Error(
          result.message ?? result.result_description ?? "Payment failed",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
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
      {/* order summary */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-3">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {cart.map((entry) => {
            const product = products.find((p) => p.sku === entry.sku);
            return (
              <li key={entry.sku} className="flex justify-between">
                <span>
                  {product?.name ?? entry.sku} x {entry.quantity}
                </span>
                <span>
                  ${product ? ((product.price_cents * entry.quantity) / 100).toFixed(2) : "?"}
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

      {/* card fields */}
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-lg">Payment details</h2>
        {EVERVAULT_CONFIGURED ? (
          <>
            <p className="text-xs text-gray-500">
              Card details are encrypted in the browser by Evervault before they
              are submitted.
            </p>
            <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
              <EvervaultProvider
                appId={EVERVAULT_APP_ID}
                teamId={EVERVAULT_TEAM_ID}
                onLoadError={() => setEvervaultLoadError(true)}
              >
                <Card
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
          </>
        ) : (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">
            Evervault is not configured. Add
            {" "}NEXT_PUBLIC_EVERVAULT_TEAM_ID and
            {" "}NEXT_PUBLIC_EVERVAULT_APP_ID.
          </p>
        )}
        {evervaultLoadError && (
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
        disabled={
          submitting ||
          !EVERVAULT_CONFIGURED ||
          !ACP_CONFIGURED ||
          evervaultLoadError ||
          !cardComplete ||
          !encryptedCard
        }
        className="w-full py-3 rounded-lg font-semibold text-white bg-[var(--color-green-dark)] hover:bg-[var(--color-green-mid)] transition-colors disabled:opacity-60"
      >
        {submitting
          ? "Processing..."
          : `Pay $${(total / 100).toFixed(2)}`}
      </button>
    </form>
  );
}
