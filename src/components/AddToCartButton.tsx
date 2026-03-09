"use client";

import { useState } from "react";
import { addCartItem } from "@/lib/cart";
import type { Product } from "@/lib/types";

export default function AddToCartButton({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);

  function handleAdd() {
    addCartItem(product.sku);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      onClick={handleAdd}
      className="w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors bg-[var(--color-amber-dark)] hover:bg-[var(--color-amber)] disabled:opacity-60"
      disabled={!product.in_stock}
    >
      {!product.in_stock
        ? "Out of stock"
        : added
          ? "Added!"
          : "Add to cart"}
    </button>
  );
}
