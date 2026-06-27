import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import type { DomainError } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ExecuteReaderSummaryJobUseCase } from "../../features/execute-reader-summary-job/execute-reader-summary-job.use-case";
import { EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE } from "../../ports";
import {
  ExecuteReaderSummaryJobCommandHandler,
  type ExecuteReaderSummaryJobQueueResult,
} from "./execute-reader-summary-job-command.handler";

class FakeExecuteReaderSummaryJobUseCase {
  readonly commands: unknown[] = [];

  async execute(
    command: unknown,
  ): ReturnType<ExecuteReaderSummaryJobUseCase["execute"]> {
    this.commands.push(command);

    return {
      ok: true,
      value: {
        readerSummaryJobId: "readerSummary-job-1",
        status: "completed",
        readerSummaryId: "readerSummary-1",
      },
    };
  }
}

describe("ExecuteReaderSummaryJobCommandHandler", () => {
  it("parses scoped queue command, runs through worker runtime and records metrics", async () => {
    const executeReaderSummaryJob = new FakeExecuteReaderSummaryJobUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
    runtime.onModuleInit();

    const result = await new ExecuteReaderSummaryJobCommandHandler(
      executeReaderSummaryJob as unknown as ExecuteReaderSummaryJobUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: "command-1",
      commandType: EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE,
      schemaVersion: 1,
      correlationId: "correlation-1",
      payload: {
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        readerSummaryJobId: "reader-summary-job-1",
        maxEvidenceItems: 5,
      },
    });

    expect(result).toEqual({
      readerSummaryJobId: "readerSummary-job-1",
      status: "completed",
      readerSummaryId: "readerSummary-1",
    } satisfies ExecuteReaderSummaryJobQueueResult);
    expect(executeReaderSummaryJob.commands).toEqual([
      {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        readerSummaryJobId: "reader-summary-job-1",
        maxEvidenceItems: 5,
      },
    ]);
    expect(
      metrics.counterValue("summary_jobs_total", {
        job_type: "readerSummary",
        status: "started",
        worker: "intelligence-worker",
      }),
    ).toBe(1);
    expect(
      metrics.counterValue("summary_jobs_total", {
        job_type: "readerSummary",
        status: "succeeded",
        worker: "intelligence-worker",
      }),
    ).toBe(1);
  });

  it("returns controlled tenant scope errors before executing the use case", async () => {
    const executeReaderSummaryJob = new FakeExecuteReaderSummaryJobUseCase();
    const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
    runtime.onModuleInit();

    await expect(
      new ExecuteReaderSummaryJobCommandHandler(
        executeReaderSummaryJob as unknown as ExecuteReaderSummaryJobUseCase,
        new InMemoryMetricsRecorder(),
        runtime,
      ).handle({
        commandId: "command-1",
        commandType: "reader_summary.job.execute",
        schemaVersion: 1,
        correlationId: "correlation-1",
        payload: {
          workspaceId: "workspace-1",
          readerSummaryJobId: "readerSummary-job-1",
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "tenant.scope_missing",
      } satisfies Partial<DomainError>),
    );
    expect(executeReaderSummaryJob.commands).toEqual([]);
  });

});
