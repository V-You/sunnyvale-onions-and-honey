import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddToCartButton from "@/components/AddToCartButton";
import { getProductBySku } from "@/lib/catalog";
import type { Metadata } from "next";
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

  const priceFormatted = (product.price_cents / 100).toFixed(2);

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
      price: priceFormatted,
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
            {/* product image placeholder */}
            <div className="aspect-square bg-gradient-to-br from-amber-50 to-green-50 rounded-2xl flex items-center justify-center text-8xl">
              {product.category === "honey" ? "\u{1F36F}" : "\u{1F9C5}"}
            </div>

            {/* product info */}
            <div>
              <span className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                {product.category}
              </span>
              <h1 className="text-3xl font-bold mt-1 mb-2">{product.name}</h1>
              <p className="text-[var(--color-amber-dark)] italic mb-4">
                {product.short_tagline}
              </p>
              <p className="text-gray-600 mb-6">{product.description}</p>

              <div className="text-3xl font-bold text-[var(--color-amber-dark)] mb-6">
                ${priceFormatted}
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
