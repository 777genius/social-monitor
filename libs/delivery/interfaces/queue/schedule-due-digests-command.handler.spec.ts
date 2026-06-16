import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ScheduleDueDigestsUseCase } from '../../features/schedule-due-digests/schedule-due-digests.use-case';
import { ScheduleDueDigestsCommandHandler } from './schedule-due-digests-command.handler';

class FakeScheduleDueDigestsUseCase {
  readonly commands: unknown[] = [];

  async execute(command: unknown): ReturnType<ScheduleDueDigestsUseCase['execute']> {
    this.commands.push(command);

    return {
      ok: true,
      value: {
        scannedAt: new Date('2026-06-06T00:00:00.000Z'),
        evaluated: 1,
        assembled: 1,
        skipped: 0,
        digests: [],
      },
    };
  }
}

describe('ScheduleDueDigestsCommandHandler', () => {
  it('runs a scoped due-digest sweep through worker runtime and records metrics', async () => {
    const scheduleDueDigests = new FakeScheduleDueDigestsUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
    runtime.onModuleInit();

    const result = await new ScheduleDueDigestsCommandHandler(
      scheduleDueDigests as unknown as ScheduleDueDigestsUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'delivery.digests.schedule_due',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        limit: 10,
      },
    });

    expect(result).toMatchObject({
      evaluated: 1,
      assembled: 1,
      skipped: 0,
    });
    expect(scheduleDueDigests.commands).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        limit: 10,
      },
    ]);
    expect(metrics.counterValue('delivery_digest_scheduler_runs_total', {
      status: 'started',
      worker: 'delivery-service',
    })).toBe(1);
    expect(metrics.latestGaugeValue('delivery_digest_scheduler_last_assembled', {
      worker: 'delivery-service',
    })).toBe(1);
  });

  it('rejects partially scoped sweeps before executing the use case', async () => {
    const scheduleDueDigests = new FakeScheduleDueDigestsUseCase();
    const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
    runtime.onModuleInit();

    await expect(new ScheduleDueDigestsCommandHandler(
      scheduleDueDigests as unknown as ScheduleDueDigestsUseCase,
      new InMemoryMetricsRecorder(),
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'delivery.digests.schedule_due',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        tenantId: 'tenant-1',
      },
    })).rejects.toEqual(expect.objectContaining({
      code: 'tenant.scope_missing',
    } satisfies Partial<DomainError>));
    expect(scheduleDueDigests.commands).toEqual([]);
  });
});
