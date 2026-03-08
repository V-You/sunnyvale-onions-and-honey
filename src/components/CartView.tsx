"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { loadTransactionHistory } from "@/lib/transaction-history";
import type {
  ProcessorQueryLookupMode,
  ProcessorQueryResponse,
  Product,
  RecentTransactionEntry,
} from "@/lib/types";

interface CartEntry {
  sku: string;
  quantity: number;
}

export default function CartView({ products }: { products: Product[] }) {
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [history, setHistory] = useState<RecentTransactionEntry[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<RecentTransactionEntry | null>(null);
  const [queryResult, setQueryResult] =
    useState<ProcessorQueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryMode, setQueryMode] =
    useState<ProcessorQueryLookupMode | null>(null);
  const [querying, setQuerying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const raw = localStorage.getItem("cart");
    if (raw) setCart(JSON.parse(raw));
    setHistory(loadTransactionHistory());
  }, []);

  const save = useCallback((updated: CartEntry[]) => {
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
  }, []);

  function updateQuantity(sku: string, delta: number) {
    const updated = cart
      .map((item) =>
        item.sku === sku ? { ...item, quantity: item.quantity + delta } : item,
      )
      .filter((item) => item.quantity > 0);
    save(updated);
  }

  function removeItem(sku: string) {
    save(cart.filter((item) => item.sku !== sku));
  }

  const resolvedItems = cart.map((entry) => {
    const product = products.find((p) => p.sku === entry.sku);
    return { ...entry, product };
  });

  const total = resolvedItems.reduce(
    (sum, item) =>
      sum + (item.product ? item.product.price_cents * item.quantity : 0),
    0,
  );

  function formatCurrency(amountCents: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amountCents / 100);
  }

  function formatDate(timestamp: number) {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  }

  function describeItems(entry: RecentTransactionEntry) {
    return entry.items
      .map((item) => `${item.name} x ${item.quantity}`)
      .join(", ");
  }

  async function runTransactionQuery(
    entry: RecentTransactionEntry,
    lookupMode: ProcessorQueryLookupMode,
    url: string,
  ) {
    setSelectedTransaction(entry);
    setQueryResult(null);
    setQueryError(null);
    setQueryMode(lookupMode);
    setQuerying(true);

    try {
      const response = await fetch(url);
      const payload = (await response.json()) as ProcessorQueryResponse | { error?: string; message?: string };

      if (!response.ok) {
        const errorMessage =
          ("message" in payload && typeof payload.message === "string" && payload.message) ||
          ("error" in payload && typeof payload.error === "string" && payload.error) ||
          `Query failed with HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      setQueryResult(payload as ProcessorQueryResponse);
    } catch (error) {
      setQueryError(
        error instanceof Error ? error.message : "Unable to query the processor",
      );
    } finally {
      setQuerying(false);
    }
  }

  async function openProcessorTransactionQuery(entry: RecentTransactionEntry) {
    if (!entry.psp_transaction_id) {
      return;
    }

    await runTransactionQuery(
      entry,
      "psp_transaction_id",
      `/api/processor_transactions/${entry.processor}/${encodeURIComponent(entry.psp_transaction_id)}`,
    );
  }

  async function openMerchantTransactionQuery(entry: RecentTransactionEntry) {
    if (!entry.merchant_transaction_id) {
      return;
    }

    await runTransactionQuery(
      entry,
      "merchant_transaction_id",
      `/api/processor_transactions/${entry.processor}/lookup?merchantTransactionId=${encodeURIComponent(entry.merchant_transaction_id)}`,
    );
  }

  function closeTransactionModal() {
    setSelectedTransaction(null);
    setQueryResult(null);
    setQueryError(null);
    setQueryMode(null);
    setQuerying(false);
  }

  function renderHistorySection() {
    return (
      <>
        <section className="bg-white rounded-xl p-6 shadow-sm mt-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-semibold">Recent transactions</h2>
              <p className="text-sm text-gray-500">
                Up to 12 entries are kept for 1 day on this device.
              </p>
            </div>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-gray-500">
              No recent transactions have been recorded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <article
                  key={entry.history_id}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                        <span className="rounded-full bg-white px-2 py-1 font-semibold text-gray-700">
                          {entry.processor}
                        </span>
                        <span>{formatDate(entry.recorded_at)}</span>
                        <span className="rounded-full bg-white px-2 py-1 font-semibold text-gray-700">
                          {entry.status}
                        </span>
                      </div>

                      <dl className="grid gap-2 text-sm text-gray-700">
                        <div>
                          <dt className="font-medium text-gray-500">Merchant transaction ID</dt>
                          <dd className="break-all font-mono text-xs">
                            {entry.merchant_transaction_id ?? "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">Processor transaction ID</dt>
                          <dd className="break-all font-mono text-xs">
                            {entry.psp_transaction_id ?? "Not recorded"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">Cart</dt>
                          <dd>{describeItems(entry)}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-gray-500">Price</dt>
                          <dd>{formatCurrency(entry.amount_total_cents, entry.currency)}</dd>
                        </div>
                        {entry.payment_flow && entry.payment_metrics && (
                          <div>
                            <dt className="font-medium text-gray-500">Flow timing</dt>
                            <dd>
                              {entry.payment_flow} · {entry.payment_metrics.total_duration_ms} ms
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="font-medium text-gray-500">Result code</dt>
                          <dd className="font-mono text-xs">
                            {entry.result_code ?? "Not provided"}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-col gap-2 md:w-44">
                      <button
                        type="button"
                        onClick={() => openMerchantTransactionQuery(entry)}
                        disabled={!entry.merchant_transaction_id || querying}
                        className="rounded-lg bg-[var(--color-green-dark)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-green-mid)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Query merchant ref
                      </button>
                      <button
                        type="button"
                        onClick={() => openProcessorTransactionQuery(entry)}
                        disabled={!entry.psp_transaction_id || querying}
                        className="rounded-lg border border-[var(--color-green-dark)] px-4 py-2 text-sm font-semibold text-[var(--color-green-dark)] transition-colors hover:bg-[var(--color-green-dark)]/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Query processor ID
                      </button>
                      {entry.result_description && (
                        <p className="text-xs text-gray-500">
                          {entry.result_description}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <Modal
          open={selectedTransaction !== null}
          title="Transaction query"
          onClose={closeTransactionModal}
        >
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="rounded-xl border border-black/10 bg-white/70 p-4">
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Processor</dt>
                    <dd className="font-medium uppercase">{selectedTransaction.processor}</dd>
                  </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Current lookup mode</dt>
                        <dd className="text-right capitalize">
                          {queryMode === "merchant_transaction_id"
                            ? "merchant transaction ID"
                            : queryMode === "psp_transaction_id"
                              ? "processor transaction ID"
                              : "Not selected"}
                        </dd>
                      </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Processor transaction ID</dt>
                    <dd className="font-mono text-xs break-all text-right">
                      {selectedTransaction.psp_transaction_id ?? "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Merchant transaction ID</dt>
                    <dd className="font-mono text-xs break-all text-right">
                      {selectedTransaction.merchant_transaction_id ?? "Not recorded"}
                    </dd>
                  </div>
                </dl>
              </div>

              {querying && (
                <p className="text-sm text-gray-600">Querying the processor...</p>
              )}

              {queryError && (
                <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {queryError}
                </div>
              )}

              {queryResult && (
                <>
                  <div className="rounded-xl border border-black/10 bg-white/70 p-4">
                    <dl className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Query status</dt>
                        <dd className="font-medium">
                          {queryResult.success ? "success" : "failed"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Lookup mode</dt>
                        <dd className="text-right capitalize">
                          {queryResult.lookup_mode === "merchant_transaction_id"
                            ? "merchant transaction ID"
                            : "processor transaction ID"}
                        </dd>
                      </div>
                      {typeof queryResult.match_count === "number" && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">Matches</dt>
                          <dd className="text-right">{queryResult.match_count}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Result code</dt>
                        <dd className="font-mono text-xs text-right">
                          {queryResult.result_code ?? "Not provided"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Result description</dt>
                        <dd className="text-right">
                          {queryResult.result_description ?? queryResult.message ?? "Not provided"}
                        </dd>
                      </div>
                      {selectedTransaction.payment_metrics && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500">Checkout duration</dt>
                          <dd className="text-right">
                            {selectedTransaction.payment_metrics.total_duration_ms} ms
                          </dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">Queried at</dt>
                        <dd className="text-right">{formatDate(queryResult.queried_at)}</dd>
                      </div>
                    </dl>
                  </div>

                    {queryResult.matched_transaction_ids && queryResult.matched_transaction_ids.length > 0 && (
                      <div className="rounded-xl border border-black/10 bg-white/70 p-4">
                        <p className="mb-2 text-sm font-medium text-gray-500">
                          Matched processor transaction IDs
                        </p>
                        <ul className="space-y-2 text-xs font-mono text-gray-700">
                          {queryResult.matched_transaction_ids.map((transactionId) => (
                            <li key={transactionId} className="break-all">
                              {transactionId}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  <div className="rounded-xl bg-slate-950 p-4 text-xs text-slate-100 overflow-x-auto">
                    <p className="mb-2 font-semibold">Raw processor response</p>
                    <pre className="whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(queryResult.response_body, null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </Modal>
      </>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="space-y-8">
        <div className="text-center py-16">
          <p className="text-xl text-gray-500 mb-4">Your cart is empty</p>
          <Link
            href="/products"
            className="text-[var(--color-amber-dark)] font-semibold hover:underline"
          >
            Start shopping
          </Link>
        </div>
        {renderHistorySection()}
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-4 mb-8">
        {resolvedItems.map((item) => (
          <div
            key={item.sku}
            className="flex items-center gap-4 bg-white rounded-xl p-4 shadow-sm"
          >
            <div className="w-16 h-16 bg-gradient-to-br from-amber-50 to-green-50 rounded-lg flex items-center justify-center text-2xl shrink-0">
              {item.product?.category === "honey" ? "\u{1F36F}" : "\u{1F9C5}"}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">
                {item.product?.name ?? item.sku}
              </h3>
              <p className="text-sm text-gray-500">
                ${item.product ? (item.product.price_cents / 100).toFixed(2) : "?"} each
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(item.sku, -1)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
              >
                -
              </button>
              <span className="w-8 text-center font-semibold">{item.quantity}</span>
              <button
                onClick={() => updateQuantity(item.sku, 1)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
            <button
              onClick={() => removeItem(item.sku)}
              className="text-red-400 hover:text-red-600 text-sm ml-2"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-2xl font-bold text-[var(--color-amber-dark)]">
            ${(total / 100).toFixed(2)}
          </span>
        </div>
        <button
          onClick={() => router.push("/checkout")}
          className="w-full py-3 rounded-lg font-semibold text-white bg-[var(--color-green-dark)] hover:bg-[var(--color-green-mid)] transition-colors"
        >
          Proceed to checkout
        </button>
      </div>

      {renderHistorySection()}
    </div>
  );
}
