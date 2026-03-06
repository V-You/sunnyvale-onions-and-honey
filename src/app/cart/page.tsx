import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CartView from "@/components/CartView";
import { getAllProducts } from "@/lib/catalog";

export default function CartPage() {
  const products = getAllProducts();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Your cart</h1>
          <CartView products={products} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
