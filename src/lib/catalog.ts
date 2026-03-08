import type { Product } from "./types";

// generated from Tina-managed content/products/*.json files
import products from "@/content/products.generated";

export function getAllProducts(): Product[] {
  return products as Product[];
}

export function getProductBySku(sku: string): Product | undefined {
  return getAllProducts().find((p) => p.sku === sku);
}

export function getProductsByCategory(
  category: "onion" | "honey",
): Product[] {
  return getAllProducts().filter((p) => p.category === category);
}
