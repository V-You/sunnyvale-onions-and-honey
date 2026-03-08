import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  const priceFormatted = (product.price_cents / 100).toFixed(2);

  return (
    <Link
      href={`/products/${product.sku}`}
      className="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      <ProductImage
        src={product.image_url}
        alt={product.name}
        category={product.category}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="aspect-square bg-gradient-to-br from-amber-50 to-green-50"
        imageClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="p-4">
        <h3 className="font-semibold text-[var(--color-green-dark)] group-hover:text-[var(--color-amber-dark)] transition-colors">
          {product.name}
        </h3>
        <p className="text-sm text-gray-500 mt-1 line-clamp-1">
          {product.short_tagline}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold text-[var(--color-amber-dark)]">
            ${priceFormatted}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
            {product.category}
          </span>
        </div>
      </div>
    </Link>
  );
}
