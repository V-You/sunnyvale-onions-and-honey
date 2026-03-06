"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

interface CartEntry {
  sku: string;
  quantity: number;
}

export default function CheckoutForm({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const total = cart.reduce((sum, entry) => {
    const product = products.find((p) => p.sku === entry.sku);
    return sum + (product ? product.price_cents * entry.quantity : 0);
  }, 0);

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

      // step 2: get card data from form
      // in production, this would be Evervault-encrypted ev:ct:xxx tokens
      // for demo, we read plain test card values from the form
      const form = e.currentTarget;
      const formData = new FormData(form);

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
              card_number: formData.get("card_number"),
              expiry_month: formData.get("expiry_month"),
              expiry_year: formData.get("expiry_year"),
              cvv: formData.get("cvv"),
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
      {/* in production, this section would be replaced by Evervault UI Components */}
      <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-lg">Payment details</h2>
        <p className="text-xs text-gray-400">
          Demo mode -- enter test card numbers. In production, Evervault UI Components encrypt card data in the browser.
        </p>
        <div>
          <label htmlFor="card_number" className="block text-sm font-medium mb-1">Card number</label>
          <input
            id="card_number"
            name="card_number"
            type="text"
            required
            placeholder="4200000000000000"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="expiry_month" className="block text-sm font-medium mb-1">Month</label>
            <input
              id="expiry_month"
              name="expiry_month"
              type="text"
              required
              placeholder="12"
              maxLength={2}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="expiry_year" className="block text-sm font-medium mb-1">Year</label>
            <input
              id="expiry_year"
              name="expiry_year"
              type="text"
              required
              placeholder="2028"
              maxLength={4}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cvv" className="block text-sm font-medium mb-1">CVV</label>
            <input
              id="cvv"
              name="cvv"
              type="text"
              required
              placeholder="123"
              maxLength={4}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg font-semibold text-white bg-[var(--color-green-dark)] hover:bg-[var(--color-green-mid)] transition-colors disabled:opacity-60"
      >
        {submitting ? "Processing..." : `Pay $${(total / 100).toFixed(2)}`}
      </button>
    </form>
  );
}
