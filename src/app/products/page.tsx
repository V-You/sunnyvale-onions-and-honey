import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductExplorer from "@/components/ProductExplorer";
import { getAllProducts } from "@/lib/catalog";

export default function ProductsPage() {
  const products = getAllProducts();

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <ProductExplorer products={products} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
