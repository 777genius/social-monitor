import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function tokenize(value: string): readonly string[] {
  const stopWords = new Set([
    "about",
    "after",
    "and",
    "before",
    "for",
    "from",
    "how",
    "into",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "your",
  ]);

  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9+#.]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term)),
    ),
  ];
}

export function statusCounts<TValue extends { readonly status: string | null }>(
  rows: readonly (TValue & { readonly count: string })[],
): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [
      row.status ?? "unknown",
      Number.parseInt(row.count, 10),
    ]),
  );
}

export function sumCounts<TValue extends { readonly count: string }>(
  rows: readonly TValue[],
): number {
  return rows.reduce((sum, row) => sum + Number.parseInt(row.count, 10), 0);
}

export function groupBy<TKey, TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => TKey,
): Map<TKey, TValue[]> {
  const grouped = new Map<TKey, TValue[]>();

  for (const value of values) {
    const key = keyOf(value);
    const bucket = grouped.get(key) ?? [];
    bucket.push(value);
    grouped.set(key, bucket);
  }

  return grouped;
}

export function countBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
): Record<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function ratio<TValue>(
  values: readonly TValue[],
  predicate: (value: TValue) => boolean,
): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(
    values.filter((value) => predicate(value)).length / values.length,
  );
}

export function average<TValue>(
  values: readonly TValue[],
  valueOf: (value: TValue) => number,
): number {
  return values.length === 0
    ? 0
    : averageValues(values.map((value) => valueOf(value)));
}

export function averageValues(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: readonly number[], percent: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percent) - 1),
  );

  return sorted[index] ?? 0;
}

export function readJson<TValue>(path: string): TValue {
  return JSON.parse(readFileSync(path, "utf8")) as TValue;
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fingerprints(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => hashText(value).slice(0, 12)))]
    .sort()
    .slice(0, 20);
}

export function noRawSecretFragments(
  value: unknown,
  forbiddenFragments: readonly string[],
): boolean {
  const serialized = JSON.stringify(value).toLowerCase();
  return forbiddenFragments.every(
    (fragment) => !serialized.includes(fragment.toLowerCase()),
  );
}

export function providerFeedItemCountAtLeast<
  TValue extends {
    readonly providerKey: string;
    readonly visibleFeedItemCount: number;
  },
>(
  reports: readonly TValue[],
  providerKey: string,
  threshold: number,
): boolean {
  return (
    (reports.find((item) => item.providerKey === providerKey)
      ?.visibleFeedItemCount ?? 0) >= threshold
  );
}

export function runRateAtLeast(
  acceptedRunCount: number,
  totalRunCount: number,
  thresholdPercent: number,
): boolean {
  return (
    totalRunCount > 0 &&
    acceptedRunCount * 100 >= totalRunCount * thresholdPercent
  );
}

export function visibleRows<TValue extends { readonly status: string }>(
  rows: readonly TValue[],
): readonly TValue[] {
  return rows.filter((row) => row.status === "VISIBLE");
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
