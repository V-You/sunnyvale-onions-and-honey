import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MetricsDashboard from "@/components/MetricsDashboard";
import { getAllProducts } from "@/lib/catalog";

export default function MetricsPage() {
  const products = getAllProducts();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <MetricsDashboard products={products} />
        </div>
      </main>

      <Footer />
    </div>
  );
}