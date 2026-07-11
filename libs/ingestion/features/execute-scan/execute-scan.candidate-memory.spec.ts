import {
  FixedClock,
  tenantId,
  workspaceId,
  type IdGenerator,
} from "@social-monitor/shared-kernel";

import type { ScanAttempt } from "../../domain";
import type {
  AcquireScanLeaseCommand,
  EnrichSourceItemsCommand,
  EnrichSourceItemsResult,
  FeedProjectionPort,
  FindScanAttemptQuery,
  FetchSourceItemsResult,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  RememberSourceCandidatesCommand,
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
  ScanAttemptRepositoryPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  ScanFailureQueuePort,
  ScanLease,
  ScanLeasePort,
  ScreenSourceCandidatesCommand,
  ScreenSourceCandidatesResult,
  SourceCandidateMemoryRecord,
  SourceCandidateMemoryPort,
  SourceFetcherPort,
  SourceItemEnrichmentPort,
  SourceItemRepositoryPort,
} from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import { ExecuteScanUseCase } from "./execute-scan.use-case";

describe("ExecuteScanUseCase candidate replay memory", () => {
  it("suppresses an unchanged replay and reprocesses changed metrics", async () => {
    const fixture = candidateMemoryFixture();

    const first = await fixture.execute.execute(scanCommand("scan-memory-1"));
    const replay = await fixture.execute.execute(scanCommand("scan-memory-2"));
    fixture.fetcher.likes = 8;
    const refreshed = await fixture.execute.execute(
      scanCommand("scan-memory-3"),
    );

    expect(first).toEqual({
      ok: true,
      value: expect.objectContaining({
        inserted: 1,
        skippedDuplicates: 0,
        projected: 1,
        warnings: [],
      }),
    });
    expect(replay).toEqual({
      ok: true,
      value: expect.objectContaining({
        inserted: 0,
        skippedDuplicates: 1,
        projected: 0,
        warnings: [],
      }),
    });
    expect(refreshed).toEqual({
      ok: true,
      value: expect.objectContaining({
        inserted: 0,
        skippedDuplicates: 1,
        projected: 1,
        warnings: [],
      }),
    });
    expect(fixture.enrichment.itemCounts).toEqual([1, 0, 1]);
    expect(fixture.sourceItems.itemCounts).toEqual([1, 0, 1]);
    expect(fixture.projection.itemCounts).toEqual([1, 0, 1]);
    expect(fixture.memory.all()).toEqual([
      expect.objectContaining({ seenCount: 2, decision: "processed" }),
    ]);
    expect(fixture.reporter.succeeded[1]).toEqual(
      expect.objectContaining({
        collectionTelemetry: expect.objectContaining({
          candidateMemorySuppressedItemCount: 1,
        }),
      }),
    );
  });

  it.each(["read", "write"] as const)(
    "fails open with a stable redacted warning when memory %s fails",
    async (failureMode) => {
      const candidateMemory = new FailingCandidateMemory(failureMode);
      const fixture = candidateMemoryFixture(candidateMemory);

      const result = await fixture.execute.execute(
        scanCommand(`scan-memory-${failureMode}-failure`),
      );

      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({
          inserted: 1,
          projected: 1,
          warnings: [`source_candidate_memory.${failureMode}_failed`],
        }),
      });
      expect(fixture.enrichment.itemCounts).toEqual([1]);
      expect(fixture.sourceItems.itemCounts).toEqual([1]);
      expect(fixture.projection.itemCounts).toEqual([1]);
      expect(JSON.stringify(result)).not.toContain(
        FailingCandidateMemory.failureDetail,
      );
      expect(JSON.stringify(fixture.reporter.succeeded)).not.toContain(
        FailingCandidateMemory.failureDetail,
      );
    },
  );
});

