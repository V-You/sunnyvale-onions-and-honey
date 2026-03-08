import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const runtime = "edge";

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{
    order_id?: string;
    status?: string;
    amount_total_cents?: string;
    currency?: string;
    completed_at?: string;
    processor?: string;
    payment_flow?: string;
    merchant_transaction_id?: string;
    psp_transaction_id?: string;
    result_code?: string;
    result_description?: string;
  }>;
}) {
  const {
    order_id,
    status,
    amount_total_cents,
    currency,
    completed_at,
    processor,
    payment_flow,
    merchant_transaction_id,
    psp_transaction_id,
    result_code,
    result_description,
  } = await searchParams;

  const parsedAmount = amount_total_cents ? Number(amount_total_cents) : null;
  const parsedCompletedAt = completed_at ? Number(completed_at) : null;
  const formattedAmount =
    parsedAmount !== null && Number.isFinite(parsedAmount)
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency ?? "USD",
        }).format(parsedAmount / 100)
      : null;
  const formattedCompletedAt =
    parsedCompletedAt !== null && Number.isFinite(parsedCompletedAt)
      ? new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(parsedCompletedAt)
      : null;

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
                {status && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Checkout status</dt>
                    <dd className="font-medium capitalize">{status}</dd>
                  </div>
                )}
                {formattedAmount && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Amount</dt>
                    <dd className="font-medium">{formattedAmount}</dd>
                  </div>
                )}
                {formattedCompletedAt && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Completed at</dt>
                    <dd>{formattedCompletedAt}</dd>
                  </div>
                )}
                {processor && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Processor</dt>
                    <dd className="font-medium uppercase">{processor}</dd>
                  </div>
                )}
                {payment_flow && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Payment flow</dt>
                    <dd className="font-medium">{payment_flow}</dd>
                  </div>
                )}
                {merchant_transaction_id && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Preferred lookup key</dt>
                    <dd className="text-right">Merchant transaction ID</dd>
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
              {processor === "stripe" && merchant_transaction_id && (
                <p className="mt-3 text-xs text-gray-500">
                  Merchant-reference lookup on Stripe uses metadata search and can lag briefly after a payment is created.
                </p>
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
