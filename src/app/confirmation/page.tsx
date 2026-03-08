import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const runtime = "edge";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id } = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <Header />

      <main className="flex-1 py-20 px-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-6xl mb-6">&#x2705;</div>
          <h1 className="text-3xl font-bold mb-4">Order confirmed!</h1>
          <p className="text-gray-600 mb-2">
            The onions are on their way.
          </p>
          {order_id && (
            <p className="text-sm text-gray-400 mb-8">
              Order ID: <code className="bg-gray-100 px-2 py-1 rounded">{order_id}</code>
            </p>
          )}
          <Link
            href="/products"
            className="text-[var(--color-amber-dark)] font-semibold hover:underline"
          >
            Continue shopping &rarr;
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
