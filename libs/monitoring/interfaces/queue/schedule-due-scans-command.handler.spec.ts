import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import type { DomainError} from '@social-monitor/shared-kernel';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ScheduleDueScansUseCase } from '../../features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from './schedule-due-scans-command.handler';

class FakeScheduleDueScansUseCase {
  readonly commands: unknown[] = [];

  async execute(command: unknown): ReturnType<ScheduleDueScansUseCase['execute']> {
    this.commands.push(command);

    return {
      ok: true,
      value: {
        scannedAt: new Date('2026-06-06T00:00:00.000Z'),
        evaluated: 1,
        enqueued: 1,
        skipped: 0,
        skippedByReason: {
          active_scan: 0,
          duplicate_window: 0,
          fresh_success: 0,
          provider_failure_backoff: 0,
          queue_backpressure: 0,
          rate_limit_backoff: 0,
          source_unavailable: 0,
        },
      },
    };
  }
}

describe('ScheduleDueScansCommandHandler', () => {
  it('runs a scoped due-scan sweep through worker runtime and records metrics', async () => {
    const scheduleDueScans = new FakeScheduleDueScansUseCase();
    const metrics = new InMemoryMetricsRecorder();
    const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
    runtime.onModuleInit();

    const result = await new ScheduleDueScansCommandHandler(
      scheduleDueScans as unknown as ScheduleDueScansUseCase,
      metrics,
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'monitoring.scans.schedule_due',
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
      enqueued: 1,
      skipped: 0,
    });
    expect(scheduleDueScans.commands).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        limit: 10,
        correlationId: 'correlation-1',
      },
    ]);
    expect(metrics.counterValue('monitoring_scan_scheduler_runs_total', {
      status: 'started',
      worker: 'ingestion-worker',
    })).toBe(1);
    expect(metrics.latestGaugeValue('monitoring_scan_scheduler_last_enqueued', {
      worker: 'ingestion-worker',
    })).toBe(1);
    expect(metrics.latestGaugeValue('monitoring_scan_scheduler_last_skipped_by_reason', {
      reason: 'fresh_success',
      worker: 'ingestion-worker',
    })).toBe(0);
  });

  it('rejects partially scoped sweeps before executing the use case', async () => {
    const scheduleDueScans = new FakeScheduleDueScansUseCase();
    const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
    runtime.onModuleInit();

    await expect(new ScheduleDueScansCommandHandler(
      scheduleDueScans as unknown as ScheduleDueScansUseCase,
      new InMemoryMetricsRecorder(),
      runtime,
    ).handle({
      commandId: 'command-1',
      commandType: 'monitoring.scans.schedule_due',
      schemaVersion: 1,
      correlationId: 'correlation-1',
      payload: {
        tenantId: 'tenant-1',
      },
    })).rejects.toEqual(expect.objectContaining({
      code: 'tenant.scope_missing',
    } satisfies Partial<DomainError>));
    expect(scheduleDueScans.commands).toEqual([]);
  });
});