const candidateMemoryFixture = (
  candidateMemory?: SourceCandidateMemoryPort,
) => {
  const replayMemory = new TestCandidateMemory();
  const resolvedCandidateMemory = candidateMemory ?? replayMemory;
  const fetcher = new MutableCandidateFetcher();
  const sourceItems = new CountingSourceItemRepository();
  const projection = new CountingFeedProjection();
  const enrichment = new CountingEnrichment();
  const reporter = new RecordingReporter();

  return {
    fetcher,
    sourceItems,
    projection,
    enrichment,
    reporter,
    memory: replayMemory,
    execute: new ExecuteScanUseCase(
      fetcher,
      sourceItems,
      projection,
      new RecordingScanAttemptRepository(),
      new NoopScanCursorRepository(),
      reporter,
      new NoopScanFailureQueue(),
      new PermissiveScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-07-11T03:00:00.000Z")),
      undefined,
      enrichment,
      undefined,
      resolvedCandidateMemory,
    ),
  };
};

const scanCommand = (scanJobId: string): ExecuteScanCommand => ({
  tenantId: tenantId("00000000-0000-4000-8000-000000000001"),
  workspaceId: workspaceId("00000000-0000-4000-8000-000000000002"),
  scanJobId,
  interestId: "00000000-0000-4000-8000-000000000003",
  sourceBindingId: "00000000-0000-4000-8000-000000000004",
  scanPolicyId: "00000000-0000-4000-8000-000000000005",
  providerKey: "x-twitter",
  sourceQuery: {
    mode: "search",
    query: "agent monitoring",
    parameters: {
      targetPublishedWindow: {
        startInclusive: "2026-07-10T00:00:00.000Z",
        endExclusive: "2026-07-11T00:00:00.000Z",
      },
    },
  },
  interestQuerySnapshot: "agent monitoring",
  correlationId: `correlation-${scanJobId}`,
  causationId: `causation-${scanJobId}`,
});

class MutableCandidateFetcher implements SourceFetcherPort {
  likes = 4;

  async fetch(): Promise<FetchSourceItemsResult> {
    return {
      items: [
        {
          externalId: "x-twitter:123",
          canonicalUrl: "https://x.com/example/status/123",
          title: "Agent monitoring release",
          body: "A stable candidate body",
          authorHandle: "example",
          publishedAt: new Date("2026-07-10T12:00:00.000Z"),
          metadata: {
            kind: "x_post",
            metrics: { likes: this.likes, reposts: 2 },
          },
        },
      ],
      warnings: [],
    };
  }
}

class CountingEnrichment implements SourceItemEnrichmentPort {
  readonly itemCounts: number[] = [];

  async enrich(
    command: EnrichSourceItemsCommand,
  ): Promise<EnrichSourceItemsResult> {
    this.itemCounts.push(command.items.length);
    return {
      items: command.items,
      enriched: command.items.length,
      skipped: 0,
      failed: 0,
    };
  }
}

class CountingSourceItemRepository implements SourceItemRepositoryPort {
  readonly itemCounts: number[] = [];
  private readonly sourceItemIdByKey = new Map<string, string>();

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    this.itemCounts.push(command.items.length);
    let inserted = 0;
    let skippedDuplicates = 0;
    const items = command.items.map((item) => {
      const snapshot = item.toSnapshot();
      const key = `${command.tenantId}:${command.workspaceId}:${command.providerKey}:${snapshot.externalId}`;
      const existingId = this.sourceItemIdByKey.get(key);
      if (existingId !== undefined) {
        skippedDuplicates += 1;
        return {
          externalId: snapshot.externalId,
          sourceItemId: existingId,
          inserted: false,
        };
      }

      inserted += 1;
      this.sourceItemIdByKey.set(key, snapshot.id);
      return {
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        inserted: true,
      };
    });

    return { inserted, skippedDuplicates, items };
  }
}

class CountingFeedProjection implements FeedProjectionPort {
  readonly itemCounts: number[] = [];

  async project(
    command: ProjectFeedItemsCommand,
  ): Promise<ProjectFeedItemsResult> {
    this.itemCounts.push(command.sourceItems.length);
    return {
      projected: command.sourceItems.length,
      projectedItems: command.sourceItems.map((item) => {
        const snapshot = item.toSnapshot();
        return {
          sourceItemId: snapshot.id,
          sourceExternalId: snapshot.externalId,
          feedItemId: `feed:${snapshot.externalId}`,
        };
      }),
    };
  }
}

