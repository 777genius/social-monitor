import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { CircuitBreakerDeliveryProvider } from '../../adapters/notification/circuit-breaker-delivery.provider';
import { InMemoryDeliveryProvider } from '../../adapters/notification/in-memory-delivery.provider';
import { MeteredDeliveryProvider } from '../../adapters/notification/metered-delivery.provider';
import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestScheduleRepository } from '../../adapters/persistence/in-memory-digest-schedule.repository';
import { InMemoryDigestRepository } from '../../adapters/persistence/in-memory-digest.repository';
import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryWebhookEndpointRepository } from '../../adapters/persistence/in-memory-webhook-endpoint.repository';
import { PrismaDeliveryAttemptRepository } from '../../adapters/persistence/prisma/prisma-delivery-attempt.repository';
import type { PrismaDeliveryClient } from '../../adapters/persistence/prisma/prisma-delivery-client';
import { PrismaDeliveryConnection } from '../../adapters/persistence/prisma/prisma-delivery-connection';
import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { InMemoryWebhookReplayStore } from '../../adapters/replay/in-memory-webhook-replay.store';
import { InMemoryWebhookSecretVault } from '../../adapters/secrets/in-memory-webhook-secret.vault';
import { InMemoryDigestSourceReader } from '../../adapters/source/in-memory-digest-source.reader';
import { ApplyDeliverySuppressionUseCase } from '../../features/apply-delivery-suppression/apply-delivery-suppression.use-case';
import { AssembleDigestUseCase } from '../../features/assemble-digest/assemble-digest.use-case';
import { CreateWebhookEndpointUseCase } from '../../features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '../../features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import { GetWebhookEndpointUseCase } from '../../features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import { ListWebhookEndpointsUseCase } from '../../features/list-webhook-endpoints/list-webhook-endpoints.use-case';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { QuarantineWebhookEndpointUseCase } from '../../features/quarantine-webhook-endpoint/quarantine-webhook-endpoint.use-case';
import { QueueDeliveryAttemptUseCase } from '../../features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '../../features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { RetryDeliveryAttemptUseCase } from '../../features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import { ScheduleDueDigestsUseCase } from '../../features/schedule-due-digests/schedule-due-digests.use-case';
import { SendDeliveryAttemptUseCase } from '../../features/send-delivery-attempt/send-delivery-attempt.use-case';
import { SignWebhookPayloadUseCase } from '../../features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '../../features/verify-webhook-signature/verify-webhook-signature.use-case';
import { DeliveryAttemptsController } from './delivery-attempts.controller';
import {
  DELIVERY_ATTEMPT_REPOSITORY,
  DELIVERY_PERSISTENCE_MODE,
  DELIVERY_PRISMA_CLIENT,
  resolveDeliveryPersistenceMode,
  type DeliveryPersistenceMode,
} from './delivery-provider-tokens';
import { DigestsController } from './digests.controller';
import { RealtimeEventsController } from './realtime-events.controller';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import type { DeliveryAttemptRepositoryPort, DeliveryProviderPort } from '../../ports';

export const DELIVERY_PROVIDERS = Symbol('DELIVERY_PROVIDERS');

