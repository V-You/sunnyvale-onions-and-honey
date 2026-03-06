import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { getAllProducts } from "@/lib/catalog";

export default function Home() {
  const products = getAllProducts();
  const featured = products.filter((p) => p.gift_score >= 4).slice(0, 6);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      {/* hero */}
      <section className="bg-[var(--color-green-dark)] text-[var(--color-cream)] py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
            Root access to your produce
          </h1>
          <p className="text-xl opacity-80 mb-8 max-w-2xl mx-auto">
            Boutique onions and specialty honey from Sunnyvale. Bot-to-table fresh. Ag-entic commerce ready.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/products"
              className="px-8 py-3 rounded-lg font-semibold bg-[var(--color-amber)] text-[var(--color-green-dark)] hover:bg-[var(--color-amber-dark)] hover:text-white transition-colors"
            >
              Shop now
            </Link>
            <a
              href="/.well-known/acp.json"
              className="px-8 py-3 rounded-lg font-semibold border border-current opacity-70 hover:opacity-100 transition-opacity"
            >
              ACP manifest
            </a>
          </div>
        </div>
      </section>

      {/* value props */}
      <section className="py-16 px-6 bg-[var(--color-cream)]">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl mb-3">&#x1F512;</div>
            <h3 className="font-bold mb-2">You own your data</h3>
            <p className="text-sm text-gray-600">
              Card data encrypted with Evervault. You hold the tokens -- not locked into any PSP vault.
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-3">&#x1F504;</div>
            <h3 className="font-bold mb-2">Switch PSPs instantly</h3>
            <p className="text-sm text-gray-600">
              ACI or Stripe -- change a config, redeploy. Same encrypted tokens work with both.
            </p>
          </div>
          <div className="text-center">
            <div className="text-3xl mb-3">&#x1F916;</div>
            <h3 className="font-bold mb-2">Agent-friendly</h3>
            <p className="text-sm text-gray-600">
              AI shopping agents discover and buy via ACP. Your shop speaks human and machine.
            </p>
          </div>
        </div>
      </section>

      {/* featured products */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">
            Gift-worthy picks
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((product) => (
              <ProductCard key={product.sku} product={product} />
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/products"
              className="text-[var(--color-amber-dark)] font-semibold hover:underline"
            >
              View all 24 products &rarr;
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
