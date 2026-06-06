import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { RealtimeEventsController } from './realtime-events.controller';

@Module({
  controllers: [RealtimeEventsController],
  providers: [
    InMemoryRealtimeEventRepository,
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
    InMemoryRealtimeEventRepository,
    ListRealtimeEventsUseCase,
    ProjectSummaryReadyEventUseCase,
    RecordRealtimeEventUseCase,
  ],
})
export class DeliveryRestModule {}
