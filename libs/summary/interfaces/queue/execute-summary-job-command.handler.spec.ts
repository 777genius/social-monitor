import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { currentDatabaseAccess } from "@social-monitor/platform-persistence";
import { WorkerRuntime } from "@social-monitor/platform-worker";
import type { DomainError } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ExecuteSummaryJobUseCase } from "../../features/execute-summary-job/execute-summary-job.use-case";
import type { ExecuteSummaryJobResult } from "../../features/execute-summary-job/execute-summary-job.result";
import { ExecuteSummaryJobCommandHandler } from "./execute-summary-job-command.handler";

class FakeExecuteSummaryJobUseCase {
  readonly commands: unknown[] = [];
  readonly databaseAccesses: unknown[] = [];

  async execute(
    command: unknown,
  ): ReturnType<ExecuteSummaryJobUseCase["execute"]> {
    this.commands.push(command);
    this.databaseAccesses.push(currentDatabaseAccess());

    return {
      ok: true,
      value: {
        summaryJobId: "summary-job-1",
        status: "completed",
        summaryId: "summary-1",
      },
    };
  }
}

const TEST_TENANT_ID = "00000000-0000-7000-8000-000000000010";
const TEST_WORKSPACE_ID = "00000000-0000-7000-8000-000000000020";

describe("ExecuteSummaryJobCommandHandler", () => {
  it("parses scoped queue command, runs through worker runtime and records metrics", async () => {
    const executeSummaryJob = new FakeExecuteSummaryJobUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
    runtime.onModuleInit();

    const result = await new ExecuteSummaryJobCommandHandler(
      executeSummaryJob as unknown as ExecuteSummaryJobUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: "command-1",
      commandType: "summary.job.execute",
      schemaVersion: 1,
      correlationId: "correlation-1",
      payload: {
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
        summaryJobId: "summary-job-1",
        maxEvidenceItems: 5,
      },
    });

    expect(result).toEqual({
      summaryJobId: "summary-job-1",
      status: "completed",
      summaryId: "summary-1",
    } satisfies ExecuteSummaryJobResult);
    expect(executeSummaryJob.commands).toEqual([
      {
        tenantId: tenantId(TEST_TENANT_ID),
        workspaceId: workspaceId(TEST_WORKSPACE_ID),
        summaryJobId: "summary-job-1",
        maxEvidenceItems: 5,
      },
    ]);
    expect(executeSummaryJob.databaseAccesses).toEqual([
      {
        kind: "tenant",
        tenantId: TEST_TENANT_ID,
        workspaceId: TEST_WORKSPACE_ID,
      },
    ]);
    expect(currentDatabaseAccess()).toBeUndefined();
    expect(
      metrics.counterValue("summary_jobs_total", {
        job_type: "summary",
        status: "started",
        worker: "intelligence-worker",
      }),
    ).toBe(1);
    expect(
      metrics.counterValue("summary_jobs_total", {
        job_type: "summary",
        status: "succeeded",
        worker: "intelligence-worker",
      }),
    ).toBe(1);
  });

  it("returns controlled tenant scope errors before executing the use case", async () => {
    const executeSummaryJob = new FakeExecuteSummaryJobUseCase();
    const runtime = new WorkerRuntime({ serviceName: "intelligence-worker" });
    runtime.onModuleInit();

    await expect(
      new ExecuteSummaryJobCommandHandler(
        executeSummaryJob as unknown as ExecuteSummaryJobUseCase,
        new InMemoryMetricsRecorder(),
        runtime,
      ).handle({
        commandId: "command-1",
        commandType: "summary.job.execute",
        schemaVersion: 1,
        correlationId: "correlation-1",
        payload: {
          workspaceId: "workspace-1",
          summaryJobId: "summary-job-1",
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "tenant.scope_missing",
      } satisfies Partial<DomainError>),
    );
    expect(executeSummaryJob.commands).toEqual([]);
  });
});
