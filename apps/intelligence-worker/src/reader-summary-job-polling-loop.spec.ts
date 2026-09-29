import type { StructuredLogger } from "@social-monitor/platform-logging";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import { ExecuteReaderSummaryJobCommandHandler } from
  "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import type { ReaderSummaryJobPollingRepositoryPort } from "@social-monitor/summary/ports";
import { FixedClock } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryV3Preflight } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-v3-preflight";
import { ExecuteReaderSummaryJobUseCase } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { NOOP_READER_SUMMARY_PROMOTION_METRICS,
  readerSummaryPromotionControl } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-control";

import { ReaderSummaryJobPollingLoop } from "./reader-summary-job-polling-loop";

describe("ReaderSummaryJobPollingLoop completion counters", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("dispatches due recovery candidates with the two-hour stale boundary", async () => {
    const scenario = buildScenario("failed");

    await scenario.loop.onModuleInit();

    expect(scenario.repository.findDueForPolling).toHaveBeenCalledWith({
      limit: 1,
      now: new Date("2026-09-22T00:00:00.000Z"),
      staleRunningStartedBefore: new Date("2026-09-21T22:00:00.000Z"),
    });
    expect(scenario.handler.handle).toHaveBeenCalledTimes(1);
    await scenario.loop.onModuleDestroy();
  });

  it.each(["daily", "weekly"] as const)(
    "redelivers one stale %s claim through the real repository and execution boundary",
    async (cadence) => {
      const claimedAt = new Date("2026-09-21T00:00:00Z");
      const now = new Date("2026-09-23T00:00:00Z");
      const tenant = tenantId("00000000-0000-4000-8000-000000000201");
      const workspace = workspaceId("00000000-0000-4000-8000-000000000202");
      const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
        interestId: "00000000-0000-4000-8000-000000000203",
        interestSha256: "1".repeat(64), rubricVersion: "reader-value.v1",
        rubricSha256: "2".repeat(64), inputBuilderVersion: "input.v1",
        modelConfigVersion: "jev.v1" };
      const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
        cutoffAt: "2026-09-21T00:00:00.000000Z",
        interestSha256: config.interestSha256, rubricSha256: config.rubricSha256,
        inputBuilderVersion: config.inputBuilderVersion,
        modelConfigVersion: config.modelConfigVersion, candidates: [] };
      const startedAt = cadence === "daily"
        ? new Date("2026-09-19T00:00:00Z") : new Date("2026-09-13T00:00:00Z");
      const endedAt = new Date("2026-09-20T00:00:00Z");
      const period = { cadence, startedAt, endedAt, timezone: "UTC",
        periodKey: `${cadence}:${startedAt.toISOString()}:${endedAt.toISOString()}:UTC` };
      const old = ReaderSummaryJob.rehydrate({ ...ReaderSummaryJob.request({
        id: "00000000-0000-4000-8000-000000000204", tenantId: tenant,
        workspaceId: workspace, scope: { type: "interest", interestId: config.interestId },
        period, idempotencyKey: `poller-${cadence}`, requestedAt: claimedAt,
        selectionStrategy: "jev_primary_v3" }).freezePreparation({
        strategy: "jev_primary_v3", config, cutoffAt: manifest.cutoffAt,
        deadlineAt: "2026-09-21T00:15:00.000000Z",
        nextCheckAt: new Date("2026-09-21T00:00:10Z"),
      }).freezePreparationManifest({ manifest, manifestSha256: "3".repeat(64) })
        .startPrepared({ startedAt: claimedAt, readyAt: claimedAt }).toSnapshot(),
      failureReason: "v3_pre_provider_claim" });
      const repository = new InMemoryReaderSummaryJobRepository();
      await repository.save(old);
      const source = { configuration: jest.fn(), prepare: jest.fn(),
        coverage: jest.fn() };
      const preflight = new InMemoryReaderSummaryV3Preflight(repository, source);
      const promotionBuild = jest.fn(async () => ({
        kind: "presentation_unavailable" as const }));
      const useCase = new ExecuteReaderSummaryJobUseCase(repository,
        {} as never, {} as never, {} as never, {} as never, {} as never,
        { generate: () => "00000000-0000-4000-8000-000000000205" },
        new FixedClock(now),
        readerSummaryPromotionControl(NOOP_READER_SUMMARY_PROMOTION_METRICS),
        undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, preflight, { build: promotionBuild });
      const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
      runtime.onModuleInit();
      const handler = new ExecuteReaderSummaryJobCommandHandler(useCase,
        new InMemoryMetricsRecorder(), runtime);
      const handled = jest.spyOn(handler, "handle");
      const loop = new ReaderSummaryJobPollingLoop(
        handler,
        repository, { enabled: true, intervalMs: 1_000, limit: 1,
          runOnStart: true, tenantId: tenant, workspaceId: workspace },
        undefined, new FixedClock(now));

      await loop.onModuleInit();
      await jest.advanceTimersByTimeAsync(1_000);
      await loop.onModuleDestroy();
      await runtime.onApplicationShutdown("poller-test-complete");

      expect(handled).toHaveBeenCalledTimes(1);
      expect(promotionBuild).toHaveBeenCalledTimes(1);
      expect((await repository.findById({ tenantId: tenant, workspaceId: workspace,
        readerSummaryJobId: old.toSnapshot().id }))?.toSnapshot()).toMatchObject({
        status: "failed", terminalFailureCode: "presentation_unavailable",
        preparationManifestSha256: old.toSnapshot().preparationManifestSha256,
      });
      expect(source.prepare).not.toHaveBeenCalled();
    });

  it.each([
    ["requested", { completed: 0, failed: 0, deferred: 1, inProgress: 0 }],
    ["running", { completed: 0, failed: 0, deferred: 0, inProgress: 1 }],
    ["completed", { completed: 1, failed: 0, deferred: 0, inProgress: 0 }],
    ["failed", { completed: 0, failed: 1, deferred: 0, inProgress: 0 }],
  ] as const)("counts a %s handler result by outcome", async (status, counts) => {
    const scenario = buildScenario(status);

    await scenario.loop.onModuleInit();

    expect(scenario.logger.info).toHaveBeenCalledWith(
      "readerSummary job polling loop tick completed",
      expect.objectContaining({ evaluated: 1, ...counts }),
    );
    await scenario.loop.onModuleDestroy();
  });

  it("does not count repeated deferred polling as completion", async () => {
    const scenario = buildScenario("requested");

    await scenario.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(scenario.handler.handle).toHaveBeenCalledTimes(2);
    expect(scenario.logger.info).toHaveBeenCalledTimes(3);
    expect(scenario.logger.info).toHaveBeenNthCalledWith(
      3,
      "readerSummary job polling loop tick completed",
      expect.objectContaining({
        evaluated: 1,
        completed: 0,
        failed: 0,
        deferred: 1,
        inProgress: 0,
      }),
    );
    await scenario.loop.onModuleDestroy();
  });

  it("counts thrown handler errors as failures", async () => {
    const scenario = buildScenario("completed");
    scenario.handler.handle.mockRejectedValueOnce(new Error("execution failed"));

    await scenario.loop.onModuleInit();

    expect(scenario.logger.error).toHaveBeenCalledWith(
      "readerSummary job polling loop item failed",
      expect.objectContaining({ error: "execution failed" }),
    );
    expect(scenario.logger.info).toHaveBeenCalledWith(
      "readerSummary job polling loop tick completed",
      expect.objectContaining({ completed: 0, failed: 1 }),
    );
    await scenario.loop.onModuleDestroy();
  });
});

const buildScenario = (status: "requested" | "running" | "completed" | "failed") => {
  const handler = {
    handle: jest.fn().mockResolvedValue({
      readerSummaryJobId: "reader-summary-job-1",
      status,
      ...(status === "completed" ? { readerSummaryId: "reader-summary-1" } : {}),
    }),
  };
  const repository = {
    findDueForPolling: jest.fn().mockResolvedValue([{
      toSnapshot: () => ({
        id: "reader-summary-job-1",
        tenantId: "00000000-0000-7000-8000-000000000010",
        workspaceId: "00000000-0000-7000-8000-000000000020",
      }),
    }]),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const loop = new ReaderSummaryJobPollingLoop(
    handler as unknown as ExecuteReaderSummaryJobCommandHandler,
    repository as unknown as ReaderSummaryJobPollingRepositoryPort,
    { enabled: true, intervalMs: 1_000, limit: 1, runOnStart: true },
    undefined,
    new FixedClock(new Date("2026-09-22T00:00:00.000Z")),
  );
  Object.assign(loop, { logger: logger as unknown as StructuredLogger });
  return { handler, logger, loop, repository };
};
