import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryDeliveryProvider } from '../../adapters/notification/in-memory-delivery.provider';
import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestRepository } from '../../adapters/persistence/in-memory-digest.repository';
import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { InMemoryDigestSourceReader } from '../../adapters/source/in-memory-digest-source.reader';
import { ApplyDeliverySuppressionUseCase } from '../../features/apply-delivery-suppression/apply-delivery-suppression.use-case';
import { AssembleDigestUseCase } from '../../features/assemble-digest/assemble-digest.use-case';
import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { QueueDeliveryAttemptUseCase } from '../../features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '../../features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { RetryDeliveryAttemptUseCase } from '../../features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '../../features/send-delivery-attempt/send-delivery-attempt.use-case';
import { DeliveryAttemptsController } from './delivery-attempts.controller';
import { DigestsController } from './digests.controller';
import { RealtimeEventsController } from './realtime-events.controller';

export const DELIVERY_PROVIDERS = Symbol('DELIVERY_PROVIDERS');

@Module({
  controllers: [DeliveryAttemptsController, DigestsController, RealtimeEventsController],
  providers: [
    InMemoryDeliveryAttemptRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    {
      provide: DELIVERY_PROVIDERS,
      useFactory: () => [
        new InMemoryDeliveryProvider('in_app'),
        new InMemoryDeliveryProvider('email'),
        new InMemoryDeliveryProvider('webhook'),
      ],
    },
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
      provide: AssembleDigestUseCase,
      useFactory: (
        digests: InMemoryDigestRepository,
        sources: InMemoryDigestSourceReader,
        queueDeliveryAttempt: QueueDeliveryAttemptUseCase,
      ) =>
        new AssembleDigestUseCase(
          digests,
          sources,
          queueDeliveryAttempt,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [InMemoryDigestRepository, InMemoryDigestSourceReader, QueueDeliveryAttemptUseCase],
    },
    {
      provide: GetDigestUseCase,
      useFactory: (digests: InMemoryDigestRepository) => new GetDigestUseCase(digests),
      inject: [InMemoryDigestRepository],
    },
    {
      provide: ApplyDeliverySuppressionUseCase,
      useFactory: (attempts: InMemoryDeliveryAttemptRepository) =>
        new ApplyDeliverySuppressionUseCase(attempts, new SystemClock()),
      inject: [InMemoryDeliveryAttemptRepository],
    },
    {
      provide: RecordDeliveryAttemptStateUseCase,
      useFactory: (attempts: InMemoryDeliveryAttemptRepository) =>
        new RecordDeliveryAttemptStateUseCase(attempts, new SystemClock()),
      inject: [InMemoryDeliveryAttemptRepository],
    },
    {
      provide: SendDeliveryAttemptUseCase,
      useFactory: (
        attempts: InMemoryDeliveryAttemptRepository,
        providers: readonly InMemoryDeliveryProvider[],
        preferences: InMemoryNotificationPreferenceReader,
      ) => new SendDeliveryAttemptUseCase(attempts, providers, preferences, new SystemClock()),
      inject: [InMemoryDeliveryAttemptRepository, DELIVERY_PROVIDERS, InMemoryNotificationPreferenceReader],
    },
    {
      provide: RetryDeliveryAttemptUseCase,
      useFactory: (
        attempts: InMemoryDeliveryAttemptRepository,
        sendDeliveryAttempt: SendDeliveryAttemptUseCase,
      ) => new RetryDeliveryAttemptUseCase(attempts, sendDeliveryAttempt),
      inject: [InMemoryDeliveryAttemptRepository, SendDeliveryAttemptUseCase],
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
    ApplyDeliverySuppressionUseCase,
    AssembleDigestUseCase,
    GetDeliveryAttemptUseCase,
    GetDigestUseCase,
    InMemoryDeliveryAttemptRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    ListRealtimeEventsUseCase,
    ProjectSummaryReadyEventUseCase,
    QueueDeliveryAttemptUseCase,
    RecordDeliveryAttemptStateUseCase,
    RecordRealtimeEventUseCase,
    RetryDeliveryAttemptUseCase,
    SendDeliveryAttemptUseCase,
    DELIVERY_PROVIDERS,
  ],
})
export class DeliveryRestModule {}
