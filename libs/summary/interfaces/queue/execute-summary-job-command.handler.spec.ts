import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ExecuteSummaryJobUseCase } from '../../features/execute-summary-job/execute-summary-job.use-case';
import type { ExecuteSummaryJobResult } from '../../features/execute-summary-job/execute-summary-job.result';
import { ExecuteSummaryJobCommandHandler } from './execute-summary-job-command.handler';

class FakeExecuteSummaryJobUseCase {
  readonly commands: unknown[] = [];

  async execute(command: unknown): ReturnType<ExecuteSummaryJobUseCase['execute']> {
    this.commands.push(command);

    return {
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'completed',
        summaryId: 'summary-1',
      },
    };
  }
}

describe('ExecuteSummaryJobCommandHandler', () => {
  it('parses scoped queue command, runs through worker runtime and records metrics', async () => {
    const executeSummaryJob = new FakeExecuteSummaryJobUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
    runtime.onModuleInit();

    const result = await new ExecuteSummaryJobCommandHandler(
      executeSummaryJob as unknown as ExecuteSummaryJobUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        summaryJobId: 'summary-job-1',
        maxEvidenceItems: 5,
      },
    });

    expect(result).toEqual({
      summaryJobId: 'summary-job-1',
      status: 'completed',
      summaryId: 'summary-1',
    } satisfies ExecuteSummaryJobResult);
    expect(executeSummaryJob.commands).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        summaryJobId: 'summary-job-1',
        maxEvidenceItems: 5,
      },
    ]);
    expect(metrics.counterValue('summary_jobs_total', {
      job_type: 'summary',
      status: 'started',
      worker: 'intelligence-worker',
    })).toBe(1);
    expect(metrics.counterValue('summary_jobs_total', {
      job_type: 'summary',
      status: 'succeeded',
      worker: 'intelligence-worker',
    })).toBe(1);
  });

  it('returns controlled tenant scope errors before executing the use case', async () => {
    const executeSummaryJob = new FakeExecuteSummaryJobUseCase();
    const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
    runtime.onModuleInit();

    await expect(new ExecuteSummaryJobCommandHandler(
      executeSummaryJob as unknown as ExecuteSummaryJobUseCase,
      new InMemoryMetricsRecorder(),
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        workspaceId: 'workspace-1',
        summaryJobId: 'summary-job-1',
      },
    })).rejects.toEqual(expect.objectContaining({
      code: 'tenant.scope_missing',
    } satisfies Partial<DomainError>));
    expect(executeSummaryJob.commands).toEqual([]);
  });
});
