import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';

import { ContractWebhookEventCatalogAdapter } from '../../adapters/events/contract-webhook-event-catalog.adapter';
import { CircuitBreakerDeliveryProvider } from '../../adapters/notification/circuit-breaker-delivery.provider';
import {
  FetchWebhookHttpClient,
  HttpWebhookDeliveryProvider,
  resolveHttpWebhookDeliveryProviderOptions,
} from '../../adapters/notification/http-webhook-delivery.provider';
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
import { PrismaDigestScheduleRepository } from '../../adapters/persistence/prisma/prisma-digest-schedule.repository';
import { PrismaDigestRepository } from '../../adapters/persistence/prisma/prisma-digest.repository';
import { PrismaRealtimeEventRepository } from '../../adapters/persistence/prisma/prisma-realtime-event.repository';
import { PrismaWebhookEndpointRepository } from '../../adapters/persistence/prisma/prisma-webhook-endpoint.repository';
import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { PrismaNotificationPreferenceReader } from '../../adapters/preferences/prisma/prisma-notification-preference.reader';
import { InMemoryWebhookReplayStore } from '../../adapters/replay/in-memory-webhook-replay.store';
import { PrismaWebhookReplayStore } from '../../adapters/replay/prisma/prisma-webhook-replay.store';
import { InMemoryWebhookSecretVault } from '../../adapters/secrets/in-memory-webhook-secret.vault';
import {
  PrismaWebhookSecretVault,
  resolveWebhookSecretEncryptionKey,
} from '../../adapters/secrets/prisma/prisma-webhook-secret.vault';
import { InMemoryDigestSourceReader } from '../../adapters/source/in-memory-digest-source.reader';
import { PrismaDigestSourceReader } from '../../adapters/source/prisma/prisma-digest-source.reader';
import { ApplyDeliverySuppressionUseCase } from '../../features/apply-delivery-suppression/apply-delivery-suppression.use-case';
import { AssembleDigestUseCase } from '../../features/assemble-digest/assemble-digest.use-case';
import { CreateDigestScheduleUseCase } from '../../features/create-digest-schedule/create-digest-schedule.use-case';
import { CreateWebhookEndpointUseCase } from '../../features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '../../features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import { GetDigestScheduleUseCase } from '../../features/get-digest-schedule/get-digest-schedule.use-case';
import { GetNotificationPreferenceUseCase } from '../../features/get-notification-preference/get-notification-preference.use-case';
import { GetWebhookEndpointUseCase } from '../../features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import { ListDeliveryAttemptsUseCase } from '../../features/list-delivery-attempts/list-delivery-attempts.use-case';
import { ListDigestSchedulesUseCase } from '../../features/list-digest-schedules/list-digest-schedules.use-case';
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
import { SetNotificationPreferenceUseCase } from '../../features/set-notification-preference/set-notification-preference.use-case';
import { SignWebhookPayloadUseCase } from '../../features/sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from '../../features/verify-webhook-signature/verify-webhook-signature.use-case';
import { DeliveryAttemptsController } from './delivery-attempts.controller';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';
import { DigestSchedulesController } from './digest-schedules.controller';
import {
  DELIVERY_ATTEMPT_REPOSITORY,
  DELIVERY_DIGEST_REPOSITORY,
  DELIVERY_DIGEST_SCHEDULE_REPOSITORY,
  DELIVERY_DIGEST_SOURCE_READER,
  DELIVERY_NOTIFICATION_PREFERENCE_MANAGER,
  DELIVERY_NOTIFICATION_PREFERENCE_READER,
  DELIVERY_PERSISTENCE_MODE,
  DELIVERY_PRISMA_CLIENT,
  DELIVERY_REALTIME_EVENT_REPOSITORY,
  DELIVERY_REALTIME_FANOUT,
  DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
  DELIVERY_WEBHOOK_REPLAY_STORE,
  DELIVERY_WEBHOOK_SECRET_VAULT,
  resolveDeliveryPersistenceMode,
  type DeliveryPersistenceMode,
} from './delivery-provider-tokens';
import { DigestsController } from './digests.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { RealtimeEventsController } from './realtime-events.controller';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { RealtimeEventsGateway } from '../ws/realtime-events.gateway';
import type {
  DeliveryAttemptRepositoryPort,
  DeliveryProviderPort,
  DigestRepositoryPort,
  DigestScheduleRepositoryPort,
  DigestSourceReaderPort,
  NotificationPreferenceManagementPort,
  NotificationPreferenceReaderPort,
  RealtimeFanoutPort,
  RealtimeEventRepositoryPort,
  WebhookEndpointRepositoryPort,
  WebhookEventCatalogPort,
  WebhookReplayStorePort,
  WebhookSecretVaultPort,
} from '../../ports';

