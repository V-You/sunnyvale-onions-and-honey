import type { Product } from "./types";

function normalizeSalePercentOff(product: Product): number {
  const raw = Number(product.sale_percent_off ?? 0);

  if (!product.on_sale || !Number.isFinite(raw) || raw <= 0) {
    return 0;
  }

  return Math.min(95, Math.round(raw));
}

export function isProductOnSale(product: Product): boolean {
  return normalizeSalePercentOff(product) > 0;
}

export function getProductSalePercentOff(product: Product): number {
  return normalizeSalePercentOff(product);
}

export function getProductEffectivePriceCents(product: Product): number {
  const salePercentOff = normalizeSalePercentOff(product);

  if (salePercentOff === 0) {
    return product.price_cents;
  }

  return Math.max(1, Math.round(product.price_cents * (100 - salePercentOff) / 100));
}

export function formatProductPrice(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}