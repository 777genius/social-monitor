import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { ScanJob, SourceBinding, Topic } from "../../domain";
import type {
  FindScanExecutionAttemptQuery,
  ListScanJobsBySourceBindingQuery,
  ListScanJobsBySourceBindingResult,
  ListScanJobsBySourceBindingWindowQuery,
  ListScanJobsBySourceBindingWindowResult,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ListTopicsQuery,
  ListTopicsResult,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanJobHistoryReadPort,
  SourceBindingRepositoryPort,
  TopicRepositoryPort,
} from "../../ports";
import { ListTopicSourceDailyHistoryUseCase } from "./list-topic-source-daily-history.use-case";

const tenant = tenantId("tenant-topic-source-history");
const workspace = workspaceId("workspace-topic-source-history");
const now = new Date("2026-06-26T10:00:00.000Z");

class FakeTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async save(topic: Topic): Promise<void> {
    const snapshot = topic.toSnapshot();
    this.topics.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      topic,
    );
  }

  async findByName(): Promise<Topic | null> {
    return null;
  }

  async findById(
    params: Parameters<TopicRepositoryPort["findById"]>[0],
  ): Promise<Topic | null> {
    return (
      this.topics.get(
        `${params.tenantId}:${params.workspaceId}:${params.topicId}`,
      ) ?? null
    );
  }

  async list(query: ListTopicsQuery): Promise<ListTopicsResult> {
    return {
      topics: [...this.topics.values()]
        .filter((topic) => {
          const snapshot = topic.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId
          );
        })
        .slice(0, query.limit),
    };
  }
}

class FakeSourceBindings implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindings.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      binding,
    );
  }

  async findByTopicAndProvider(): Promise<SourceBinding | null> {
    return null;
  }

  async findById(
    params: Parameters<SourceBindingRepositoryPort["findById"]>[0],
  ): Promise<SourceBinding | null> {
    return (
      this.bindings.get(
        `${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`,
      ) ?? null
    );
  }

  async listByTopic(
    query: ListSourceBindingsQuery,
  ): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindings.values()]
        .filter((binding) => {
          const snapshot = binding.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId &&
            snapshot.topicId === query.topicId
          );
        })
        .slice(0, query.limit),
    };
  }
}

class FakeScanHistory implements ScanJobHistoryReadPort {
  private readonly jobs = new Map<string, ScanJob>();

  async save(job: ScanJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      job,
    );
  }

  async listBySourceBinding(
    query: ListScanJobsBySourceBindingQuery,
  ): Promise<ListScanJobsBySourceBindingResult> {
    return {
      scanJobs: this.matchSourceBinding(query).slice(0, query.limit),
    };
  }

  async listBySourceBindingWindow(
    query: ListScanJobsBySourceBindingWindowQuery,
  ): Promise<ListScanJobsBySourceBindingWindowResult> {
    return {
      scanJobs: this.matchSourceBinding(query)
        .filter((job) => {
          const snapshot = job.toSnapshot();

          return (
            snapshot.requestedAt.getTime() >= query.windowStartedAt.getTime() &&
            snapshot.requestedAt.getTime() < query.windowEndedAt.getTime()
          );
        })
        .slice(0, query.limit),
      truncated: false,
    };
  }

  private matchSourceBinding(query: {
    readonly tenantId: typeof tenant;
    readonly workspaceId: typeof workspace;
    readonly sourceBindingId: string;
  }): ScanJob[] {
    return [...this.jobs.values()].filter((job) => {
      const snapshot = job.toSnapshot();

      return (
        snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        snapshot.sourceBindingId === query.sourceBindingId
      );
    });
  }
}

class FakeScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  private readonly attempts = new Map<string, ScanExecutionAttemptSnapshot>();

  save(attempt: ScanExecutionAttemptSnapshot): void {
    this.attempts.set(
      `${attempt.tenantId}:${attempt.workspaceId}:${attempt.scanJobId}`,
      attempt,
    );
  }

  async findLatestByScanJob(
    query: FindScanExecutionAttemptQuery,
  ): Promise<ScanExecutionAttemptSnapshot | null> {
    return (
      this.attempts.get(
        `${query.tenantId}:${query.workspaceId}:${query.scanJobId}`,
      ) ?? null
    );
  }
}

