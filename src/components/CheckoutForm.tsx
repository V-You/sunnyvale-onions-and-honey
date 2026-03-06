"use client";

import { useState, useEffect } from "react";
import { Card, EvervaultProvider, type CardPayload } from "@evervault/react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

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

const EVERVAULT_APP_ID = process.env.NEXT_PUBLIC_EVERVAULT_APP_ID ?? "";
const EVERVAULT_TEAM_ID = process.env.NEXT_PUBLIC_EVERVAULT_TEAM_ID ?? "";
const EVERVAULT_CONFIGURED =
  EVERVAULT_APP_ID.length > 0 && EVERVAULT_TEAM_ID.length > 0;

export default function CheckoutForm({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    try {
      // step 1: create checkout session
      const sessionResp = await fetch("/api/checkout_sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
      });

      if (!sessionResp.ok) {
        const data = await sessionResp.json();
        throw new Error(data.error ?? "Failed to create session");
      }

      const session = await sessionResp.json();

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

      const result = await completeResp.json();

      if (result.status === "completed") {
        localStorage.removeItem("cart");
        router.push(
          `/confirmation?order_id=${encodeURIComponent(result.order_id)}`,
        );
      } else {
        throw new Error(result.message ?? "Payment failed");
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
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={
          submitting ||
          !EVERVAULT_CONFIGURED ||
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
