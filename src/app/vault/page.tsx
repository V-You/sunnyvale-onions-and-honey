import Link from "next/link";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { listMerchantVaultRecords } from "@/lib/merchant-vault";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export default async function MerchantVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string }>;
}) {
  const { record } = await searchParams;
  const records = await listMerchantVaultRecords(25);
  const orderedRecords = [...records].sort((left, right) => {
    if (record && left.id === record) {
      return -1;
    }
    if (record && right.id === record) {
      return 1;
    }

    return right.created_at - left.created_at;
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-5xl space-y-8">
          <section className="rounded-3xl bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-amber-dark)]">
              Merchant debug panel
            </p>
            <h1 className="mt-3 text-4xl font-bold text-[var(--color-green-dark)]">
              Merchant vault viewer
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--color-brown)]">
              This page shows the merchant-side Evervault ciphertext records retained by the demo after checkout completion. The record includes encrypted card fields that the merchant can store and route later. CVV is intentionally excluded from the stored payload.
            </p>
          </section>

          {orderedRecords.length === 0 ? (
            <section className="rounded-3xl bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold text-[var(--color-green-dark)]">
                No merchant vault records yet
              </h2>
              <p className="mt-3 text-sm leading-6 text-[var(--color-brown)]">
                Complete a checkout with an Evervault-encrypted card flow first, then return to this page to inspect the stored merchant vault record.
              </p>
            </section>
          ) : (
            <div className="space-y-6">
              {orderedRecords.map((vaultRecord) => {
                const isSelected = record === vaultRecord.id;

                return (
                  <article
                    key={vaultRecord.id}
                    className={`rounded-3xl border bg-white p-6 shadow-sm ${
                      isSelected
                        ? "border-[var(--color-amber-dark)] ring-2 ring-[var(--color-amber)]/35"
                        : "border-black/10"
                    }`}
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                          <span className="rounded-full bg-[var(--color-cream)] px-2 py-1 font-semibold text-gray-700">
                            {vaultRecord.processor?.toUpperCase() ?? "merchant"}
                          </span>
                          <span className="rounded-full bg-[var(--color-cream)] px-2 py-1 font-semibold text-gray-700">
                            {vaultRecord.status}
                          </span>
                          <span>{formatDate(vaultRecord.created_at)}</span>
                        </div>

                        <dl className="grid gap-2 text-sm text-gray-700">
                          <div>
                            <dt className="font-medium text-gray-500">Vault record ID</dt>
                            <dd className="break-all font-mono text-xs">{vaultRecord.id}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">Checkout session</dt>
                            <dd className="break-all font-mono text-xs">
                              {vaultRecord.checkout_session_id}
                            </dd>
                          </div>
                          {vaultRecord.order_id && (
                            <div>
                              <dt className="font-medium text-gray-500">Order ID</dt>
                              <dd className="break-all font-mono text-xs">{vaultRecord.order_id}</dd>
                            </div>
                          )}
                          {vaultRecord.merchant_transaction_id && (
                            <div>
                              <dt className="font-medium text-gray-500">Merchant transaction ID</dt>
                              <dd className="break-all font-mono text-xs">
                                {vaultRecord.merchant_transaction_id}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt className="font-medium text-gray-500">Source</dt>
                            <dd>{vaultRecord.source}</dd>
                          </div>
                          {vaultRecord.payment_flow && (
                            <div>
                              <dt className="font-medium text-gray-500">Payment flow</dt>
                              <dd>{vaultRecord.payment_flow}</dd>
                            </div>
                          )}
                          <div>
                            <dt className="font-medium text-gray-500">Card token preview</dt>
                            <dd className="break-all font-mono text-xs">
                              {vaultRecord.card_token_preview}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="md:w-48 shrink-0">
                        {isSelected ? (
                          <span className="inline-flex rounded-full bg-[var(--color-green-dark)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                            Selected record
                          </span>
                        ) : (
                          <Link
                            href={`/vault?record=${encodeURIComponent(vaultRecord.id)}`}
                            className="inline-flex rounded-full border border-[var(--color-green-dark)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-green-dark)] transition-colors hover:bg-[var(--color-green-dark)]/5"
                          >
                            Focus record
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4">
                      <div className="rounded-2xl border border-black/10 bg-[var(--color-cream)]/60 p-4">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                          Stored ciphertext payload
                        </h2>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                          {JSON.stringify(vaultRecord.ciphertext_record, null, 2)}
                        </pre>
                      </div>

                      <div className="rounded-2xl border border-black/10 bg-[var(--color-cream)]/60 p-4">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                          Full merchant vault record
                        </h2>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                          {JSON.stringify(vaultRecord, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}