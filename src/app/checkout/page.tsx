import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CheckoutForm from "@/components/CheckoutForm";
import { getAllProducts } from "@/lib/catalog";

export default function CheckoutPage() {
  const products = getAllProducts();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-bold mb-8">Checkout</h1>
          <CheckoutForm products={products} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
