import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { QueueDeliveryAttemptUseCase } from '../../features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { DeliveryAttemptsController } from './delivery-attempts.controller';
import { RealtimeEventsController } from './realtime-events.controller';

@Module({
  controllers: [DeliveryAttemptsController, RealtimeEventsController],
  providers: [
    InMemoryDeliveryAttemptRepository,
    InMemoryRealtimeEventRepository,
    {
      provide: QueueDeliveryAttemptUseCase,
      useFactory: (attempts: InMemoryDeliveryAttemptRepository) =>
        new QueueDeliveryAttemptUseCase(attempts, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemoryDeliveryAttemptRepository],
    },
    {
      provide: GetDeliveryAttemptUseCase,
      useFactory: (attempts: InMemoryDeliveryAttemptRepository) => new GetDeliveryAttemptUseCase(attempts),
      inject: [InMemoryDeliveryAttemptRepository],
    },
    {
      provide: RecordRealtimeEventUseCase,
      useFactory: (events: InMemoryRealtimeEventRepository) =>
        new RecordRealtimeEventUseCase(events, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemoryRealtimeEventRepository],
    },
    {
      provide: ListRealtimeEventsUseCase,
      useFactory: (events: InMemoryRealtimeEventRepository) => new ListRealtimeEventsUseCase(events),
      inject: [InMemoryRealtimeEventRepository],
    },
    {
      provide: ProjectSummaryReadyEventUseCase,
      useFactory: (recordRealtimeEvent: RecordRealtimeEventUseCase) =>
        new ProjectSummaryReadyEventUseCase(recordRealtimeEvent),
      inject: [RecordRealtimeEventUseCase],
    },
  ],
  exports: [
    GetDeliveryAttemptUseCase,
    InMemoryDeliveryAttemptRepository,
    InMemoryRealtimeEventRepository,
    ListRealtimeEventsUseCase,
    ProjectSummaryReadyEventUseCase,
    QueueDeliveryAttemptUseCase,
    RecordRealtimeEventUseCase,
  ],
})
export class DeliveryRestModule {}