export const DELIVERY_PROVIDERS = Symbol('DELIVERY_PROVIDERS');
const DELIVERY_WEBHOOK_EVENT_CATALOG = Symbol('DELIVERY_WEBHOOK_EVENT_CATALOG');

@Module({
  imports: [IdentityRestModule, UsageRestModule],
  controllers: [
    DeliveryAttemptsController,
    DigestSchedulesController,
    DigestsController,
    NotificationPreferencesController,
    RealtimeEventsController,
    WebhookEndpointsController,
  ],
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
      provide: DELIVERY_WEBHOOK_EVENT_CATALOG,
      useClass: ContractWebhookEventCatalogAdapter,
    },
    DeliveryReadAuthorizer,
    RealtimeEventsGateway,
    {
      provide: DELIVERY_REALTIME_FANOUT,
      useExisting: RealtimeEventsGateway,
    },
    {
      provide: DELIVERY_PROVIDERS,
      useFactory: (
        metrics: InMemoryMetricsRecorder,
        endpoints: WebhookEndpointRepositoryPort,
        secrets: WebhookSecretVaultPort,
        eventCatalog: WebhookEventCatalogPort,
      ) => [
        createInMemoryDeliveryProvider('in_app', metrics),
        createInMemoryDeliveryProvider('email', metrics),
        createWebhookDeliveryProvider(metrics, endpoints, secrets, eventCatalog),
      ],
      inject: [
        InMemoryMetricsRecorder,
        DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
        DELIVERY_WEBHOOK_SECRET_VAULT,
        DELIVERY_WEBHOOK_EVENT_CATALOG,
      ],
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
      provide: DELIVERY_DIGEST_REPOSITORY,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryDigests: InMemoryDigestRepository,
      ): DigestRepositoryPort =>
        mode === 'prisma'
          ? new PrismaDigestRepository(requirePrismaDeliveryClient(prisma))
          : inMemoryDigests,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryDigestRepository],
    },
    {
      provide: DELIVERY_DIGEST_SCHEDULE_REPOSITORY,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemorySchedules: InMemoryDigestScheduleRepository,
      ): DigestScheduleRepositoryPort =>
        mode === 'prisma'
          ? new PrismaDigestScheduleRepository(requirePrismaDeliveryClient(prisma))
          : inMemorySchedules,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryDigestScheduleRepository],
    },
    {
      provide: DELIVERY_DIGEST_SOURCE_READER,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemorySources: InMemoryDigestSourceReader,
      ): DigestSourceReaderPort =>
        mode === 'prisma'
          ? new PrismaDigestSourceReader(requirePrismaDeliveryClient(prisma))
          : inMemorySources,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryDigestSourceReader],
    },
    {
      provide: DELIVERY_REALTIME_EVENT_REPOSITORY,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryEvents: InMemoryRealtimeEventRepository,
      ): RealtimeEventRepositoryPort =>
        mode === 'prisma'
          ? new PrismaRealtimeEventRepository(requirePrismaDeliveryClient(prisma))
          : inMemoryEvents,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryRealtimeEventRepository],
    },
    {
      provide: DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryEndpoints: InMemoryWebhookEndpointRepository,
      ): WebhookEndpointRepositoryPort =>
        mode === 'prisma'
          ? new PrismaWebhookEndpointRepository(requirePrismaDeliveryClient(prisma))
          : inMemoryEndpoints,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryWebhookEndpointRepository],
    },
    {
      provide: DELIVERY_WEBHOOK_SECRET_VAULT,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemorySecrets: InMemoryWebhookSecretVault,
      ): WebhookSecretVaultPort =>
        mode === 'prisma'
          ? new PrismaWebhookSecretVault(
            requirePrismaDeliveryClient(prisma),
            resolveWebhookSecretEncryptionKey(process.env),
          )
          : inMemorySecrets,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryWebhookSecretVault],
    },
    {
      provide: DELIVERY_WEBHOOK_REPLAY_STORE,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryReplayStore: InMemoryWebhookReplayStore,
      ): WebhookReplayStorePort =>
        mode === 'prisma'
          ? new PrismaWebhookReplayStore(requirePrismaDeliveryClient(prisma))
          : inMemoryReplayStore,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryWebhookReplayStore],
    },
    {
      provide: DELIVERY_NOTIFICATION_PREFERENCE_READER,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryClient | null,
        inMemoryPreferences: InMemoryNotificationPreferenceReader,
      ): NotificationPreferenceReaderPort & NotificationPreferenceManagementPort =>
        mode === 'prisma'
          ? new PrismaNotificationPreferenceReader(requirePrismaDeliveryClient(prisma))
          : inMemoryPreferences,
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, InMemoryNotificationPreferenceReader],
    },
    {
      provide: DELIVERY_NOTIFICATION_PREFERENCE_MANAGER,
      useExisting: DELIVERY_NOTIFICATION_PREFERENCE_READER,
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
      provide: ListDeliveryAttemptsUseCase,
      useFactory: (attempts: DeliveryAttemptRepositoryPort) => new ListDeliveryAttemptsUseCase(attempts),
      inject: [DELIVERY_ATTEMPT_REPOSITORY],
    },
    {
      provide: AssembleDigestUseCase,
      useFactory: (
        digests: DigestRepositoryPort,
        sources: DigestSourceReaderPort,
        queueDeliveryAttempt: QueueDeliveryAttemptUseCase,
      ) =>
        new AssembleDigestUseCase(
          digests,
          sources,
          queueDeliveryAttempt,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [DELIVERY_DIGEST_REPOSITORY, DELIVERY_DIGEST_SOURCE_READER, QueueDeliveryAttemptUseCase],
    },
    {
      provide: GetDigestUseCase,
      useFactory: (digests: DigestRepositoryPort) => new GetDigestUseCase(digests),
      inject: [DELIVERY_DIGEST_REPOSITORY],
    },
    {
      provide: CreateDigestScheduleUseCase,
      useFactory: (schedules: DigestScheduleRepositoryPort) =>
        new CreateDigestScheduleUseCase(schedules, new CryptoIdGenerator(), new SystemClock()),
      inject: [DELIVERY_DIGEST_SCHEDULE_REPOSITORY],
    },
    {
      provide: GetDigestScheduleUseCase,
      useFactory: (schedules: DigestScheduleRepositoryPort) => new GetDigestScheduleUseCase(schedules),
      inject: [DELIVERY_DIGEST_SCHEDULE_REPOSITORY],
    },
    {
      provide: ListDigestSchedulesUseCase,
      useFactory: (schedules: DigestScheduleRepositoryPort) => new ListDigestSchedulesUseCase(schedules),
      inject: [DELIVERY_DIGEST_SCHEDULE_REPOSITORY],
    },
    {
      provide: SetNotificationPreferenceUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new SetNotificationPreferenceUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
    },
    {
      provide: GetNotificationPreferenceUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new GetNotificationPreferenceUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
    },
    {
      provide: CreateWebhookEndpointUseCase,
      useFactory: (
        endpoints: WebhookEndpointRepositoryPort,
        secrets: WebhookSecretVaultPort,
        eventCatalog: WebhookEventCatalogPort,
      ) => new CreateWebhookEndpointUseCase(
        endpoints,
        secrets,
        new CryptoIdGenerator(),
        new SystemClock(),
        eventCatalog,
      ),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY, DELIVERY_WEBHOOK_SECRET_VAULT, DELIVERY_WEBHOOK_EVENT_CATALOG],
    },
    {
      provide: GetWebhookEndpointUseCase,
      useFactory: (endpoints: WebhookEndpointRepositoryPort) => new GetWebhookEndpointUseCase(endpoints),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
    },
    {
      provide: ListWebhookEndpointsUseCase,
      useFactory: (endpoints: WebhookEndpointRepositoryPort) => new ListWebhookEndpointsUseCase(endpoints),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
    },
    {
      provide: DisableWebhookEndpointUseCase,
      useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
        new DisableWebhookEndpointUseCase(endpoints, new SystemClock()),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
    },
    {
      provide: SignWebhookPayloadUseCase,
      useFactory: (
        endpoints: WebhookEndpointRepositoryPort,
        secrets: WebhookSecretVaultPort,
        eventCatalog: WebhookEventCatalogPort,
      ) => new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY, DELIVERY_WEBHOOK_SECRET_VAULT, DELIVERY_WEBHOOK_EVENT_CATALOG],
    },
    {
      provide: QuarantineWebhookEndpointUseCase,
      useFactory: (endpoints: WebhookEndpointRepositoryPort) =>
        new QuarantineWebhookEndpointUseCase(endpoints, new SystemClock()),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY],
    },
    {
      provide: VerifyWebhookSignatureUseCase,
      useFactory: (
        endpoints: WebhookEndpointRepositoryPort,
        secrets: WebhookSecretVaultPort,
        replayStore: WebhookReplayStorePort,
      ) => new VerifyWebhookSignatureUseCase(endpoints, secrets, replayStore, new SystemClock()),
      inject: [DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY, DELIVERY_WEBHOOK_SECRET_VAULT, DELIVERY_WEBHOOK_REPLAY_STORE],
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
        preferences: NotificationPreferenceReaderPort,
      ) => new SendDeliveryAttemptUseCase(attempts, providers, preferences, new SystemClock()),
      inject: [DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_PROVIDERS, DELIVERY_NOTIFICATION_PREFERENCE_READER],
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
        schedules: DigestScheduleRepositoryPort,
        assembleDigest: AssembleDigestUseCase,
      ) => new ScheduleDueDigestsUseCase(schedules, assembleDigest, new SystemClock()),
      inject: [DELIVERY_DIGEST_SCHEDULE_REPOSITORY, AssembleDigestUseCase],
    },
    {
      provide: RecordRealtimeEventUseCase,
      useFactory: (events: RealtimeEventRepositoryPort, fanout: RealtimeFanoutPort) =>
        new RecordRealtimeEventUseCase(events, new CryptoIdGenerator(), new SystemClock(), fanout),
      inject: [DELIVERY_REALTIME_EVENT_REPOSITORY, DELIVERY_REALTIME_FANOUT],
    },
    {
      provide: ListRealtimeEventsUseCase,
      useFactory: (events: RealtimeEventRepositoryPort) => new ListRealtimeEventsUseCase(events),
      inject: [DELIVERY_REALTIME_EVENT_REPOSITORY],
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
    ListDeliveryAttemptsUseCase,
    GetDigestUseCase,
    CreateWebhookEndpointUseCase,
    CreateDigestScheduleUseCase,
    DisableWebhookEndpointUseCase,
    GetWebhookEndpointUseCase,
    GetDigestScheduleUseCase,
    GetNotificationPreferenceUseCase,
    ListDigestSchedulesUseCase,
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
    SetNotificationPreferenceUseCase,
    SignWebhookPayloadUseCase,
    VerifyWebhookSignatureUseCase,
    DELIVERY_ATTEMPT_REPOSITORY,
    DELIVERY_DIGEST_REPOSITORY,
    DELIVERY_DIGEST_SCHEDULE_REPOSITORY,
    DELIVERY_DIGEST_SOURCE_READER,
    DELIVERY_REALTIME_EVENT_REPOSITORY,
    DELIVERY_REALTIME_FANOUT,
    DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY,
    DELIVERY_WEBHOOK_SECRET_VAULT,
    DELIVERY_WEBHOOK_REPLAY_STORE,
    DELIVERY_NOTIFICATION_PREFERENCE_MANAGER,
    DELIVERY_NOTIFICATION_PREFERENCE_READER,
    DELIVERY_PROVIDERS,
  ],
})
export class DeliveryRestModule {}

