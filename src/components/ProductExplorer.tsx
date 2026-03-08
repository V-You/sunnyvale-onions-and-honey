"use client";

import { startTransition, useDeferredValue, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { getProductEffectivePriceCents } from "@/lib/product-pricing";
import type { Product } from "@/lib/types";

type CategoryFilter = "all" | "onion" | "honey";
type SortMode =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "gift-desc"
  | "intensity-desc";

const PRICE_FILTERS = [
  { label: "Any price", value: "all" },
  { label: "Up to $8", value: "800" },
  { label: "Up to $15", value: "1500" },
  { label: "Up to $25", value: "2500" },
  { label: "Up to $50", value: "5000" },
] as const;

export default function ProductExplorer({ products }: { products: Product[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [minimumGiftScore, setMinimumGiftScore] = useState(0);
  const [priceCeiling, setPriceCeiling] = useState<string>("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("featured");

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchableText = deferredSearchQuery.trim().toLowerCase();
  const availableTags = Array.from(
    new Set(products.flatMap((product) => product.tags)),
  ).sort();

  const filteredProducts = [...products]
    .filter((product) => {
      if (category !== "all" && product.category !== category) {
        return false;
      }

      if (selectedTag !== "all" && !product.tags.includes(selectedTag)) {
        return false;
      }

      if (minimumGiftScore > 0 && product.gift_score < minimumGiftScore) {
        return false;
      }

      if (
        priceCeiling !== "all" &&
        getProductEffectivePriceCents(product) > Number(priceCeiling)
      ) {
        return false;
      }

      if (inStockOnly && !product.in_stock) {
        return false;
      }

      if (!searchableText) {
        return true;
      }

      const haystack = [
        product.name,
        product.short_tagline,
        product.description,
        product.category,
        product.color,
        ...product.tags,
        ...product.flavor_profile,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(searchableText);
    })
    .sort((left, right) => {
      switch (sortMode) {
        case "price-asc":
          return getProductEffectivePriceCents(left) - getProductEffectivePriceCents(right);
        case "price-desc":
          return getProductEffectivePriceCents(right) - getProductEffectivePriceCents(left);
        case "gift-desc":
          return right.gift_score - left.gift_score || getProductEffectivePriceCents(right) - getProductEffectivePriceCents(left);
        case "intensity-desc":
          return right.intensity - left.intensity || getProductEffectivePriceCents(right) - getProductEffectivePriceCents(left);
        case "featured":
        default:
          return right.gift_score - left.gift_score || getProductEffectivePriceCents(left) - getProductEffectivePriceCents(right);
      }
    });

  const activeFilterCount = [
    category !== "all",
    selectedTag !== "all",
    minimumGiftScore > 0,
    priceCeiling !== "all",
    inStockOnly,
    searchableText.length > 0,
    sortMode !== "featured",
  ].filter(Boolean).length;

  function resetFilters() {
    startTransition(() => {
      setSearchQuery("");
      setCategory("all");
      setSelectedTag("all");
      setMinimumGiftScore(0);
      setPriceCeiling("all");
      setInStockOnly(false);
      setSortMode("featured");
    });
  }

  return (
    <div className="space-y-10">
      <section className="rounded-[2rem] border border-[var(--color-green-dark)]/10 bg-white/90 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-brown-light)]">
              SUNNYVALE ONIONS &amp; HONEY SHOP
            </p>
            <h1 className="text-4xl font-bold tracking-tight">HA produce shop</h1>
            <p className="text-[var(--color-brown)]">
              Low latency shipping. All products are shipped in a single, lightweight, and portable "container".
            </p>
          </div>

          <div className="rounded-2xl bg-[var(--color-green-dark)] px-5 py-4 text-[var(--color-cream)] shadow-sm xl:max-w-xs">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-amber)]">
              Active filters
            </p>
            <p className="mt-2 text-3xl font-bold">{activeFilterCount}</p>
            <p className="mt-2 text-sm text-[var(--color-cream)]/75">
              {filteredProducts.length} products currently match your criteria.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-brown)]">Search by name, flavor, tag, or color</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                const nextValue = event.target.value;
                startTransition(() => setSearchQuery(nextValue));
              }}
              placeholder="Try ‘gift-box’, ‘dark’, or ‘smoky’"
              className="w-full rounded-2xl border border-[var(--color-brown)]/15 bg-[var(--color-cream)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-brown)]">Sort by</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="w-full rounded-2xl border border-[var(--color-brown)]/15 bg-[var(--color-cream)] px-4 py-3 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
            >
              <option value="featured">Featured first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="gift-desc">Gift score</option>
              <option value="intensity-desc">Intensity</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <div className="space-y-3 rounded-2xl bg-[var(--color-cream)] p-4">
            <p className="text-sm font-medium text-[var(--color-brown)]">Category</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["all", "Everything"],
                ["onion", "Onions"],
                ["honey", "Honey"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    category === value
                      ? "bg-[var(--color-green-dark)] text-[var(--color-cream)]"
                      : "bg-white text-[var(--color-green-dark)] hover:bg-[var(--color-green-dark)]/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="space-y-3 rounded-2xl bg-[var(--color-cream)] p-4">
            <span className="text-sm font-medium text-[var(--color-brown)]">Price ceiling</span>
            <select
              value={priceCeiling}
              onChange={(event) => setPriceCeiling(event.target.value)}
              className="w-full rounded-xl border border-[var(--color-brown)]/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
            >
              {PRICE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-3 rounded-2xl bg-[var(--color-cream)] p-4">
            <span className="text-sm font-medium text-[var(--color-brown)]">Minimum gift score</span>
            <select
              value={String(minimumGiftScore)}
              onChange={(event) => setMinimumGiftScore(Number(event.target.value))}
              className="w-full rounded-xl border border-[var(--color-brown)]/15 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--color-amber-dark)] focus:ring-2 focus:ring-[var(--color-amber)]/20"
            >
              <option value="0">Any gift score</option>
              <option value="3">3 and up</option>
              <option value="4">4 and up</option>
              <option value="5">Only perfect 5s</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl bg-[var(--color-cream)] p-4 text-sm font-medium text-[var(--color-brown)]">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => setInStockOnly(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--color-brown)]/30 text-[var(--color-green-dark)] focus:ring-[var(--color-amber)]/30"
            />
            Only show in-stock items
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-start gap-3">
          <span className="pt-2 text-sm font-medium text-[var(--color-brown)]">Tag filter</span>
          <button
            type="button"
            onClick={() => setSelectedTag("all")}
            className={`rounded-full px-3 py-2 text-sm transition ${
              selectedTag === "all"
                ? "bg-[var(--color-amber-dark)] text-white"
                : "bg-white text-[var(--color-brown)] hover:bg-[var(--color-brown)]/5"
            }`}
          >
            All tags
          </button>
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`rounded-full px-3 py-2 text-sm transition ${
                selectedTag === tag
                  ? "bg-[var(--color-green-dark)] text-[var(--color-cream)]"
                  : "bg-white text-[var(--color-brown)] hover:bg-[var(--color-brown)]/5"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-green-dark)]/10 pt-6">
          <p className="text-sm text-[var(--color-brown)]">
            Showing <span className="font-semibold text-[var(--color-green-dark)]">{filteredProducts.length}</span> of {products.length} products.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-[var(--color-green-dark)]/15 px-4 py-2 text-sm font-medium text-[var(--color-green-dark)] transition hover:bg-[var(--color-green-dark)]/5"
          >
            Clear filters
          </button>
        </div>
      </section>

      {filteredProducts.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[var(--color-brown)]/20 bg-white/80 px-6 py-16 text-center">
          <p className="text-2xl font-semibold text-[var(--color-green-dark)]">No onions or honey match that combo</p>
          <p className="mt-3 text-[var(--color-brown)]">
            Try loosening the price cap, switching tags, or clearing the search.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <ProductCard key={product.sku} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}