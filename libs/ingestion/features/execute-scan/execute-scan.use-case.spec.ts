import {
  FixedClock,
  REDACTED_VALUE,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ScanAttempt } from "../../domain";
import { ExecuteScanUseCase } from "./execute-scan.use-case";
import {
  ClassifiedFailingSourceFetcher,
  ConversationSourceFetcher,
  EnrichingSourceItemEnrichment,
  FailingSourceFetcher,
  FakeConversationProjection,
  FakeFeedProjection,
  FakeScanAttemptRepository,
  FakeScanCursorRepository,
  FakeScanExecutionReporter,
  FakeScanFailureQueue,
  FakeScanLease,
  FakeSourceItemRepository,
  FixedSourceFetcher,
  RateLimitedSourceFetcher,
  SensitiveSourceFetcher,
  SequenceIdGenerator,
  fixtureSecret,
  makeExecuteScanCommand,
} from "./execute-scan.use-case.spec-support";

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
      attemptNumber: 1,
      status: "succeeded",
      fetched: 2,
      inserted: 2,
      skippedDuplicates: 0,
      projected: 2,
    });
  });

  it("treats duplicate delivery after completion as a no-op", async () => {
    const fetcher = new FixedSourceFetcher();
    const repository = new FakeSourceItemRepository();
    const projection = new FakeFeedProjection();
    const attempts = new FakeScanAttemptRepository();
    const reporter = new FakeScanExecutionReporter();
    const useCase = new ExecuteScanUseCase(
      fetcher,
      repository,
      projection,
      attempts,
      new FakeScanCursorRepository(),
      reporter,
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );
    const command = makeExecuteScanCommand();

    const first = await useCase.execute(command);
    const duplicate = await useCase.execute(command);

    expect(first.ok).toBe(true);
    expect(duplicate).toEqual(first);
    expect(fetcher.calls).toHaveLength(1);
    expect(repository.all()).toHaveLength(2);
    expect(projection.commands).toHaveLength(1);
    expect(reporter.succeeded).toHaveLength(1);
    expect(reporter.failed).toHaveLength(0);
  });

  it("rejects the failed attempt duplicate but allows the next retry attempt", async () => {
    const fetcher = new FixedSourceFetcher();
    const attempts = new FakeScanAttemptRepository();
    const failures = new FakeScanFailureQueue();
    const reporter = new FakeScanExecutionReporter();
    const failedAttempt = ScanAttempt.start({
      scanJobId: "scan-job-retry",
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      sourceBindingId: "source-binding-1",
      attemptNumber: 1,
      startedAt: new Date("2026-06-05T11:55:00.000Z"),
    }).fail({
      finishedAt: new Date("2026-06-05T11:56:00.000Z"),
      failureReason: "Provider unavailable",
    });
    await attempts.save(failedAttempt);
    const useCase = new ExecuteScanUseCase(
      fetcher,
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

    const duplicate = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-retry",
        attemptNumber: 1,
        retryBudget: 3,
      }),
    );
    const retry = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-retry",
        attemptNumber: 2,
        retryBudget: 3,
      }),
    );

    expect(duplicate.ok).toBe(false);
    expect(retry.ok).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect(reporter.succeeded).toHaveLength(1);
    expect(reporter.failed).toHaveLength(0);
    expect(failures.retries).toHaveLength(0);
    expect(failures.deadLetters).toHaveLength(0);
    expect(
      (
        await attempts.findByScanJob({
          tenantId: tenantId("tenant-1"),
          workspaceId: workspaceId("workspace-1"),
          scanJobId: "scan-job-retry",
        })
      )?.toSnapshot(),
    ).toMatchObject({
      attemptNumber: 2,
      status: "succeeded",
    });
  });

  it("reclaims a running attempt after its worker lease expires", async () => {
    const fetcher = new FixedSourceFetcher();
    const attempts = new FakeScanAttemptRepository();
    const leases = new FakeScanLease();
    await attempts.save(
      ScanAttempt.start({
        scanJobId: "scan-job-crashed",
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        sourceBindingId: "source-binding-1",
        attemptNumber: 1,
        startedAt: new Date("2026-06-05T11:50:00.000Z"),
      }),
    );
    await leases.acquire({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scanJobId: "scan-job-crashed",
      workerId: "crashed-worker",
      leasedAt: new Date("2026-06-05T11:50:00.000Z"),
      ttlSeconds: 60,
    });
    const useCase = new ExecuteScanUseCase(
      fetcher,
      new FakeSourceItemRepository(),
      new FakeFeedProjection(),
      attempts,
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      leases,
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({
        scanJobId: "scan-job-crashed",
        workerId: "replacement-worker",
        attemptNumber: 1,
      }),
    );

    expect(result.ok).toBe(true);
    expect(fetcher.calls).toHaveLength(1);
    expect(
      leases.current({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        scanJobId: "scan-job-crashed",
      }),
    ).toBeNull();
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

  it("applies engagement after the full feed projection", async () => {
    const projectionOrder: string[] = [];
    const feedProjection = new FakeFeedProjection();
    const orderedFeedProjection = {
      async project(command: Parameters<FakeFeedProjection["project"]>[0]) {
        projectionOrder.push("feed");
        return feedProjection.project(command);
      },
    };
    const engagementProjection = {
      async project() {
        projectionOrder.push("engagement");
        return {
          currentSnapshotsUpdated: 1,
          observationsAppended: 1,
          metricChanges: 1,
          regressionsObserved: 0,
        };
      },
    };
    const useCase = new ExecuteScanUseCase(
      new ConversationSourceFetcher(),
      new FakeSourceItemRepository(),
      orderedFeedProjection,
      new FakeScanAttemptRepository(),
      new FakeScanCursorRepository(),
      new FakeScanExecutionReporter(),
      new FakeScanFailureQueue(),
      new FakeScanLease(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-05T12:00:00.000Z")),
      undefined,
      undefined,
      undefined,
      undefined,
      engagementProjection,
    );

    const result = await useCase.execute(
      makeExecuteScanCommand({ providerKey: "reddit" }),
    );

    expect(result.ok).toBe(true);
    expect(projectionOrder).toEqual(["feed", "engagement"]);
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

  it("skips duplicate source items on a later scan", async () => {
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
    await useCase.execute(makeExecuteScanCommand());
    const result = await useCase.execute(
      makeExecuteScanCommand({ scanJobId: "scan-job-2" }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        scanJobId: "scan-job-2",
        fetched: 2,
        inserted: 0,
        skippedDuplicates: 2,
        projected: 2,
        warnings: [],
      },
    });
    expect(repository.all()).toHaveLength(2);
    expect(projection.commands).toHaveLength(2);
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
