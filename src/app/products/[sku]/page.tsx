import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddToCartButton from "@/components/AddToCartButton";
import ProductImage from "@/components/ProductImage";
import { getProductBySku } from "@/lib/catalog";
import {
  formatProductPrice,
  getProductEffectivePriceCents,
  getProductSalePercentOff,
  isProductOnSale,
} from "@/lib/product-pricing";
import type { Metadata } from "next";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ sku: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sku } = await params;
  const product = getProductBySku(sku);
  if (!product) return {};
  return {
    title: `${product.name} -- Sunnyvale Onions & Honey`,
    description: product.description,
  };
}

export default async function ProductDetailPage({ params }: Props) {
  const { sku } = await params;
  const product = getProductBySku(sku);
  if (!product) notFound();

  const effectivePriceFormatted = formatProductPrice(
    getProductEffectivePriceCents(product),
  );
  const basePriceFormatted = formatProductPrice(product.price_cents);
  const onSale = isProductOnSale(product);
  const salePercentOff = getProductSalePercentOff(product);

  // JSON-LD for search engines and agents
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    offers: {
      "@type": "Offer",
        price: effectivePriceFormatted,
      priceCurrency: product.currency,
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    brand: { "@type": "Brand", name: "Sunnyvale Onions & Honey" },
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-10">
            <ProductImage
              src={product.image_url}
              alt={product.name}
              category={product.category}
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="aspect-square rounded-2xl bg-gradient-to-br from-amber-50 to-green-50"
              imageClassName="h-full w-full object-contain p-6"
            />

            {/* product info */}
            <div>
              <span className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                {product.category}
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                {onSale && (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-amber-dark)]">
                    On sale - {salePercentOff}% off
                  </span>
                )}
                {!product.in_stock && (
                  <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                    Out of stock
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold mt-1 mb-2">{product.name}</h1>
              <p className="text-[var(--color-amber-dark)] italic mb-4">
                {product.short_tagline}
              </p>
              <p className="text-gray-600 mb-6">{product.description}</p>

              <div className="mb-6 flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[var(--color-amber-dark)]">
                  ${effectivePriceFormatted}
                </span>
                {onSale && (
                  <span className="text-lg text-gray-400 line-through">
                    ${basePriceFormatted}
                  </span>
                )}
              </div>

              {/* attributes */}
              <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                <div>
                  <span className="text-gray-500">Color:</span>{" "}
                  <span className="font-medium">{product.color}</span>
                </div>
                <div>
                  <span className="text-gray-500">Intensity:</span>{" "}
                  <span className="font-medium">{product.intensity}/5</span>
                </div>
                <div>
                  <span className="text-gray-500">Gift score:</span>{" "}
                  <span className="font-medium">{product.gift_score}/5</span>
                </div>
                <div>
                  <span className="text-gray-500">Weight:</span>{" "}
                  <span className="font-medium">{product.weight_grams}g</span>
                </div>
              </div>

              {/* flavor profile */}
              <div className="mb-6">
                <span className="text-sm text-gray-500">Flavor:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {product.flavor_profile.map((f) => (
                    <span
                      key={f}
                      className="text-xs px-2 py-1 rounded-full bg-amber-50 text-[var(--color-brown)]"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* tags */}
              <div className="mb-8">
                <span className="text-sm text-gray-500">Tags:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {product.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <AddToCartButton product={product} />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
