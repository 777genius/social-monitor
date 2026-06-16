import { Module } from '@nestjs/common';

import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { ProjectSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-summary-ready-event.handler';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';

import {
  DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
  DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
  resolveDeliveryAttemptDispatchLoopOptions,
  resolveDeliveryDigestSchedulerLoopOptions,
} from './delivery-service-provider-tokens';
import { DeliveryAttemptDispatchLoop } from './delivery-attempt-dispatch-loop';
import { DigestSchedulerLoop } from './digest-scheduler-loop';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'delivery-service' }), DeliveryRestModule],
  providers: [
    {
      provide: DELIVERY_DIGEST_SCHEDULER_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryDigestSchedulerLoopOptions(process.env),
    },
    {
      provide: DELIVERY_ATTEMPT_DISPATCH_LOOP_OPTIONS,
      useFactory: () => resolveDeliveryAttemptDispatchLoopOptions(process.env),
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
    {
      provide: SendDeliveryAttemptCommandHandler,
      useFactory: (
        sendDeliveryAttempt: SendDeliveryAttemptUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new SendDeliveryAttemptCommandHandler(sendDeliveryAttempt, metrics, runtime),
      inject: [SendDeliveryAttemptUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    {
      provide: ProjectSummaryReadyEventHandler,
      useFactory: (
        projectSummaryReady: ProjectSummaryReadyEventUseCase,
        metrics: InMemoryMetricsRecorder,
        runtime: WorkerRuntime,
      ) => new ProjectSummaryReadyEventHandler(projectSummaryReady, metrics, runtime),
      inject: [ProjectSummaryReadyEventUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
    DeliveryAttemptDispatchLoop,
    DigestSchedulerLoop,
  ],
  exports: [ProjectSummaryReadyEventHandler, ScheduleDueDigestsCommandHandler, SendDeliveryAttemptCommandHandler],
})
export class DeliveryServiceModule {}
