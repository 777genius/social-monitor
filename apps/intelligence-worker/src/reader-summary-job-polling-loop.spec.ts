import type { StructuredLogger } from "@social-monitor/platform-logging";
import type { ExecuteReaderSummaryJobCommandHandler } from
  "@social-monitor/summary/interfaces/queue/execute-reader-summary-job-command.handler";
import type { ReaderSummaryJobRepositoryPort } from "@social-monitor/summary/ports";
import { FixedClock } from "@social-monitor/shared-kernel";

import { ReaderSummaryJobPollingLoop } from "./reader-summary-job-polling-loop";

describe("ReaderSummaryJobPollingLoop completion counters", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

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
    findRequested: jest.fn().mockResolvedValue([{
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
    repository as unknown as ReaderSummaryJobRepositoryPort,
    { enabled: true, intervalMs: 1_000, limit: 1, runOnStart: true },
    undefined,
    new FixedClock(new Date("2026-09-22T00:00:00.000Z")),
  );
  Object.assign(loop, { logger: logger as unknown as StructuredLogger });
  return { handler, logger, loop };
};
