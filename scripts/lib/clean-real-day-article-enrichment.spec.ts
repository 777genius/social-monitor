import { InMemoryScanLeaseAdapter } from "@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter";
import { InMemoryScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository";
import { InMemorySourceCandidateMemoryRepository } from "@social-monitor/ingestion/adapters/persistence/in-memory-source-candidate-memory.repository";
import { InMemorySourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository";
import { IsolatedScanCursorRepository } from "@social-monitor/ingestion/adapters/persistence/isolated-scan-cursor.repository";
import { PrismaScanAttemptRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository";
import { PrismaScanLeaseAdapter } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter";
import { PrismaSourceCandidateMemoryRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-candidate-memory.repository";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import { RegistrySourceFetcherAdapter } from "@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter";
import { HttpReadabilityArticleContentExtractor } from "@social-monitor/ingestion/adapters/enrichment/http-readability-article-content-extractor";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import { SourceItem } from "@social-monitor/ingestion/domain/entities/source-item";
import { readArticleCaptureAttempt } from "@social-monitor/ingestion/domain/value-objects/article-capture-attempt";
import { captureSha256, readContentCapture } from "@social-monitor/ingestion/domain/value-objects/source-content-capture";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaIngestionWorkerConnection } from "../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { buildLiveRuntime } from "./clean-real-day-provider-acquisition";

describe("finite collection article enrichment composition", () => {
  afterEach(() => jest.restoreAllMocks());

  it("dispatches the pending backlog over multiple empty/304 scans without starving rows past the 20-item cap", async () => {
    const scope = { tenantId: tenantId("10000000-0000-4000-8000-000000000001"),
      workspaceId: workspaceId("20000000-0000-4000-8000-000000000002"),
      sourceBindingId: "30000000-0000-4000-8000-000000000003", providerKey: "rss" };
    const repository = new InMemorySourceItemRepository();
    const nativeAt = new Date("2026-10-31T12:00:00Z");
    await repository.saveBatch({ ...scope, items: Array.from({ length: 25 }, (_, index) =>
      SourceItem.ingest({ ...scope, id: `source-${index}`, externalId: `rss:${index}`,
        canonicalUrl: `https://example.test/article/${index}`, title: `Article ${index}`,
        body: "Native RSS description", publishedAt: nativeAt, ingestedAt: nativeAt,
        metadata: { kind: "rss_item", feedUrl: "https://example.test/feed.xml" } })) });
    jest.spyOn(PrismaSourceItemRepository.prototype, "saveBatch").mockImplementation(repository.saveBatch.bind(repository));
    jest.spyOn(PrismaSourceItemRepository.prototype, "findDueArticleCaptures").mockImplementation(repository.findDueArticleCaptures.bind(repository));
    jest.spyOn(PrismaSourceItemRepository.prototype, "reserveArticleCapture").mockImplementation(repository.reserveArticleCapture.bind(repository));
    jest.spyOn(PrismaSourceItemRepository.prototype, "completeArticleCapture").mockImplementation(repository.completeArticleCapture.bind(repository));
    const attempts = new InMemoryScanAttemptRepository();
    jest.spyOn(PrismaScanAttemptRepository.prototype, "save").mockImplementation(attempts.save.bind(attempts));
    jest.spyOn(PrismaScanAttemptRepository.prototype, "findByScanJob").mockImplementation(attempts.findByScanJob.bind(attempts));
    const leases = new InMemoryScanLeaseAdapter();
    jest.spyOn(PrismaScanLeaseAdapter.prototype, "acquire").mockImplementation(leases.acquire.bind(leases));
    jest.spyOn(PrismaScanLeaseAdapter.prototype, "release").mockImplementation(leases.release.bind(leases));
    const memory = new InMemorySourceCandidateMemoryRepository();
    jest.spyOn(PrismaSourceCandidateMemoryRepository.prototype, "screen").mockImplementation(memory.screen.bind(memory));
    jest.spyOn(PrismaSourceCandidateMemoryRepository.prototype, "remember").mockImplementation(memory.remember.bind(memory));
    jest.spyOn(RegistrySourceFetcherAdapter.prototype, "fetch").mockResolvedValue({ items: [], warnings: [] });
    jest.spyOn(PrismaFeedProjectionAdapter.prototype, "project").mockImplementation(async command => ({
      projected: command.sourceItems.length, projectedItems: [],
    }));
    jest.spyOn(PrismaSourceEngagementProjectionAdapter.prototype, "project").mockResolvedValue({
      currentSnapshotsUpdated: 0, observationsAppended: 0, metricChanges: 0, regressionsObserved: 0,
    });
    const text = "Verified article detail and caveat. ".repeat(20);
    const extract = jest.spyOn(HttpReadabilityArticleContentExtractor.prototype, "extract")
      .mockImplementation(async ({ url }) => ({ ok: true, sourceUrl: url, finalUrl: url,
        text, textLength: text.length, originalTextLength: text.length, truncated: false,
        fullTextSha256: captureSha256(text), extractionVersion: "readability.text.v2",
        contentHash: "fixture-hash", semanticFingerprint: "fixture-fingerprint", wordCount: 100 }));
    // Only external I/O is replaced. The finite collector's actual composition,
    // ExecuteScanUseCase, capture reservations and completion flow remain real.
    const runtime = buildLiveRuntime({ connection: {} as PrismaIngestionWorkerConnection,
      targets: [], includeGitHub: false, scanExecution: {
        scanCursors: new IsolatedScanCursorRepository(scope),
        reporter: { reportSucceeded: async () => undefined, reportFailed: async () => undefined },
        scanJobIdForAttempt: () => "unused", correlationId: "fixture", causationId: "fixture",
      } });
    const scan = (id: string) => runtime.executeScan.execute({ ...scope, scanJobId: id,
      interestId: "40000000-0000-4000-8000-000000000004", scanPolicyId: "50000000-0000-4000-8000-000000000005",
      sourceQuery: { mode: "url", query: "https://example.test/feed.xml" },
      correlationId: "fixture", causationId: "fixture", leaseTtlSeconds: 600 });

    expect((await scan("scan-first")).ok).toBe(true);
    expect(extract).toHaveBeenCalledTimes(20);
    expect(repository.all().filter(item => readContentCapture(item.toSnapshot())?.article !== undefined)).toHaveLength(20);
    expect((await scan("scan-second")).ok).toBe(true);
    expect(extract).toHaveBeenCalledTimes(25);
    expect(repository.all()).toHaveLength(25);
    for (const item of repository.all()) {
      expect(readArticleCaptureAttempt(item.toSnapshot())).toMatchObject({ status: "succeeded", attemptCount: 1 });
      expect(item.toSnapshot().body).toContain("Verified article detail and caveat.");
    }
    expect((await scan("scan-complete")).ok).toBe(true);
    expect(extract).toHaveBeenCalledTimes(25);
  });
});
