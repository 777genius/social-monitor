import { NestFactory } from '@nestjs/core';
import { CreateDigestScheduleUseCase } from '@social-monitor/delivery/features/create-digest-schedule/create-digest-schedule.use-case';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import 'reflect-metadata';

import { DeliveryServiceModule } from '../apps/delivery-service/src/delivery-service.module';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DeliveryServiceModule, { logger: false });

  try {
    const tenant = tenantId('tenant-delivery-worker-smoke');
    const workspace = workspaceId('workspace-delivery-worker-smoke');
    const created = await app.get(CreateDigestScheduleUseCase).execute({
      tenantId: tenant,
      workspaceId: workspace,
      recipientKey: 'user-delivery-worker-smoke',
      channel: 'in_app',
      topicIds: ['topic-delivery-worker-smoke'],
      intervalSeconds: 3600,
      includeNoSignal: true,
      nextRunAt: new Date('2026-06-06T00:00:00.000Z'),
    });

    if (!created.ok) {
      throw created.error;
    }

    const result = await app.get(ScheduleDueDigestsCommandHandler).handle({
      commandId: 'command-delivery-worker-smoke',
      commandType: 'delivery.digests.schedule_due',
      schemaVersion: 1,
      correlationId: 'correlation-delivery-worker-smoke',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        limit: 5,
      },
    });

    assert(result.evaluated === 1, 'delivery worker command must evaluate due schedule');
    assert(result.assembled === 1, 'delivery worker command must assemble due digest');
    assert(result.skipped === 0, 'delivery worker command must not skip valid due schedule');
    assert(
      result.digests[0]?.digestScheduleId === created.value.schedule.id,
      'delivery worker command must return assembled schedule id',
    );

    const metrics = app.get(InMemoryMetricsRecorder);
    assert(
      metrics.counterValue('delivery_digest_scheduler_runs_total', {
        status: 'started',
        worker: 'delivery-service',
      }) === 1,
      'delivery worker command must record started metric',
    );
    assert(
      metrics.counterValue('delivery_digest_scheduler_runs_total', {
        status: 'succeeded',
        worker: 'delivery-service',
      }) === 1,
      'delivery worker command must record succeeded metric',
    );
    assert(
      metrics.latestGaugeValue('delivery_digest_scheduler_last_assembled', {
        worker: 'delivery-service',
      }) === 1,
      'delivery worker command must record assembled gauge',
    );

    await app.get(ScheduleDueDigestsCommandHandler).handle({
      commandId: 'command-delivery-worker-partial-scope',
      commandType: 'delivery.digests.schedule_due',
      schemaVersion: 1,
      correlationId: 'correlation-delivery-worker-smoke',
      payload: {
        tenantId: tenant,
      },
    }).then(
      () => {
        throw new Error('delivery worker command must reject partially scoped sweeps');
      },
      (error: unknown) => {
        assert(
          typeof error === 'object' && error !== null && 'code' in error && error.code === 'tenant.scope_missing',
          'delivery worker command must return controlled tenant.scope_missing for partial scope',
        );
      },
    );

    console.log('Delivery worker command smoke OK');
  } finally {
    await app.close();
  }
}

void main();
