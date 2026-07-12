import {
  FixedClock,
  REDACTED_VALUE,
  type IdGenerator,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type { ScanAttempt, SourceItem } from "../../domain";
import type {
  ConversationProjectionPort,
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  FeedProjectionPort,
  EnrichSourceItemsCommand,
  EnrichSourceItemsResult,
  ProjectFeedItemsCommand,
  ProjectFeedItemsResult,
  ProjectConversationUnitsCommand,
  ProjectConversationUnitsResult,
  ScanAttemptRepositoryPort,
  ScanCursorRepositoryPort,
  ScanExecutionReporterPort,
  ScanFailureQueuePort,
  ScanLease,
  ScanLeasePort,
  SavedSourceItemRef,
  SaveSourceItemsCommand,
  SaveSourceItemsResult,
  SourceFetcherPort,
  SourceItemEnrichmentPort,
  SourceItemRepositoryPort,
} from "../../ports";
import { SourceFetchError } from "../../ports";
import type { ExecuteScanCommand } from "./execute-scan.command";
import { ExecuteScanUseCase } from "./execute-scan.use-case";

const fixtureSecret = ["source", "secret"].join("-");
const authorizationScheme = ["Bear", "er"].join("");

const makeExecuteScanCommand = (
  overrides: Partial<ExecuteScanCommand> = {},
): ExecuteScanCommand => ({
  tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"),
  scanJobId: "scan-job-1",
  interestId: "topic-1",
  sourceBindingId: "source-binding-1",
  scanPolicyId: "scan-policy-1",
  providerKey: "fake-source",
  sourceQuery: { mode: "search", query: "monitoring" },
  correlationId: "correlation-1",
  causationId: "causation-1",
  ...overrides,
});

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `source-item-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FixedSourceFetcher implements SourceFetcherPort {
  readonly calls: FetchSourceItemsCommand[] = [];

  constructor(private readonly warnings: readonly string[] = []) {}

  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    this.calls.push(command);

    return {
      items: [
        {
          externalId: "external-1",
          canonicalUrl: "https://example.test/external-1",
          title: "External 1",
          body: "Body 1",
          authorHandle: "author",
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
        },
        {
          externalId: "external-2",
          canonicalUrl: "https://example.test/external-2",
          title: "External 2",
          body: "Body 2",
          authorHandle: "author",
          publishedAt: new Date("2026-06-05T00:01:00.000Z"),
        },
      ],
      nextCursor: "cursor-after-scan",
      warnings: this.warnings,
    };
  }
}

class ConversationSourceFetcher implements SourceFetcherPort {
  async fetch(
    command: FetchSourceItemsCommand,
  ): Promise<FetchSourceItemsResult> {
    void command;

    return {
      items: [
        {
          externalId: "reddit:t3_post_1",
          canonicalUrl: "https://reddit.test/r/topic/comments/post_1",
          title: "Root Reddit post",
          body: "Root post body",
          authorHandle: "post-author",
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
          metadata: {
            kind: "reddit_post",
            subreddit: "topic",
            score: 42,
          },
        },
      ],
      conversationUnits: [
        {
          rootExternalId: "reddit:t3_post_1",
          rootProviderItemId: "t3_post_1",
          providerUnitId: "t1_comment_1",
          canonicalUrl:
            "https://reddit.test/r/topic/comments/post_1/_/comment_1",
          body: "High-signal comment body",
          authorHandle: "comment-author",
          publishedAt: new Date("2026-06-05T00:05:00.000Z"),
          threadExternalId: "t3_post_1",
          depth: 0,
          role: "top_level_comment",
          metadata: {
            kind: "reddit_comment",
            subreddit: "topic",
            score: 25,
            replies: 2,
            depth: 0,
            role: "top_level_comment",
          },
        },
      ],
    };
  }
}

class SensitiveSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    return {
      items: [
        {
          externalId: `external-1?access_token=${fixtureSecret}`,
          canonicalUrl: `https://user:pass@example.test/source?access_token=${fixtureSecret}`,
          title: `Launch notes client_secret=${fixtureSecret}`,
          body: `Body includes Authorization ${authorizationScheme} ${fixtureSecret} and private_key=${fixtureSecret}.`,
          authorHandle: `${authorizationScheme} ${fixtureSecret}`,
          publishedAt: new Date("2026-06-05T00:00:00.000Z"),
          metadata: {
            accessToken: fixtureSecret,
            nested: {
              url: "https://user:pass@example.test/source",
            },
          },
        },
      ],
      nextCursor: "cursor-after-sensitive-scan",
    };
  }
}

class FailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new Error("Provider unavailable");
  }
}

class ClassifiedFailingSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new SourceFetchError({
      providerKey: "reddit",
      kind: "auth_failed",
      retryable: false,
      message: "Reddit OAuth token expired",
    });
  }
}

class RateLimitedSourceFetcher implements SourceFetcherPort {
  async fetch(): Promise<FetchSourceItemsResult> {
    throw new SourceFetchError({
      providerKey: "x-twitter",
      kind: "rate_limited",
      retryable: true,
      retryAfterMs: 900_000,
      rateLimitResetAt: new Date("2026-06-05T12:15:00.000Z"),
      message: "X collector rate limit reached",
    });
  }
}

class FakeSourceItemRepository implements SourceItemRepositoryPort {
  private readonly itemsByKey = new Map<string, SourceItem>();

  async saveBatch(
    command: SaveSourceItemsCommand,
  ): Promise<SaveSourceItemsResult> {
    let inserted = 0;
    let skippedDuplicates = 0;
    const savedItems: SavedSourceItemRef[] = [];

    for (const item of command.items) {
      const snapshot = item.toSnapshot();
      const key = `${command.tenantId}:${command.workspaceId}:${snapshot.sourceBindingId}:${snapshot.externalId}`;

      const existing = this.itemsByKey.get(key);
      if (existing !== undefined) {
        skippedDuplicates += 1;
        savedItems.push({
          externalId: snapshot.externalId,
          sourceItemId: existing.toSnapshot().id,
          inserted: false,
          mutationKind: "unchanged",
        });
        continue;
      }

      this.itemsByKey.set(key, item);
      inserted += 1;
      savedItems.push({
        externalId: snapshot.externalId,
        sourceItemId: snapshot.id,
        inserted: true,
        mutationKind: "inserted",
      });
    }

    return { inserted, contentUpdated: 0, skippedDuplicates, items: savedItems };
  }

  all(): readonly SourceItem[] {
    return [...this.itemsByKey.values()];
  }
}

class FakeFeedProjection implements FeedProjectionPort {
  readonly commands: ProjectFeedItemsCommand[] = [];

