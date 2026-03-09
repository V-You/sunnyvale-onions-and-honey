"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CART_STORAGE_KEY,
  CART_UPDATED_EVENT,
  getCartItemCount,
} from "@/lib/cart";

function formatCartCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export default function CartLink() {
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    function refreshCount() {
      setItemCount(getCartItemCount());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && event.key !== CART_STORAGE_KEY) {
        return;
      }

      refreshCount();
    }

    refreshCount();
    window.addEventListener(CART_UPDATED_EVENT, refreshCount as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        CART_UPDATED_EVENT,
        refreshCount as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <Link
      href="/cart"
      aria-label={
        itemCount > 0 ? `Cart with ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Cart"
      }
      className="flex items-center gap-2 hover:text-[var(--color-amber)] transition-colors"
    >
      <span>Cart</span>
      {itemCount > 0 && (
        <span className="min-w-5 rounded-full bg-[var(--color-amber-dark)] px-1.5 py-0.5 text-center text-xs font-bold leading-none text-white">
          {formatCartCount(itemCount)}
        </span>
      )}
    </Link>
  );
}