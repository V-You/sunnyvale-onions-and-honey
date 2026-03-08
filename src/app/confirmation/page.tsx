import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const runtime = "edge";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string;
    processor?: string;
    merchant_transaction_id?: string;
    psp_transaction_id?: string;
    result_code?: string;
    result_description?: string;
  }>;
}) {
  const {
    order_id,
    processor,
    merchant_transaction_id,
    psp_transaction_id,
    result_code,
    result_description,
  } = await searchParams;

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
          {(processor || merchant_transaction_id || psp_transaction_id || result_code) && (
            <div className="text-left bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Technical receipt
              </h2>
              <dl className="space-y-2 text-sm text-gray-700">
                {processor && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Processor</dt>
                    <dd className="font-medium uppercase">{processor}</dd>
                  </div>
                )}
                {merchant_transaction_id && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Merchant transaction ID</dt>
                    <dd className="font-mono text-xs break-all">{merchant_transaction_id}</dd>
                  </div>
                )}
                {psp_transaction_id && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Processor transaction ID</dt>
                    <dd className="font-mono text-xs break-all">{psp_transaction_id}</dd>
                  </div>
                )}
                {result_code && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Result code</dt>
                    <dd className="font-mono text-xs">{result_code}</dd>
                  </div>
                )}
              </dl>
              {result_description && (
                <p className="mt-4 text-sm text-gray-600">{result_description}</p>
              )}
            </div>
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