describe("ListTopicSourceDailyHistoryUseCase", () => {
  it("aggregates scan history by day and provider for a topic", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page");
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.saveCompletedScan({
      id: "scan-reddit-today",
      binding: reddit,
      requestedAt: "2026-06-26T08:00:00.000Z",
      status: "succeeded",
      fetched: 20,
      inserted: 12,
      skippedDuplicates: 8,
      projected: 12,
    });
    await fixture.saveCompletedScan({
      id: "scan-github-yesterday",
      binding: github,
      requestedAt: "2026-06-25T09:00:00.000Z",
      status: "failed",
      failureReason: "provider_rate_limited: github trending page returned 429",
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: "topic-source-history",
      days: 2,
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        topicId: "topic-source-history",
        windowStartedAt: "2026-06-25T00:00:00.000Z",
        windowEndedAt: "2026-06-27T00:00:00.000Z",
        summary: expect.objectContaining({
          sourceBindingCount: 2,
          totalScans: 2,
          succeededScans: 1,
          failedScans: 1,
          rateLimitedScans: 1,
          fetched: 20,
          inserted: 12,
          skippedDuplicates: 8,
          projected: 12,
          daysWithScans: 2,
          daysWithFailures: 1,
          daysWithRateLimits: 1,
          lastScanRequestedAt: "2026-06-26T08:00:00.000Z",
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "github-trending-page",
              sourceBindingCount: 1,
              failedScans: 1,
              rateLimitedScans: 1,
            }),
            expect.objectContaining({
              providerKey: "reddit",
              sourceBindingCount: 1,
              succeededScans: 1,
              fetched: 20,
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-25",
            totalScans: 1,
            failedScans: 1,
            rateLimitedScans: 1,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "github-trending-page",
                failedScans: 1,
              }),
              expect.objectContaining({ providerKey: "reddit", totalScans: 0 }),
            ],
          }),
          expect.objectContaining({
            date: "2026-06-26",
            totalScans: 1,
            succeededScans: 1,
            fetched: 20,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "github-trending-page",
                totalScans: 0,
              }),
              expect.objectContaining({
                providerKey: "reddit",
                succeededScans: 1,
              }),
            ],
          }),
        ],
        truncated: false,
        maxScanJobs: 400,
      }),
    });
  });

  it("filters topic scan history by provider key", async () => {
    const fixture = await makeFixture();
    const reddit = makeBinding("binding-reddit", "reddit");
    const github = makeBinding("binding-github", "github-trending-page");
    await fixture.bindings.save(reddit);
    await fixture.bindings.save(github);
    await fixture.saveCompletedScan({
      id: "scan-reddit-today",
      binding: reddit,
      requestedAt: "2026-06-26T08:00:00.000Z",
      status: "succeeded",
      fetched: 20,
      inserted: 12,
      skippedDuplicates: 8,
      projected: 12,
    });
    await fixture.saveCompletedScan({
      id: "scan-github-yesterday",
      binding: github,
      requestedAt: "2026-06-25T09:00:00.000Z",
      status: "failed",
      failureReason: "provider_rate_limited: github trending page returned 429",
      fetched: 0,
      inserted: 0,
      skippedDuplicates: 0,
      projected: 0,
    });

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: "topic-source-history",
      days: 2,
      providerKeys: ["reddit"],
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        summary: expect.objectContaining({
          sourceBindingCount: 1,
          totalScans: 1,
          succeededScans: 1,
          failedScans: 0,
          rateLimitedScans: 0,
          daysWithScans: 1,
          daysWithFailures: 0,
          daysWithRateLimits: 0,
          providerBreakdown: [
            expect.objectContaining({
              providerKey: "reddit",
              sourceBindingCount: 1,
              succeededScans: 1,
            }),
          ],
        }),
        days: [
          expect.objectContaining({
            date: "2026-06-25",
            totalScans: 0,
            providerBreakdown: [
              expect.objectContaining({ providerKey: "reddit", totalScans: 0 }),
            ],
          }),
          expect.objectContaining({
            date: "2026-06-26",
            totalScans: 1,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: "reddit",
                succeededScans: 1,
              }),
            ],
          }),
        ],
        truncated: false,
        maxScanJobs: 200,
      }),
    });
  });

  it("returns scoped topic errors before reading scan history", async () => {
    const fixture = await makeFixture();

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: "missing-topic",
      days: 7,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "resource.not_found" }),
    });
  });

  it("rejects invalid history windows", async () => {
    const fixture = await makeFixture();

    const result = await fixture.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: "topic-source-history",
      days: 91,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "validation.failed" }),
    });
  });
});

const makeFixture = async () => {
  const topics = new FakeTopicRepository();
  const bindings = new FakeSourceBindings();
  const scanJobs = new FakeScanHistory();
  const attempts = new FakeScanExecutionAttempts();
  const useCase = new ListTopicSourceDailyHistoryUseCase(
    topics,
    bindings,
    scanJobs,
    attempts,
    new FixedClock(now),
  );
  await topics.save(
    Topic.create({
      id: "topic-source-history",
      tenantId: tenant,
      workspaceId: workspace,
      name: "Source history",
      query: "source history",
      createdAt: new Date("2026-06-24T00:00:00.000Z"),
    }),
  );

  return {
    bindings,
    useCase,
    saveCompletedScan: async (params: {
      readonly id: string;
      readonly binding: SourceBinding;
      readonly requestedAt: string;
      readonly status: "succeeded" | "failed";
      readonly failureReason?: string;
      readonly fetched: number;
      readonly inserted: number;
      readonly skippedDuplicates: number;
      readonly projected: number;
    }) => {
      const binding = params.binding.toSnapshot();
      const requestedAt = new Date(params.requestedAt);
      const enqueuedAt = new Date(requestedAt.getTime() + 1000);
      const completedAt = new Date(enqueuedAt.getTime() + 1000);
      const requested = ScanJob.request({
        id: params.id,
        tenantId: tenant,
        workspaceId: workspace,
        sourceBindingId: binding.id,
        scanPolicyId: `scan-policy-${binding.id}`,
        idempotencyKey: `scan:${params.id}`,
        requestedAt,
      });
      const enqueued = requested.markEnqueued({ enqueuedAt });
      const completed =
        params.status === "succeeded"
          ? enqueued.markSucceeded({ completedAt })
          : enqueued.markFailed({
              completedAt,
              failureReason:
                params.failureReason ?? "provider_unavailable: source failed",
            });
      await scanJobs.save(completed);
      await attempts.save({
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: params.id,
        sourceBindingId: binding.id,
        status: params.status,
        startedAt: enqueuedAt,
        finishedAt: completedAt,
        fetched: params.fetched,
        inserted: params.inserted,
        skippedDuplicates: params.skippedDuplicates,
        projected: params.projected,
        failureReason: params.failureReason,
      });
    },
  };
};

const makeBinding = (id: string, providerKey: string): SourceBinding =>
  SourceBinding.create({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    topicId: "topic-source-history",
    providerKey,
    capabilityProfileVersion: 1,
    config: { query: providerKey },
    createdAt: new Date("2026-06-24T00:00:00.000Z"),
  });
