export interface StoredCartEntry {
  sku: string;
  quantity: number;
}

export const CART_STORAGE_KEY = "cart";
export const CART_UPDATED_EVENT = "cart:updated";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStoredCartEntry(value: unknown): value is StoredCartEntry {
  return (
    isRecord(value) &&
    typeof value.sku === "string" &&
    typeof value.quantity === "number" &&
    Number.isFinite(value.quantity)
  );
}

function normalizeCartEntries(entries: StoredCartEntry[]): StoredCartEntry[] {
  const quantitiesBySku = new Map<string, number>();

  entries.forEach((entry) => {
    const sku = entry.sku.trim();
    const quantity = Math.trunc(entry.quantity);

    if (!sku || quantity < 1) {
      return;
    }

    quantitiesBySku.set(sku, (quantitiesBySku.get(sku) ?? 0) + quantity);
  });

  return [...quantitiesBySku.entries()].map(([sku, quantity]) => ({
    sku,
    quantity,
  }));
}

function dispatchCartUpdated(entries: StoredCartEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(CART_UPDATED_EVENT, {
      detail: entries,
    }),
  );
}

export function loadCart(): StoredCartEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = normalizeCartEntries(parsed.filter(isStoredCartEntry));
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [];
  }
}

export function saveCart(entries: StoredCartEntry[]): StoredCartEntry[] {
  const normalized = normalizeCartEntries(entries);

  if (typeof window !== "undefined") {
    if (normalized.length === 0) {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    } else {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
    }
    dispatchCartUpdated(normalized);
  }

  return normalized;
}

export function addCartItem(sku: string, quantity: number = 1): StoredCartEntry[] {
  const cart = loadCart();
  const existing = cart.find((item) => item.sku === sku);

  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ sku, quantity });
  }

  return saveCart(cart);
}

export function clearCart() {
  saveCart([]);
}

export function getCartItemCount(entries?: StoredCartEntry[]): number {
  const cart = entries ?? loadCart();
  return cart.reduce((sum, entry) => sum + entry.quantity, 0);
}