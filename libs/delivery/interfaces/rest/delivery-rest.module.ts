import { ProjectReaderSummaryReadyEventUseCase } from '../../features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { Module } from '@nestjs/common';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { UsageRestModule } from '@social-monitor/usage/interfaces/rest/usage-rest.module';
import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestScheduleRepository } from '../../adapters/persistence/in-memory-digest-schedule.repository';
import { InMemoryDigestRepository } from '../../adapters/persistence/in-memory-digest.repository';
import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryWebhookEndpointRepository } from '../../adapters/persistence/in-memory-webhook-endpoint.repository';
import type { PrismaDeliveryClient } from '../../adapters/persistence/prisma/prisma-delivery-client';
import { PrismaDeliveryConnection } from '../../adapters/persistence/prisma/prisma-delivery-connection';
import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { InMemoryWebhookReplayStore } from '../../adapters/replay/in-memory-webhook-replay.store';
import { InMemoryWebhookSecretVault } from '../../adapters/secrets/in-memory-webhook-secret.vault';
import { InMemoryDigestSourceReader } from '../../adapters/source/in-memory-digest-source.reader';
import { ApplyDeliverySuppressionUseCase } from '../../features/apply-delivery-suppression/apply-delivery-suppression.use-case';
import { AssembleDigestUseCase } from '../../features/assemble-digest/assemble-digest.use-case';
import { CreateDigestScheduleUseCase } from '../../features/create-digest-schedule/create-digest-schedule.use-case';
import { GetDeliveryAttemptUseCase } from '../../features/get-delivery-attempt/get-delivery-attempt.use-case';
import { GetDigestUseCase } from '../../features/get-digest/get-digest.use-case';
import { GetDigestScheduleUseCase } from '../../features/get-digest-schedule/get-digest-schedule.use-case';
import { GetNotificationPreferenceUseCase } from '../../features/get-notification-preference/get-notification-preference.use-case';
import { GetWorkspaceSettingsUseCase } from '../../features/get-workspace-settings/get-workspace-settings.use-case';
import { ListDeliveryAttemptsUseCase } from '../../features/list-delivery-attempts/list-delivery-attempts.use-case';
import { ListDigestSchedulesUseCase } from '../../features/list-digest-schedules/list-digest-schedules.use-case';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { QueueDeliveryAttemptUseCase } from '../../features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '../../features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { RecordRealtimeEventUseCase } from '../../features/record-realtime-event/record-realtime-event.use-case';
import { RetryDeliveryAttemptUseCase } from '../../features/retry-delivery-attempt/retry-delivery-attempt.use-case';
import { ScheduleDueDigestsUseCase } from '../../features/schedule-due-digests/schedule-due-digests.use-case';
import { SendDeliveryAttemptUseCase } from '../../features/send-delivery-attempt/send-delivery-attempt.use-case';
import { SetNotificationPreferenceUseCase } from '../../features/set-notification-preference/set-notification-preference.use-case';
import { UpdateWorkspaceDigestPreferenceUseCase } from '../../features/update-workspace-digest-preference/update-workspace-digest-preference.use-case';
import { UpdateWorkspaceTelemetryConsentUseCase } from '../../features/update-workspace-telemetry-consent/update-workspace-telemetry-consent.use-case';
import { DeliveryAttemptsController } from './delivery-attempts.controller';
import { DELIVERY_ATTEMPT_WORKFLOW, deliveryWorkflowProviders } from './delivery-workflow.providers';
import { createDeliveryWebhookProviders, deliveryWebhookExports } from './delivery-webhook.providers';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';
import { DigestSchedulesController } from './digest-schedules.controller';
import { DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_DIGEST_REPOSITORY, DELIVERY_DIGEST_SCHEDULE_REPOSITORY, DELIVERY_DIGEST_SOURCE_READER, DELIVERY_ENABLED_CHANNELS, DELIVERY_NOTIFICATION_PREFERENCE_MANAGER, DELIVERY_NOTIFICATION_PREFERENCE_READER, DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_REALTIME_EVENT_REPOSITORY, DELIVERY_REALTIME_FANOUT, DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY, DELIVERY_WEBHOOK_REPLAY_STORE, DELIVERY_WEBHOOK_SECRET_VAULT, resolveDeliveryEnabledChannels, resolveDeliveryPersistenceMode, type DeliveryPersistenceMode } from './delivery-provider-tokens';
import { DigestsController } from './digests.controller';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { RealtimeEventsController } from './realtime-events.controller';
import { WorkspaceSettingsController } from './workspace-settings.controller';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { RealtimeEventsGateway } from '../ws/realtime-events.gateway';
import { deliveryStorageProviders } from './delivery-storage.providers';
import { deliveryApplicationProviders } from './delivery-application.providers';

