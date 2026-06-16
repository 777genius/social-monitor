import { Module } from '@nestjs/common';

import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';

import {
  DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
  resolveDeliveryDigestSchedulerLoopOptions,
} from './delivery-service-provider-tokens';
import { DigestSchedulerLoop } from './digest-scheduler-loop';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'delivery-service' }), DeliveryRestModule],
  providers: [
    {
      provide: DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryDigestSchedulerLoopOptions(process.env),
    },
    {
      provide: ScheduleDueDigestsCommandHandler,
      useFactory: (
        scheduleDueDigests: ScheduleDueDigestsUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ScheduleDueDigestsCommandHandler(scheduleDueDigests, metrics, runtime),
      inject: [ScheduleDueDigestsUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    DigestSchedulerLoop,
  ],
  exports: [ScheduleDueDigestsCommandHandler],
})
export class DeliveryServiceModule {}
