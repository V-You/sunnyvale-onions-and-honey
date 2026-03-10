import type { DemoBenchmarkRun } from "./types";

const STORAGE_KEY = "demo-benchmark-runs";
const MAX_RUNS = 11;

function isDemoBenchmarkRun(value: unknown): value is DemoBenchmarkRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const run = value as Partial<DemoBenchmarkRun>;

  return (
    typeof run.id === "string" &&
    typeof run.created_at === "number" &&
    typeof run.iterations === "number" &&
    typeof run.product_feed_average_ms === "number" &&
    typeof run.product_feed_requests_per_second === "number" &&
    typeof run.checkout_session_average_ms === "number" &&
    typeof run.checkout_session_requests_per_second === "number"
  );
}

function normalizeRuns(runs: DemoBenchmarkRun[]): DemoBenchmarkRun[] {
  return [...runs]
    .sort((left, right) => right.created_at - left.created_at)
    .slice(0, MAX_RUNS);
}

function readRunsFromStorage(): DemoBenchmarkRun[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isDemoBenchmarkRun);
  } catch {
    return [];
  }
}

export function loadDemoBenchmarkRuns(): DemoBenchmarkRun[] {
  const normalized = normalizeRuns(readRunsFromStorage());

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function saveDemoBenchmarkRuns(
  runs: DemoBenchmarkRun[],
): DemoBenchmarkRun[] {
  const normalized = normalizeRuns(runs);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}

export function addDemoBenchmarkRun(run: DemoBenchmarkRun): DemoBenchmarkRun[] {
  const existing = loadDemoBenchmarkRuns().filter(
    (current) => current.id !== run.id,
  );

  return saveDemoBenchmarkRuns([run, ...existing]);
}