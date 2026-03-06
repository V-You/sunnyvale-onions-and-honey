"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

interface CartEntry {
  sku: string;
  quantity: number;
}

export default function CartView({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    if (raw) setCart(JSON.parse(raw));
  }, []);

  const save = useCallback((updated: CartEntry[]) => {
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
  }, []);

  function updateQuantity(sku: string, delta: number) {
    const updated = cart
      .map((item) =>
        item.sku === sku ? { ...item, quantity: item.quantity + delta } : item,
      )
      .filter((item) => item.quantity > 0);
    save(updated);
  }

  function removeItem(sku: string) {
    save(cart.filter((item) => item.sku !== sku));
  }

  const resolvedItems = cart.map((entry) => {
    const product = products.find((p) => p.sku === entry.sku);
    return { ...entry, product };
  });

  const total = resolvedItems.reduce(
    (sum, item) =>
      sum + (item.product ? item.product.price_cents * item.quantity : 0),
    0,
  );

  if (cart.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-xl text-gray-500 mb-4">Your cart is empty</p>
        <Link
          href="/products"
          className="text-[var(--color-amber-dark)] font-semibold hover:underline"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4 mb-8">
        {resolvedItems.map((item) => (
          <div
            key={item.sku}
            className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-amber-50 to-green-50 rounded-lg flex items-center justify-center text-2xl shrink-0">
              {item.product?.category === "honey" ? "\u{1F36F}" : "\u{1F9C5}"}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">
                {item.product?.name ?? item.sku}
              </h3>
              <p className="text-sm text-gray-500">
                ${item.product ? (item.product.price_cents / 100).toFixed(2) : "?"} each
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(item.sku, -1)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
              >
                -
              </button>
              <span className="w-8 text-center font-semibold">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.sku, 1)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
            <button
              onClick={() => removeItem(item.sku)}
              className="text-red-400 hover:text-red-600 text-sm ml-2"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-2xl font-bold text-[var(--color-amber-dark)]">
            ${(total / 100).toFixed(2)}
          </span>
        </div>
        <button
          onClick={() => router.push("/checkout")}
          className="w-full py-3 rounded-lg font-semibold text-white bg-[var(--color-green-dark)] hover:bg-[var(--color-green-mid)] transition-colors"
        >
          Proceed to checkout
        </button>
      </div>
    </div>
  );
}