export { DELIVERY_PROVIDERS } from './delivery-webhook.providers';

@Module({
  imports: [IdentityRestModule, UsageRestModule],
  controllers: [
    DeliveryAttemptsController,
    DigestSchedulesController,
    DigestsController,
    NotificationPreferencesController,
    RealtimeEventsController,
    WorkspaceSettingsController,
    WebhookEndpointsController,
  ],
  providers: [
    {
      provide: DELIVERY_PERSISTENCE_MODE,
      useFactory: () => resolveDeliveryPersistenceMode(process.env),
    },
    {
      provide: DELIVERY_ENABLED_CHANNELS,
      useFactory: () => resolveDeliveryEnabledChannels(process.env),
    },
    {
      provide: DELIVERY_PRISMA_CLIENT,
      useFactory: async (
        mode: DeliveryPersistenceMode,
      ): Promise<PrismaDeliveryClient | null> =>
        mode === 'prisma'
          ? PrismaDeliveryConnection.create(
              resolvePostgresRuntimePoolConfig(process.env),
            )
          : null,
      inject: [DELIVERY_PERSISTENCE_MODE],
    },
    InMemoryDeliveryAttemptRepository,
    ...deliveryWorkflowProviders,
    InMemoryDigestScheduleRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    InMemoryWebhookEndpointRepository,
    InMemoryWebhookReplayStore,
    InMemoryWebhookSecretVault,
    ...createDeliveryWebhookProviders(process.env),
    DeliveryReadAuthorizer,
    RealtimeEventsGateway,
    {
      provide: DELIVERY_REALTIME_FANOUT,
      useExisting: RealtimeEventsGateway,
    },
    ...deliveryStorageProviders,
    ...deliveryApplicationProviders,
  ],
  exports: [
    ProjectReaderSummaryReadyEventUseCase,
    ApplyDeliverySuppressionUseCase,
    AssembleDigestUseCase,
    GetDeliveryAttemptUseCase,
    ListDeliveryAttemptsUseCase,
    GetDigestUseCase,
    CreateDigestScheduleUseCase,
    GetDigestScheduleUseCase,
    GetNotificationPreferenceUseCase,
    GetWorkspaceSettingsUseCase,
    ListDigestSchedulesUseCase,
    InMemoryDeliveryAttemptRepository,
    InMemoryDigestScheduleRepository,
    InMemoryDigestRepository,
    InMemoryDigestSourceReader,
    InMemoryNotificationPreferenceReader,
    InMemoryRealtimeEventRepository,
    InMemoryWebhookEndpointRepository,
    InMemoryWebhookReplayStore,
    InMemoryWebhookSecretVault,
    ListRealtimeEventsUseCase,
    ProjectSummaryReadyEventUseCase,
    QueueDeliveryAttemptUseCase,
    RecordDeliveryAttemptStateUseCase,
    RecordRealtimeEventUseCase,
    RetryDeliveryAttemptUseCase,
    ScheduleDueDigestsUseCase,
    SendDeliveryAttemptUseCase,
    SetNotificationPreferenceUseCase,
    UpdateWorkspaceDigestPreferenceUseCase,
    UpdateWorkspaceTelemetryConsentUseCase,
    ...deliveryWebhookExports,
    DELIVERY_ATTEMPT_REPOSITORY,
    DELIVERY_ATTEMPT_WORKFLOW,
    DELIVERY_PERSISTENCE_MODE,
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
  ],
})
export class DeliveryRestModule {}