const createInMemoryDeliveryProvider = (
  channel: DeliveryProviderPort['channel'],
  metrics: InMemoryMetricsRecorder,
): DeliveryProviderPort =>
  wrapDeliveryProvider(new InMemoryDeliveryProvider(channel), metrics);

const createWebhookDeliveryProvider = (
  metrics: InMemoryMetricsRecorder,
  endpoints: WebhookEndpointRepositoryPort,
  secrets: WebhookSecretVaultPort,
  eventCatalog: WebhookEventCatalogPort,
): DeliveryProviderPort => {
  const mode = resolveDeliveryWebhookProviderMode(process.env);
  const delegate = mode === 'http'
    ? new HttpWebhookDeliveryProvider(
        endpoints,
        new SignWebhookPayloadUseCase(endpoints, secrets, eventCatalog),
        new FetchWebhookHttpClient(),
        new SystemClock(),
        resolveHttpWebhookDeliveryProviderOptions(process.env),
      )
    : new InMemoryDeliveryProvider('webhook');

  return wrapDeliveryProvider(delegate, metrics);
};

const wrapDeliveryProvider = (
  provider: DeliveryProviderPort,
  metrics: InMemoryMetricsRecorder,
): DeliveryProviderPort =>
  new MeteredDeliveryProvider(
    new CircuitBreakerDeliveryProvider(provider, new SystemClock(), {
      failureThreshold: 3,
      cooldownSeconds: 60,
    }),
    metrics,
  );

export const resolveDeliveryWebhookProviderMode = (env: NodeJS.ProcessEnv): 'in-memory' | 'http' => {
  const value = env.DELIVERY_WEBHOOK_PROVIDER ?? 'in-memory';

  if (value === 'in-memory' || value === 'http') {
    assertRuntimeProfileAllowsMode({
      env,
      settingName: 'DELIVERY_WEBHOOK_PROVIDER',
      selectedMode: value,
      durableModes: ['http'],
    });

    return value;
  }

  throw new Error('DELIVERY_WEBHOOK_PROVIDER must be "in-memory" or "http"');
};

const requirePrismaDeliveryClient = (client: PrismaDeliveryClient | null): PrismaDeliveryClient => {
  if (client === null) {
    throw new Error('Prisma delivery client is required when DELIVERY_PERSISTENCE=prisma');
  }

  return client;
};