@Module({
  imports: [IdentityRestModule, UsageRestModule],
  controllers: [DeliveryAttemptsController, DigestsController, RealtimeEventsController, WebhookEndpointsController],
  providers: [
    {
      provide: DELIVERY_PERSISTENCE_MODE,
      useFactory: () => resolveDeliveryPersistenceMode(process.env),
    },
    {
      provide: DELIVERY_PRISMA_CLIENT,
      useFactory: (mode: DeliveryPersistenceMode): PrismaDeliveryClient | null =>
        mode === 'prisma' ? new PrismaDeliveryConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [DELIVERY_PERSISTENCE_MODE],
    },
    InMemoryDeliveryAttemptRepository,
    InMemoryDigestScheduleRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    InMemoryWebhookEndpointRepository,
    InMemoryWebhookReplayStore,
    InMemoryWebhookSecretVault,
    InMemoryMetricsRecorder,
    {
      provide: DELIVERY_PROVIDERS,
      useFactory: (metrics: InMemoryMetricsRecorder) => [
        createDeliveryProvider('in_app', metrics),
        createDeliveryProvider('email', metrics),
        createDeliveryProvider('webhook', metrics),
      ],
      inject: [InMemoryMetricsRecorder],
    },
    {
      provide: DELIVERY_ATTEMPT_REPOSITORY,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryAttempts: InMemoryDeliveryAttemptRepository,
      ): DeliveryAttemptRepositoryPort =>
        mode === 'prisma'
          ? new PrismaDeliveryAttemptRepository(requirePrismaDeliveryClient(prisma))
          : inMemoryAttempts,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryDeliveryAttemptRepository],
    },
    {
      provide: QueueDeliveryAttemptUseCase,
      useFactory: (attempts: DeliveryAttemptRepositoryPort) =>
        new QueueDeliveryAttemptUseCase(attempts, new CryptoIdGenerator(), new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY],
    },
    {
      provide: GetDeliveryAttemptUseCase,
      useFactory: (attempts: DeliveryAttemptRepositoryPort) => new GetDeliveryAttemptUseCase(attempts),
      inject: [DELIVERY_ATTEMPT_REPOSITORY],
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
      provide: CreateWebhookEndpointUseCase,
      useFactory: (
        endpoints: InMemoryWebhookEndpointRepository,
        secrets: InMemoryWebhookSecretVault,
      ) => new CreateWebhookEndpointUseCase(endpoints, secrets, new CryptoIdGenerator(), new SystemClock()),
      inject: [InMemoryWebhookEndpointRepository, InMemoryWebhookSecretVault],
    },
    {
      provide: GetWebhookEndpointUseCase,
      useFactory: (endpoints: InMemoryWebhookEndpointRepository) => new GetWebhookEndpointUseCase(endpoints),
      inject: [InMemoryWebhookEndpointRepository],
    },
    {
      provide: ListWebhookEndpointsUseCase,
      useFactory: (endpoints: InMemoryWebhookEndpointRepository) => new ListWebhookEndpointsUseCase(endpoints),
      inject: [InMemoryWebhookEndpointRepository],
    },
    {
      provide: DisableWebhookEndpointUseCase,
      useFactory: (endpoints: InMemoryWebhookEndpointRepository) =>
        new DisableWebhookEndpointUseCase(endpoints, new SystemClock()),
      inject: [InMemoryWebhookEndpointRepository],
    },
    {
      provide: SignWebhookPayloadUseCase,
      useFactory: (
        endpoints: InMemoryWebhookEndpointRepository,
        secrets: InMemoryWebhookSecretVault,
      ) => new SignWebhookPayloadUseCase(endpoints, secrets),
      inject: [InMemoryWebhookEndpointRepository, InMemoryWebhookSecretVault],
    },
    {
      provide: QuarantineWebhookEndpointUseCase,
      useFactory: (endpoints: InMemoryWebhookEndpointRepository) =>
        new QuarantineWebhookEndpointUseCase(endpoints, new SystemClock()),
      inject: [InMemoryWebhookEndpointRepository],
    },
    {
      provide: VerifyWebhookSignatureUseCase,
      useFactory: (
        endpoints: InMemoryWebhookEndpointRepository,
        secrets: InMemoryWebhookSecretVault,
        replayStore: InMemoryWebhookReplayStore,
      ) => new VerifyWebhookSignatureUseCase(endpoints, secrets, replayStore, new SystemClock()),
      inject: [InMemoryWebhookEndpointRepository, InMemoryWebhookSecretVault, InMemoryWebhookReplayStore],
    },
    {
      provide: ApplyDeliverySuppressionUseCase,
      useFactory: (attempts: DeliveryAttemptRepositoryPort) =>
        new ApplyDeliverySuppressionUseCase(attempts, new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY],
    },
    {
      provide: RecordDeliveryAttemptStateUseCase,
      useFactory: (attempts: DeliveryAttemptRepositoryPort) =>
        new RecordDeliveryAttemptStateUseCase(attempts, new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY],
    },
    {
      provide: SendDeliveryAttemptUseCase,
      useFactory: (
        attempts: DeliveryAttemptRepositoryPort,
        providers: readonly DeliveryProviderPort[],
        preferences: InMemoryNotificationPreferenceReader,
      ) => new SendDeliveryAttemptUseCase(attempts, providers, preferences, new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_PROVIDERS, InMemoryNotificationPreferenceReader],
    },
    {
      provide: RetryDeliveryAttemptUseCase,
      useFactory: (
        attempts: DeliveryAttemptRepositoryPort,
        sendDeliveryAttempt: SendDeliveryAttemptUseCase,
      ) => new RetryDeliveryAttemptUseCase(attempts, sendDeliveryAttempt),
      inject: [DELIVERY_ATTEMPT_REPOSITORY, SendDeliveryAttemptUseCase],
    },
    {
      provide: ScheduleDueDigestsUseCase,
      useFactory: (
        schedules: InMemoryDigestScheduleRepository,
        assembleDigest: AssembleDigestUseCase,
      ) => new ScheduleDueDigestsUseCase(schedules, assembleDigest, new SystemClock()),
      inject: [InMemoryDigestScheduleRepository, AssembleDigestUseCase],
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
    CreateWebhookEndpointUseCase,
    DisableWebhookEndpointUseCase,
    GetWebhookEndpointUseCase,
    ListWebhookEndpointsUseCase,
    InMemoryDeliveryAttemptRepository,
    InMemoryDigestScheduleRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    InMemoryWebhookEndpointRepository,
    InMemoryWebhookReplayStore,
    InMemoryWebhookSecretVault,
    InMemoryMetricsRecorder,
    ListRealtimeEventsUseCase,
    ProjectSummaryReadyEventUseCase,
    QuarantineWebhookEndpointUseCase,
    QueueDeliveryAttemptUseCase,
    RecordDeliveryAttemptStateUseCase,
    RecordRealtimeEventUseCase,
    RetryDeliveryAttemptUseCase,
    ScheduleDueDigestsUseCase,
    SendDeliveryAttemptUseCase,
    SignWebhookPayloadUseCase,
    VerifyWebhookSignatureUseCase,
    DELIVERY_ATTEMPT_REPOSITORY,
    DELIVERY_PROVIDERS,
  ],
})
export class DeliveryRestModule {}

const createDeliveryProvider = (
  channel: DeliveryProviderPort['channel'],
  metrics: InMemoryMetricsRecorder,
): DeliveryProviderPort =>
  new MeteredDeliveryProvider(
    new CircuitBreakerDeliveryProvider(new InMemoryDeliveryProvider(channel), new SystemClock(), {
      failureThreshold: 3,
      cooldownSeconds: 60,
    }),
    metrics,
  );

const requirePrismaDeliveryClient = (client: PrismaDeliveryClient | null): PrismaDeliveryClient => {
  if (client === null) {
    throw new Error('Prisma delivery client is required when DELIVERY_PERSISTENCE=prisma');
  }

  return client;
};
