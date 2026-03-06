import type { Product } from "./types";

// static catalog -- sourced from content/products/ at build time
// in v1 we inline the catalog; TinaCMS integration can be added later
import products from "@/content/products.json";

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
