import { strict as assert } from "node:assert";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";

type Row = Record<string, unknown>;
export type NativeRenewalSourceWriter = { createMany(args: { data: Row[] }): Promise<{ count: number }> };
const nativeFixtureId = (suffix: number) => `00000000-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
export function nativeRenewalSourceRows(start: number, count: number) {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: nativeFixtureId(100000 + index), tenantId: grant.tenantId, workspaceId: grant.workspaceId, sourceBindingId: nativeFixtureId(6401), providerKey: "reddit",
      providerItemId: `reddit:t3_native${index}`, canonicalUrl: `https://www.reddit.com/comments/native${index}/`,
      title: "Renewal fixture", body: "Retained zero-feed body", contentHash: "native-renewal",
      publishedAt: new Date(`${grant.dates[index % 7]}T10:00:00Z`), observedAt: new Date("2026-09-05T11:00:00Z"),
      createdAt: new Date("2026-09-05T11:00:00Z"), metadata: { kind: "reddit_post", score: 5 },
    };
  });
}
// Called inside the canonical client's serializable, retried fixture transaction.
export async function insertNativeRenewalSourceRows(source: NativeRenewalSourceWriter, start: number, count: number) {
  const data = nativeRenewalSourceRows(start, count);
  // Bound bind parameters; do not skip duplicates on a reused disposable fixture.
  for (let offset = 0; offset < data.length; offset += 500) {
    const batch = data.slice(offset, offset + 500);
    assert.equal((await source.createMany({ data: batch })).count, batch.length);
  }
}

// Fixed phase labels and elapsed time only; never SQL, DSNs or provider payloads.
export async function nativeFixturePhase<T>(phase: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  process.stdout.write(`${JSON.stringify({ fixturePhase: phase, state: "started" })}\n`);
  try {
    const result = await work();
    process.stdout.write(`${JSON.stringify({ fixturePhase: phase, state: "completed", elapsedMs: Math.round(performance.now() - started) })}\n`);
    return result;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ fixturePhase: phase, state: "failed", elapsedMs: Math.round(performance.now() - started) })}\n`);
    throw error;
  }
}
