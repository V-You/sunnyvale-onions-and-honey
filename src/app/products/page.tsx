import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { getAllProducts } from "@/lib/catalog";

export default function ProductsPage() {
  const products = getAllProducts();
  const onions = products.filter((p) => p.category === "onion");
  const honey = products.filter((p) => p.category === "honey");

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-10">The silly 24</h1>

          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 text-[var(--color-brown)]">
              Onions
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {onions.map((product) => (
                <ProductCard key={product.sku} product={product} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-6 text-[var(--color-amber-dark)]">
              Honey
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {honey.map((product) => (
                <ProductCard key={product.sku} product={product} />
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