  async project(
    command: ProjectFeedItemsCommand,
  ): Promise<ProjectFeedItemsResult> {
    this.commands.push(command);
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

class FakeConversationProjection implements ConversationProjectionPort {
  readonly commands: ProjectConversationUnitsCommand[] = [];

  async project(
    command: ProjectConversationUnitsCommand,
  ): Promise<ProjectConversationUnitsResult> {
    this.commands.push(command);

    return {
      projected: command.conversationUnits.length,
      skippedOrphans: 0,
      skippedInvalid: 0,
    };
  }
}

class EnrichingSourceItemEnrichment implements SourceItemEnrichmentPort {
  readonly commands: EnrichSourceItemsCommand[] = [];

  async enrich(
    command: EnrichSourceItemsCommand,
  ): Promise<EnrichSourceItemsResult> {
    this.commands.push(command);

    return {
      items: command.items.map((item) => ({
        ...item,
        body: `${item.body}\n\nArticle text:\nFull external article body.`,
        metadata: {
          ...(item.metadata ?? {}),
          articleContent: {
            status: "enriched",
            semanticFingerprint: "feedfacecafebeef",
            contentHash: "content-hash-1",
          },
        },
      })),
      enriched: command.items.length,
      skipped: 0,
      failed: 0,
    };
  }
}

class FakeScanAttemptRepository implements ScanAttemptRepositoryPort {
  private readonly attempts = new Map<string, ScanAttempt>();

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.scanJobId}`,
      attempt,
    );
  }

  async findByScanJob(
    params: Parameters<ScanAttemptRepositoryPort["findByScanJob"]>[0],
  ): Promise<ScanAttempt | null> {
    return (
      this.attempts.get(
        `${params.tenantId}:${params.workspaceId}:${params.scanJobId}`,
      ) ?? null
    );
  }
}

class FakeScanCursorRepository implements ScanCursorRepositoryPort {
  readonly saved: unknown[] = [];
  private cursor: Parameters<ScanCursorRepositoryPort["save"]>[0] | null = null;

  async save(
    command: Parameters<ScanCursorRepositoryPort["save"]>[0],
  ): Promise<void> {
    this.saved.push(command);
    this.cursor = command;
  }

  seed(command: Parameters<ScanCursorRepositoryPort["save"]>[0]): void {
    this.cursor = command;
  }

  async findBySourceBinding(): Promise<
    Parameters<ScanCursorRepositoryPort["save"]>[0] | null
  > {
    return this.cursor;
  }
}

class FakeScanFailureQueue implements ScanFailureQueuePort {
  readonly retries: unknown[] = [];
  readonly deadLetters: unknown[] = [];

  async enqueueRetry(
    command: Parameters<ScanFailureQueuePort["enqueueRetry"]>[0],
  ): Promise<void> {
    this.retries.push(command);
  }

  async deadLetter(
    command: Parameters<ScanFailureQueuePort["deadLetter"]>[0],
  ): Promise<void> {
    this.deadLetters.push(command);
  }
}

class FakeScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: unknown[] = [];
  readonly failed: unknown[] = [];

  async reportSucceeded(
    command: Parameters<ScanExecutionReporterPort["reportSucceeded"]>[0],
  ): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(
    command: Parameters<ScanExecutionReporterPort["reportFailed"]>[0],
  ): Promise<void> {
    this.failed.push(command);
  }
}

class FakeScanLease implements ScanLeasePort {
  readonly acquired: unknown[] = [];
  readonly released: ScanLease[] = [];
  private alreadyLeased = false;

  holdNextAcquire(): void {
    this.alreadyLeased = true;
  }

  async acquire(
    command: Parameters<ScanLeasePort["acquire"]>[0],
  ): Promise<ScanLease | null> {
    this.acquired.push(command);

    if (this.alreadyLeased) {
      return null;
    }

    return {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      workerId: command.workerId,
      fencingToken: `${command.scanJobId}:${command.workerId}:test`,
      leasedAt: command.leasedAt,
      expiresAt: new Date(
        command.leasedAt.getTime() + command.ttlSeconds * 1000,
      ),
    };
  }

  async release(lease: ScanLease): Promise<void> {
    this.released.push(lease);
  }
}

describe("ExecuteScanUseCase", () => {
  it("fetches source items and persists new canonical items", async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const attempts = new FakeScanAttemptRepository();
    const cursors = new FakeScanCursorRepository();
    const reporter = new FakeScanExecutionReporter();
    const leases = new FakeScanLease();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
      attempts,
      cursors,
      reporter,
      new FakeScanFailureQueue(),
      leases,
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(makeExecuteScanCommand());

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: "scan-job-1",
        fetched: 2,
        inserted: 2,
        skippedDuplicates: 0,
        projected: 2,
        warnings: [],
      },
    });
    expect(fetcher.calls).toHaveLength(1);
    expect(fetcher.calls[0]).toEqual(
      expect.objectContaining({
        providerKey: "fake-source",
        sourceQuery: { mode: "search", query: "monitoring" },
        cursor: undefined,
      }),
    );
    expect(repository.all()).toHaveLength(2);
    expect(projection.commands).toHaveLength(1);
    expect(projection.commands[0]?.snapshots).toEqual({
      interestQuerySnapshot: {
        interestId: "topic-1",
        query: "monitoring",
      },
      sourceBindingSnapshot: {
        sourceBindingId: "source-binding-1",
        providerKey: "fake-source",
        sourceQuery: {
          mode: "search",
          query: "monitoring",
        },
      },
      workspaceScopeSnapshot: {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
      },
    });
    expect(reporter.succeeded).toEqual([
      expect.objectContaining({
        scanJobId: "scan-job-1",
        completedAt: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ]);
    expect(reporter.failed).toHaveLength(0);
    expect(leases.released).toHaveLength(1);
    expect(cursors.saved).toEqual([
      expect.objectContaining({
        sourceBindingId: "source-binding-1",
        cursor: "cursor-after-scan",
        committedAt: new Date("2026-06-05T12:00:00.000Z"),
      }),
    ]);
    await expect(
      attempts.findByScanJob({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scanJobId: "scan-job-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        toSnapshot: expect.any(Function),
      }),
    );
    expect(
      (
        await attempts.findByScanJob({
          tenantId: tenantId("tenant-1"),
          workspaceId: workspaceId("workspace-1"),
          scanJobId: "scan-job-1",
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: "succeeded",
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
  });

  it("returns redacted source warnings and passes them to the success reporter", async () => {
    const fetcher = new FixedSourceFetcher([
      "Reddit comment enrichment degraded: token=source-secret",
      "Reddit comment enrichment degraded: token=source-secret",
      "   ",
    ]);
    const reporter = new FakeScanExecutionReporter();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      reporter,
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(makeExecuteScanCommand());

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.warnings : []).toEqual([
      "Reddit comment enrichment degraded: token=[REDACTED]",
    ]);
    expect(reporter.succeeded).toEqual([
      expect.objectContaining({
        warnings: ["Reddit comment enrichment degraded: token=[REDACTED]"],
      }),
    ]);
  });

  it("projects fetched conversation units after root feed items are projected", async () => {
    const projection = new FakeFeedProjection();
    const conversationProjection = new FakeConversationProjection();
    const useCase = new ExecuteScanUseCase(
      new ConversationSourceFetcher(),
      new FakeSourceItemRepository(),
      projection,
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
      undefined,
      undefined,
      conversationProjection,
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        providerKey: "reddit",
      }),
    );

    expect(result.ok).toBe(true);
    expect(
      projection.commands[0]?.sourceItems.map(
        (item) => item.toSnapshot().externalId,
      ),
    ).toEqual(["reddit:t3_post_1"]);
    expect(conversationProjection.commands).toHaveLength(1);
    expect(conversationProjection.commands[0]).toMatchObject({
      providerKey: "reddit",
      interestId: "topic-1",
      projectedFeedItems: [
        {
          sourceExternalId: "reddit:t3_post_1",
          feedItemId: "feed:reddit:t3_post_1",
        },
      ],
      conversationUnits: [
        {
          rootExternalId: "reddit:t3_post_1",
          providerUnitId: "t1_comment_1",
          metadata: {
            kind: "reddit_comment",
            score: 25,
          },
        },
      ],
    });
  });

  it("redacts sensitive source item fields before persistence and projection", async () => {
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const useCase = new ExecuteScanUseCase(
      new SensitiveSourceFetcher(),
      repository,
      projection,
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    await useCase.execute(makeExecuteScanCommand());

    const stored = repository.all()[0]?.toSnapshot();
    expect(stored).toEqual(
      expect.objectContaining({
        externalId: `external-1?access_token=${REDACTED_VALUE}`,
        canonicalUrl: "https://example.test/source",
        title: `Launch notes client_secret=${REDACTED_VALUE}`,
        body: `Body includes Authorization ${REDACTED_VALUE} and private_key=${REDACTED_VALUE}`,
        authorHandle: REDACTED_VALUE,
        metadata: {
          accessToken: REDACTED_VALUE,
          nested: {
            url: REDACTED_VALUE,
          },
        },
      }),
    );
    expect(JSON.stringify(stored)).not.toContain(fixtureSecret);
    expect(JSON.stringify(projection.commands[0]?.sourceItems)).not.toContain(
      fixtureSecret,
    );
  });

  it("skips duplicate source items on replay", async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );
    const command = makeExecuteScanCommand();

    await useCase.execute(command);
    const result = await useCase.execute(command);

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: "scan-job-1",
        fetched: 2,
        inserted: 0,
        skippedDuplicates: 2,
        projected: 0,
        warnings: [],
      },
    });
    expect(repository.all()).toHaveLength(2);
    expect(projection.commands).toHaveLength(1);
  });

  it("enriches fetched source items before persistence and feed projection", async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const enrichment = new EnrichingSourceItemEnrichment();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
      undefined,
      enrichment,
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        providerKey: "rss",
        scanJobId: "scan-job-enriched",
      }),
    );

    expect(result.ok).toBe(true);
    expect(enrichment.commands).toEqual([
      expect.objectContaining({
        providerKey: "rss",
        sourceBindingId: "source-binding-1",
        items: expect.any(Array),
      }),
    ]);
    expect(repository.all()[0]?.toSnapshot()).toMatchObject({
      body: expect.stringContaining("Full external article body."),
      metadata: {
        articleContent: {
          status: "enriched",
          semanticFingerprint: "feedfacecafebeef",
          contentHash: "content-hash-1",
        },
      },
    });
    expect(
      projection.commands[0]?.sourceItems[0]?.toSnapshot().metadata,
    ).toMatchObject({
      articleContent: {
        semanticFingerprint: "feedfacecafebeef",
      },
    });
  });

  it("passes the last committed cursor to the source fetcher before saving the next cursor", async () => {
    const fetcher = new FixedSourceFetcher();
    const cursors = new FakeScanCursorRepository();
    cursors.seed({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "source-binding-1",
      cursor: "cursor-before-scan",
      committedAt: new Date("2026-06-05T11:00:00.000Z"),
    });
    const useCase = new ExecuteScanUseCase(
      fetcher,
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      cursors,
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(makeExecuteScanCommand());

    expect(result.ok).toBe(true);
    expect(fetcher.calls[0]).toEqual(
      expect.objectContaining({
        cursor: "cursor-before-scan",
      }),
    );
    expect(cursors.saved).toEqual([
      expect.objectContaining({
        cursor: "cursor-after-scan",
      }),
    ]);
  });

  it("marks scan attempt as failed when provider fetch fails", async () => {
    const attempts = new FakeScanAttemptRepository();
    const failures = new FakeScanFailureQueue();
    const cursors = new FakeScanCursorRepository();
    const reporter = new FakeScanExecutionReporter();
    const leases = new FakeScanLease();
    const useCase = new ExecuteScanUseCase(
      new FailingSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      attempts,
      cursors,
      reporter,
      failures,
      leases,
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-failed",
      }),
    );

    expect(result.ok).toBe(false);
    expect(
      (
        await attempts.findByScanJob({
          tenantId: tenantId("tenant-1"),
          workspaceId: workspaceId("workspace-1"),
          scanJobId: "scan-job-failed",
        })
      )?.toSnapshot(),
    ).toMatchObject({
      status: "failed",
      failureReason: "Provider unavailable",
    });
    expect(failures.retries).toHaveLength(1);
    expect(failures.deadLetters).toHaveLength(0);
    expect(cursors.saved).toHaveLength(0);
    expect(reporter.failed).toEqual([
      expect.objectContaining({
        scanJobId: "scan-job-failed",
        failureReason: "Provider unavailable",
      }),
    ]);
    expect(reporter.succeeded).toHaveLength(0);
    expect(leases.released).toHaveLength(1);
  });

  it("dead letters failed scan when retry budget is exhausted", async () => {
    const failures = new FakeScanFailureQueue();
    const useCase = new ExecuteScanUseCase(
      new FailingSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      failures,
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-dead-letter",
        attemptNumber: 3,
        retryBudget: 3,
      }),
    );

    expect(result.ok).toBe(false);
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toHaveLength(1);
  });

  it("dead letters failed scan without retry when retry budget is zero", async () => {
    const failures = new FakeScanFailureQueue();
    const useCase = new ExecuteScanUseCase(
      new FailingSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      failures,
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-zero-retry",
        retryBudget: 0,
      }),
    );

    expect(result.ok).toBe(false);
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toEqual([
      expect.objectContaining({
        scanJobId: "scan-job-zero-retry",
        attemptNumber: 1,
        retryBudget: 0,
      }),
    ]);
  });

  it("keeps classified provider failure metadata and stops downstream writes", async () => {
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const attempts = new FakeScanAttemptRepository();
    const cursors = new FakeScanCursorRepository();
    const reporter = new FakeScanExecutionReporter();
    const failures = new FakeScanFailureQueue();
    const useCase = new ExecuteScanUseCase(
      new ClassifiedFailingSourceFetcher(),
      repository,
      projection,
      attempts,
      cursors,
      reporter,
      failures,
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        providerKey: "reddit",
        scanJobId: "scan-job-auth-failed",
      }),
    );

    expect(result.ok).toBe(false);
    const failureReason = (
      await attempts.findByScanJob({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scanJobId: "scan-job-auth-failed",
      })
    )?.toSnapshot().failureReason;
    expect(failureReason).toContain("provider=reddit");
    expect(failureReason).toContain("kind=auth_failed");
    expect(failureReason).toContain("retryable=false");
    expect(failureReason).toContain("message=Reddit OAuth token expired");
    expect(
      (reporter.failed[0] as { readonly failureReason?: string }).failureReason,
    ).toBe(failureReason);
    expect(
      (reporter.failed[0] as { readonly failureMetadata?: unknown })
        .failureMetadata,
    ).toEqual({
      providerKey: "reddit",
      kind: "auth_failed",
      retryable: false,
    });
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toHaveLength(1);
    expect(
      (failures.deadLetters[0] as { readonly failureReason?: string })
        .failureReason,
    ).toBe(failureReason);
    expect(repository.all()).toHaveLength(0);
    expect(projection.commands).toHaveLength(0);
    expect(cursors.saved).toHaveLength(0);
  });

  it("does not immediately retry provider rate limits and records provider reset metadata", async () => {
    const attempts = new FakeScanAttemptRepository();
    const failures = new FakeScanFailureQueue();
    const reporter = new FakeScanExecutionReporter();
    const useCase = new ExecuteScanUseCase(
      new RateLimitedSourceFetcher(),
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      attempts,
      new FakeScanCursorRepository(),
      reporter,
      failures,
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        providerKey: "x-twitter",
        scanJobId: "scan-job-rate-limited",
        attemptNumber: 1,
        retryBudget: 3,
      }),
    );

    expect(result.ok).toBe(false);
    const failureReason = (
      await attempts.findByScanJob({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scanJobId: "scan-job-rate-limited",
      })
    )?.toSnapshot().failureReason;
    expect(failureReason).toContain("provider=x-twitter");
    expect(failureReason).toContain("kind=rate_limited");
    expect(
      (reporter.failed[0] as { readonly failureMetadata?: unknown })
        .failureMetadata,
    ).toEqual({
      providerKey: "x-twitter",
      kind: "rate_limited",
      retryable: true,
      retryAfterMs: 900_000,
      rateLimitResetAt: "2026-06-05T12:15:00.000Z",
    });
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toEqual([
      expect.objectContaining({
        scanJobId: "scan-job-rate-limited",
        failureReason,
      }),
    ]);
  });

  it("rejects execution before provider fetch when scan job is already leased", async () => {
    const fetcher = new FixedSourceFetcher();
    const attempts = new FakeScanAttemptRepository();
    const failures = new FakeScanFailureQueue();
    const leases = new FakeScanLease();
    leases.holdNextAcquire();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      attempts,
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      failures,
      leases,
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-leased",
        workerId: "worker-1",
        leaseTtlSeconds: 60,
      }),
    );

    expect(result.ok).toBe(false);
    expect(fetcher.calls).toHaveLength(0);
    await expect(
      attempts.findByScanJob({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scanJobId: "scan-job-leased",
      }),
    ).resolves.toBeNull();
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toHaveLength(0);
    expect(leases.released).toHaveLength(0);
  });
});
