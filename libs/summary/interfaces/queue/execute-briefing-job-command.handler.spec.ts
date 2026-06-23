import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import type { DomainError } from '@social-monitor/shared-kernel';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ExecuteBriefingJobUseCase } from '../../features/execute-briefing-job/execute-briefing-job.use-case';
import type { ExecuteBriefingJobResult } from '../../features/execute-briefing-job/execute-briefing-job.result';
import { ExecuteBriefingJobCommandHandler } from './execute-briefing-job-command.handler';

class FakeExecuteBriefingJobUseCase {
  readonly commands: unknown[] = [];

  async execute(command: unknown): ReturnType<ExecuteBriefingJobUseCase['execute']> {
    this.commands.push(command);

    return {
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'completed',
        briefingId: 'briefing-1',
      },
    };
  }
}

describe('ExecuteBriefingJobCommandHandler', () => {
  it('parses scoped queue command, runs through worker runtime and records metrics', async () => {
    const executeBriefingJob = new FakeExecuteBriefingJobUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
    runtime.onModuleInit();

    const result = await new ExecuteBriefingJobCommandHandler(
      executeBriefingJob as unknown as ExecuteBriefingJobUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'briefing.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        briefingJobId: 'briefing-job-1',
        maxEvidenceItems: 5,
      },
    });

    expect(result).toEqual({
      briefingJobId: 'briefing-job-1',
      status: 'completed',
      briefingId: 'briefing-1',
    } satisfies ExecuteBriefingJobResult);
    expect(executeBriefingJob.commands).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        briefingJobId: 'briefing-job-1',
        maxEvidenceItems: 5,
      },
    ]);
    expect(metrics.counterValue('summary_jobs_total', {
      job_type: 'briefing',
      status: 'started',
      worker: 'intelligence-worker',
    })).toBe(1);
    expect(metrics.counterValue('summary_jobs_total', {
      job_type: 'briefing',
      status: 'succeeded',
      worker: 'intelligence-worker',
    })).toBe(1);
  });

  it('returns controlled tenant scope errors before executing the use case', async () => {
    const executeBriefingJob = new FakeExecuteBriefingJobUseCase();
    const runtime = new WorkerRuntime({ serviceName: 'intelligence-worker' });
    runtime.onModuleInit();

    await expect(new ExecuteBriefingJobCommandHandler(
      executeBriefingJob as unknown as ExecuteBriefingJobUseCase,
      new InMemoryMetricsRecorder(),
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'briefing.job.execute',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        workspaceId: 'workspace-1',
        briefingJobId: 'briefing-job-1',
      },
    })).rejects.toEqual(expect.objectContaining({
      code: 'tenant.scope_missing',
    } satisfies Partial<DomainError>));
    expect(executeBriefingJob.commands).toEqual([]);
  });
});
