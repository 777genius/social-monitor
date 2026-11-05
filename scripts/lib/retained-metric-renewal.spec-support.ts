import { createHash } from "node:crypto";
import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { retainedMetricRenewalGrant as grant } from "@social-monitor/ingestion/domain/policies/retained-metric-renewal-grant";
import { RenewRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/renew-retained-metrics.use-case";
import { refreshBatches, metricRefreshSourceBase } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import { metricRefreshCells } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-report";
import type { MetricRefreshOperation, MetricImplementation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-operation.contracts";
import type { MetricRefreshManifest, MetricRefreshOutcome, RetainedMetricTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { canonicalMetricRefreshJson, metricRefreshDigest } from "./retained-metric-refresh-receipts";
import { target } from "./retained-metric-refresh.spec-support";

export const renewalNow = "2026-09-08T12:00:00.000Z";
export const implementation: MetricImplementation = { sourceSha: "a".repeat(64), executableSha: "b".repeat(64), holderProof: "c".repeat(64), legacyRetirementRef: "fixture:retired" };
export class RenewalMemoryJournal implements MetricRefreshOperation {
  readonly values = new Map<string, unknown>();
  held = false;
  assertHeld = () => { if (!this.held) throw new Error("lease_not_held"); };
  async read<T>(path: string): Promise<T | null> { return structuredClone(this.values.get(path) ?? null) as T | null; }
  install = jest.fn(async (path: string, value: unknown): Promise<"installed" | "replayed"> => {
    this.assertHeld();
    if (this.values.has(path)) {
      if (metricRefreshDigest(this.values.get(path)) !== metricRefreshDigest(value)) throw new Error("unequal_bytes");
      return "replayed";
    }
    this.values.set(path, structuredClone(value)); return "installed";
  });
  constructor(readonly root: string) {}
  async entries() {
    this.assertHeld();
    return [{ name: "operation.lock", bytesSha: createHash("sha256").update("").digest("hex") },
      ...[...this.values].map(([path, value]) => ({ name: path.slice(this.root.length + 1),
        bytesSha: createHash("sha256").update(canonicalMetricRefreshJson({ digest: metricRefreshDigest(value), value })).digest("hex") }))]
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async withOperation<T>(work: (operation: MetricRefreshOperation) => Promise<T>): Promise<T> {
    if (this.held) throw new Error("busy");
    this.held = true; try { return await work(this); } finally { this.held = false; }
  }
}
export function renewalFixture() {
  const targets = Array.from({ length: grant.originalCount }, (_, index) => target({
    sourceItemId: `00000000-0000-7000-8000-${String(index + 10000).padStart(12, "0")}`,
    externalId: `reddit:t3_${(index + 10000).toString(36)}`,
    canonicalUrl: `https://www.reddit.com/comments/${(index + 10000).toString(36)}/`,
    publishedAt: `${grant.dates[index % 7]}T11:00:00.000Z`, visibleFeedCount: index % 2,
  }));
  const original: MetricRefreshManifest = { version: "retained-metrics.v1", sourceBase: metricRefreshSourceBase,
    bounds: grant.bounds, evidencePath: grant.predecessorPath, operationId: grant.predecessorOperationId,
    scope: { tenantId: grant.tenantId, workspaceId: grant.workspaceId, dates: grant.dates, endAt: grant.endAt },
    plannedAt: "2026-09-06T12:00:00.000Z", targets };
  // Synthetic predecessor only: no production receipt bytes are available in this
  // lane. Substitute ONLY this payload's digest, never the resolver or validators.
  const fixtureSha = metricRefreshDigest(original);
  const hash = (value: unknown) => { const sha = metricRefreshDigest(value); return sha === fixtureSha ? grant.predecessorManifestSha : sha; };
  const originalDigest = hash(original);
  const prior = new RenewalMemoryJournal(grant.predecessorPath), renewal = new RenewalMemoryJournal(grant.evidencePath);
  prior.values.set(`${prior.root}/operation.json`, original);
  const results: MetricRefreshOutcome[] = [];
  for (const [index, batch] of refreshBatches(targets).entries()) {
    prior.values.set(`${prior.root}/batch-${index}.reserved.json`, { operationId: original.operationId, manifestDigest: originalDigest, targets: batch.map((t) => t.sourceItemId) });
    prior.values.set(`${prior.root}/batch-${index}.observed.json`, { failure: null, observations: batch.map((t) => ({
      externalId: t.externalId, returned: false, observedAt: original.plannedAt, metadata: null, sample: null, reason: "omitted" })) });
    for (const t of batch) {
      const result: MetricRefreshOutcome = { sourceItemId: t.sourceItemId, externalId: t.externalId, providerKey: t.providerKey,
        date: t.publishedAt.slice(0, 10), status: "unavailable", returned: false, reason: "omitted", observedAt: original.plannedAt, before: t.authority, after: t.authority };
      prior.values.set(`${prior.root}/result-${t.sourceItemId}.json`, result); results.push(result);
    }
  }
  prior.values.set(`${prior.root}/final.json`, { manifestSha: originalDigest, results, cells: metricRefreshCells(results, grant.dates) });
  let current = structuredClone(targets);
  const inventory = {
    list: jest.fn(async (_scope: unknown, ids?: readonly string[]) => structuredClone(ids ? current.filter((t) => ids.includes(t.sourceItemId)) : current)),
    read: jest.fn(async (_scope: unknown, id: string) => structuredClone(current.find((t) => t.sourceItemId === id) ?? null)),
  };
  const fetcher = { fetch: jest.fn(async (batch: readonly RetainedMetricTarget[]) => ok(batch.map((t) => ({ externalId: t.externalId, returned: false, metadata: null, reason: "omitted" })))) };
  const projection = { project: jest.fn(async () => ({ currentSnapshotsUpdated: 0, observationsAppended: 0, metricChanges: 0, regressionsObserved: 0 })) };
  const clock = new FixedClock(new Date(renewalNow));
  const usecase = () => new RenewRetainedMetricsUseCase(inventory, fetcher, projection, prior, renewal, clock, hash);
  return { original, targets, hash, prior, renewal, inventory, fetcher, projection, clock, usecase,
    setCurrent: (rows: RetainedMetricTarget[]) => { current = rows; } };
}
