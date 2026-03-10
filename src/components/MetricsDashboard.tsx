"use client";

import { useEffect, useState } from "react";
import { ACP_LATEST_API_VERSION } from "@/lib/acp-shared";
import {
  addDemoBenchmarkRun,
  loadDemoBenchmarkRuns,
} from "@/lib/demo-metrics";
import { loadTransactionHistory } from "@/lib/transaction-history";
import type {
  DemoBenchmarkRun,
  PaymentMetricStep,
  Product,
  RecentTransactionEntry,
} from "@/lib/types";

const ACP_API_KEY = process.env.NEXT_PUBLIC_ACP_API_KEY ?? "";

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMilliseconds(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function summarizeSteps(entries: RecentTransactionEntry[]): Array<{
  name: string;
  average_duration_ms: number;
}> {
  const buckets = new Map<string, number[]>();

  entries.forEach((entry) => {
    entry.payment_metrics?.steps.forEach((step: PaymentMetricStep) => {
      const current = buckets.get(step.name) ?? [];
      current.push(step.duration_ms);
      buckets.set(step.name, current);
    });
  });

  return [...buckets.entries()]
    .map(([name, durations]) => ({
      name,
      average_duration_ms: average(durations),
    }))
    .sort((left, right) => right.average_duration_ms - left.average_duration_ms);
}

export default function MetricsDashboard({ products }: { products: Product[] }) {
  const [history, setHistory] = useState<RecentTransactionEntry[]>([]);
  const [benchmarkRuns, setBenchmarkRuns] = useState<DemoBenchmarkRun[]>([]);
  const [runningBenchmark, setRunningBenchmark] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(loadTransactionHistory());
    setBenchmarkRuns(loadDemoBenchmarkRuns());
  }, []);

  const instrumentedEntries = history.filter(
    (entry) => entry.payment_metrics?.total_duration_ms,
  );
  const aciEntries = instrumentedEntries.filter((entry) => entry.processor === "aci");
  const stripeEntries = instrumentedEntries.filter((entry) => entry.processor === "stripe");
  const latestProcessor = history[0]?.processor;
  const stepSummary = summarizeSteps(instrumentedEntries);

  async function runBenchmark() {
    setRunningBenchmark(true);
    setBenchmarkError(null);

    try {
      if (!ACP_API_KEY) {
        throw new Error("NEXT_PUBLIC_ACP_API_KEY is required to run the benchmark probes.");
      }

      const sampleItems = products.slice(0, 2).map((product) => ({
        id: product.sku,
        quantity: 1,
      }));
      const iterations = 5;
      const productDurations: number[] = [];
      const checkoutSessionDurations: number[] = [];

      for (let index = 0; index < iterations; index += 1) {
        let startedAt = performance.now();
        const productResponse = await fetch("/api/products");
        if (!productResponse.ok) {
          throw new Error(`Product feed probe failed with HTTP ${productResponse.status}`);
        }
        productDurations.push(performance.now() - startedAt);

        startedAt = performance.now();
        const sessionResponse = await fetch("/api/checkout_sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "API-Version": ACP_LATEST_API_VERSION,
            Authorization: `Bearer ${ACP_API_KEY}`,
          },
          body: JSON.stringify({
            items: sampleItems,
            capabilities: {
              interventions: {
                supported: [],
              },
            },
          }),
        });

        if (!sessionResponse.ok) {
          throw new Error(
            `Checkout session probe failed with HTTP ${sessionResponse.status}`,
          );
        }

        checkoutSessionDurations.push(performance.now() - startedAt);
      }

      const run: DemoBenchmarkRun = {
        id: `benchmark_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        created_at: Date.now(),
        iterations,
        processor_hint: latestProcessor,
        product_feed_average_ms: average(productDurations),
        product_feed_requests_per_second:
          iterations / (productDurations.reduce((sum, value) => sum + value, 0) / 1000),
        checkout_session_average_ms: average(checkoutSessionDurations),
        checkout_session_requests_per_second:
          iterations /
          (checkoutSessionDurations.reduce((sum, value) => sum + value, 0) / 1000),
      };

      setBenchmarkRuns(addDemoBenchmarkRun(run));
    } catch (error) {
      setBenchmarkError(
        error instanceof Error ? error.message : "Benchmark run failed",
      );
    } finally {
      setRunningBenchmark(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] border border-[var(--color-green-dark)]/10 bg-white/90 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--color-brown-light)]">
              Metrics
            </p>
            <h1 className="text-4xl font-bold tracking-tight">Checkout timing lab</h1>
            <p className="max-w-2xl text-[var(--color-brown)]">
              This dashboard shows two metrics: Real authorization timing captured during shopping events (Relay and PSP round trips, not shopper journey), and repeatable checkout probe runs (measures storefront/API responsiveness to establish a baseline).
            </p>
          </div>

          <button
            type="button"
            onClick={runBenchmark}
            disabled={runningBenchmark}
            className="rounded-full bg-[var(--color-green-dark)] px-5 py-3 text-sm font-semibold text-[var(--color-cream)] transition hover:bg-[var(--color-green-mid)] disabled:opacity-60"
          >
            {runningBenchmark ? "Running benchmark..." : "Run probe benchmark"}
          </button>
        </div>

        {benchmarkError && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {benchmarkError}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "ACI average payment duration",
            value:
              aciEntries.length > 0
                ? formatMilliseconds(
                    average(
                      aciEntries.map(
                        (entry) => entry.payment_metrics?.total_duration_ms ?? 0,
                      ),
                    ),
                  )
                : "No runs yet",
          },
          {
            label: "Stripe average payment duration",
            value:
              stripeEntries.length > 0
                ? formatMilliseconds(
                    average(
                      stripeEntries.map(
                        (entry) => entry.payment_metrics?.total_duration_ms ?? 0,
                      ),
                    ),
                  )
                : "No runs yet",
          },
          {
            label: "Instrumented checkouts",
            value: String(instrumentedEntries.length),
          },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-[var(--color-brown)]">{card.label}</p>
            <p className="mt-3 text-3xl font-bold text-[var(--color-green-dark)]">
              {card.value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">External Relay and PSP timing</h2>
          <p className="mt-2 text-sm text-gray-500">
            Uses the timings recorded by successful and failed checkout attempts.
          </p>
          {stepSummary.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No instrumented payment steps have been recorded yet.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {stepSummary.map((step) => (
                <div
                  key={step.name}
                  className="flex items-center justify-between rounded-xl bg-[var(--color-cream)] px-4 py-3"
                >
                  <span className="font-medium text-[var(--color-green-dark)]">
                    {step.name}
                  </span>
                  <span className="font-mono text-sm text-[var(--color-brown)]">
                    {formatMilliseconds(step.average_duration_ms)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Shop timing</h2>
          <p className="mt-2 text-sm text-gray-500">
            Internal product-feed and session-creation probes.
          </p>
          {benchmarkRuns.length === 0 ? (
            <p className="mt-6 text-sm text-gray-500">
              No benchmark runs recorded yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {benchmarkRuns.map((run) => (
                <article
                  key={run.id}
                  className="rounded-xl border border-black/10 bg-[var(--color-cream)] p-4"
                >
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-[var(--color-green-dark)]">
                      {new Intl.DateTimeFormat("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(run.created_at)}
                    </span>
                    <span className="text-gray-500">
                      {run.iterations} iterations
                    </span>
                  </div>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Product feed avg</dt>
                      <dd>{formatMilliseconds(run.product_feed_average_ms)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Product feed throughput</dt>
                      <dd>{run.product_feed_requests_per_second.toFixed(2)} req/s</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Session create avg</dt>
                      <dd>{formatMilliseconds(run.checkout_session_average_ms)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500">Session create throughput</dt>
                      <dd>{run.checkout_session_requests_per_second.toFixed(2)} req/s</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}