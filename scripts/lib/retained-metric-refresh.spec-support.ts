import { FixedClock, ok } from "@social-monitor/shared-kernel";
import { AcquisitionDatabaseFixture } from "./clean-real-day-engagement.spec-support";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import type { PrismaSourceEngagementClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import { metricRefreshDigest, SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";
import { createRecoveryEvidenceFilesystemTestHarness } from "./reader-summary-recovery-evidence-secure-file";
import { metricRefreshBounds, metricRefreshSourceBase, metricRefreshDates, metricRefreshEvidencePath, metricRefreshTenant, metricRefreshWorkspace } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricRefreshManifest, RetainedMetricTarget, MetricFetchObservation } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { RefreshRetainedMetricsUseCase } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.use-case";

export const now = "2026-09-05T12:00:00.000Z";
export const scope = { tenantId: metricRefreshTenant, workspaceId: metricRefreshWorkspace, dates: metricRefreshDates, endAt: now };
export const authority = { metricsHash: null, observedAt: null, observationAt: null, observationCount: 0, regressionCount: 0 };
export function target(extra: Partial<RetainedMetricTarget> = {}): RetainedMetricTarget {
  return { ...scope, sourceItemId: "00000000-0000-7000-8000-000000006104", externalId: "reddit:t3_abc", providerKey: "reddit",
    sourceBindingId: "00000000-0000-7000-8000-000000006105", canonicalUrl: "https://www.reddit.com/r/sandbox/comments/abc/example/",
    publishedAt: "2026-09-04T11:00:00.000Z", configDigest: "a".repeat(64), identityDigest: "b".repeat(64), feedDigest: "c".repeat(64),
    rejection: null, visibleFeedCount: 1, authority, ...extra };
}
export const manifest = (targets = [target()]): MetricRefreshManifest => ({ version: "retained-metrics.v1", sourceBase: metricRefreshSourceBase, bounds: metricRefreshBounds, scope,
  operationId: "00000000-0000-7000-8000-000000006103", evidencePath: metricRefreshEvidencePath, plannedAt: now, targets });

export function fixture(root: string) {
  const db = new AcquisitionDatabaseFixture();
  const original = target();
  const data = { tenantId: scope.tenantId, workspaceId: scope.workspaceId, sourceBindingId: original.sourceBindingId,
    providerKey: "reddit", providerItemId: original.externalId, canonicalUrl: original.canonicalUrl, title: "Original title", body: "Original body",
    publishedAt: new Date(original.publishedAt), observedAt: new Date(original.publishedAt), lastObservedAt: null,
    contentHash: "original-content-hash", metadata: { kind: "reddit_post", score: 5, provenance: "retained", subreddit: "sandbox" } };
  db.rows("sourceItem").push({ id: original.sourceItemId, ...data });
  db.rows("feedItem").push({ id: "feed-fixture", ...data, sourceItemId: original.sourceItemId, interestId: "interest-fixture",
    bodyPreview: "Original body", providerMetadata: data.metadata, status: "VISIBLE" });
  let serial = 0;
  const projection = new PrismaSourceEngagementProjectionAdapter(db.connection as unknown as PrismaSourceEngagementClient,
    { generate: () => `id-${++serial}` }, { retention: "skip" });
  const inventory = { list: jest.fn(async () => [original]), read: jest.fn(async (): Promise<RetainedMetricTarget> => {
    const snapshot = db.rows("sourceItemEngagementSnapshot")[0];
    return { ...original, authority: snapshot ? { metricsHash: String(snapshot.metricsHash),
      observedAt: (snapshot.lastObservedAt as Date).toISOString(), observationAt: (snapshot.lastObservationAt as Date).toISOString(),
      observationCount: db.rows("sourceItemEngagementObservation").length,
      regressionCount: db.rows("sourceItemEngagementObservation").filter((row) => row.hasRegression).length } : authority };
  }) };
  const fetcher = { fetch: jest.fn(async () => ok<readonly MetricFetchObservation[]>([{ externalId: original.externalId, returned: true,
    reason: null, metadata: { kind: "reddit_post", score: 42, numComments: 9 } }])) };
  const receipts = new SecureMetricRefreshReceipts(createRecoveryEvidenceFilesystemTestHarness(root));
  const clock = new FixedClock(new Date(now));
  const usecase = () => new RefreshRetainedMetricsUseCase(inventory, fetcher, projection, receipts, clock, metricRefreshDigest);
  return { db, original, projection, inventory, fetcher, receipts, clock, usecase };
}
