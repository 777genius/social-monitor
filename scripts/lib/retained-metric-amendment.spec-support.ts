import { createHash } from "node:crypto";
import { FixedClock } from "@social-monitor/shared-kernel";
import { manifest, target } from "./retained-metric-refresh.spec-support";
import { SecureMetricRefreshReceipts, metricRefreshDigest } from "./retained-metric-refresh-receipts";
import { AmendRetainedMetricManifestUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/amend-retained-metric-manifest.use-case";
import type { RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
export const incidentSource = "ab5fc68e-c891-4641-8e67-a6568e4b7d4e";
export const beforeDigest = "bb32223966faefc45a54b863fab39b62e33c3e12e5733d8ab3678a0f31cd4828";
export const afterDigest = "f999a8b7f9ce49d0fe090e8869e3654871e63a555a62b73feb3dd27608cfc9e3";
export const implementation = { sourceSha: "1".repeat(64), executableSha: "2".repeat(64), legacyRetirementRef: "TEST-legacy-retired", holderProof: "3".repeat(64) };
export function incidentFixture(root: string, count = 3329) {
  const targets = Array.from({ length: count }, (_, i) => target({
    sourceItemId: i === 0 ? incidentSource : `00000000-0000-7000-8000-${String(7000 + i).padStart(12, "0")}`,
    providerKey: i % 2 ? "reddit" : "hacker-news", externalId: i % 2 ? `reddit:t3_fixture${i}` : `hn:${49580353 + i}`,
    canonicalUrl: i % 2 ? `https://www.reddit.com/comments/fixture${i}` : `https://news.ycombinator.com/item?id=${49580353 + i}`,
    publishedAt: `${["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"][i % 7]}T01:00:00.000Z`,
    identityDigest: i === 0 ? beforeDigest : "b".repeat(64),
  }));
  const original = { ...manifest(targets), operationId: "409f3cde-6073-451c-9285-eaa6802ca081", plannedAt: "2026-09-06T02:35:17.000Z",
    scope: { ...manifest().scope, endAt: "2026-09-06T00:00:00.000Z" } };
  let current = targets.map((t) => ({ ...t, identityDigest: t.sourceItemId === incidentSource ? afterDigest : t.identityDigest }));
  const inventory = { list: jest.fn(async () => current), read: jest.fn(async (_: unknown, id: string) => current.find((t) => t.sourceItemId === id) ?? null) };
  const receipts = SecureMetricRefreshReceipts.forTest(root), clock = new FixedClock(new Date("2026-09-06T04:00:00.000Z"));
  const amendment = () => new AmendRetainedMetricManifestUseCase(inventory, receipts, clock, metricRefreshDigest, implementation);
  return { original, inventory, receipts, clock, amendment, current: () => current, change: (rows: RetainedMetricTarget[]) => { current = rows; } };
}
// Independent recursive object normalization, separate from production serializer.
export function independentMetricSha(value: unknown): string {
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === "object" ?
    Object.fromEntries(Object.keys(v).sort().map((key) => [key, normalize((v as Record<string, unknown>)[key])])) : v;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