class RecordingScanAttemptRepository implements ScanAttemptRepositoryPort {
  private readonly attempts = new Map<string, ScanAttempt>();

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(snapshot.scanJobId, attempt);
  }

  async findByScanJob(
    query: FindScanAttemptQuery,
  ): Promise<ScanAttempt | null> {
    return this.attempts.get(query.scanJobId) ?? null;
  }
}

class NoopScanCursorRepository implements ScanCursorRepositoryPort {
  async save(): Promise<void> {}

  async findBySourceBinding(): Promise<null> {
    return null;
  }
}

class PermissiveScanLease implements ScanLeasePort {
  async acquire(command: AcquireScanLeaseCommand): Promise<ScanLease> {
    return {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      workerId: command.workerId,
      fencingToken: `lease:${command.scanJobId}`,
      leasedAt: command.leasedAt,
      expiresAt: new Date(
        command.leasedAt.getTime() + command.ttlSeconds * 1_000,
      ),
    };
  }

  async release(): Promise<void> {}
}

class TestCandidateMemory implements SourceCandidateMemoryPort {
  private readonly recordsByKey = new Map<
    string,
    SourceCandidateMemoryRecord
  >();

  async screen(
    command: ScreenSourceCandidatesCommand,
  ): Promise<ScreenSourceCandidatesResult> {
    const activeRecords = command.candidates.flatMap((candidate) => {
      const record = this.recordsByKey.get(
        memoryKey(command, candidate.externalId),
      );
      return record !== undefined &&
        record.policyVersion === command.policyVersion &&
        record.fingerprint === candidate.fingerprint &&
        record.expiresAt > command.screenedAt
        ? [record]
        : [];
    });

    return {
      suppressedExternalIds: activeRecords.map((record) => record.externalId),
      activeRecords,
    };
  }

  async remember(command: RememberSourceCandidatesCommand): Promise<void> {
    for (const candidate of command.candidates) {
      const key = memoryKey(command, candidate.externalId);
      const existing = this.recordsByKey.get(key);
      this.recordsByKey.set(key, {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        providerKey: command.providerKey,
        scopeFingerprint: command.scopeFingerprint,
        policyVersion: command.policyVersion,
        externalId: candidate.externalId,
        fingerprint: candidate.fingerprint,
        decision: candidate.decision,
        reasonCode: candidate.reasonCode,
        expiresAt: candidate.expiresAt,
        firstSeenAt: existing?.firstSeenAt ?? command.rememberedAt,
        lastSeenAt: command.rememberedAt,
        seenCount: (existing?.seenCount ?? 0) + 1,
      });
    }
  }

  all(): readonly SourceCandidateMemoryRecord[] {
    return [...this.recordsByKey.values()];
  }
}

const memoryKey = (
  command: ScreenSourceCandidatesCommand | RememberSourceCandidatesCommand,
  externalId: string,
): string =>
  [
    command.tenantId,
    command.workspaceId,
    command.interestId,
    command.sourceBindingId,
    command.providerKey,
    command.scopeFingerprint,
    externalId,
  ].join(":");

class RecordingReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

class NoopScanFailureQueue implements ScanFailureQueuePort {
  async enqueueRetry(): Promise<void> {}
  async deadLetter(): Promise<void> {}
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 0;

  generate(): string {
    this.nextId += 1;
    return `source-item-${this.nextId}`;
  }
}

class FailingCandidateMemory implements SourceCandidateMemoryPort {
  static readonly failureDetail = "candidate-memory-failure";

  constructor(private readonly failureMode: "read" | "write") {}

  async screen(): Promise<ScreenSourceCandidatesResult> {
    if (this.failureMode === "read") {
      throw new Error(FailingCandidateMemory.failureDetail);
    }
    return { suppressedExternalIds: [], activeRecords: [] };
  }

  async remember(): Promise<void> {
    if (this.failureMode === "write") {
      throw new Error(FailingCandidateMemory.failureDetail);
    }
  }
}
