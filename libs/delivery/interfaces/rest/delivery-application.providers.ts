import type { Provider } from '@nestjs/common';
import { InMemoryReaderSummaryReadyProjectionStore } from '../../adapters/persistence/in-memory-reader-summary-ready-projection.store';
import { InMemorySummaryReadyProjectionStore } from '../../adapters/persistence/in-memory-summary-ready-projection.store';
import { PrismaReaderSummaryReadyProjectionStore } from '../../adapters/persistence/prisma/prisma-reader-summary-ready-projection.store';
import { PrismaSummaryReadyProjectionStore } from '../../adapters/persistence/prisma/prisma-summary-ready-projection.store';
import { ProjectReaderSummaryReadyEventUseCase } from '../../features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';
import { PrismaDeliveryConnection } from '../../adapters/persistence/prisma/prisma-delivery-connection';
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
import type { DeliveryChannel } from '../../domain';
import { DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_DIGEST_REPOSITORY, DELIVERY_DIGEST_SCHEDULE_REPOSITORY, DELIVERY_DIGEST_SOURCE_READER, DELIVERY_ENABLED_CHANNELS, DELIVERY_NOTIFICATION_PREFERENCE_MANAGER, DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_REALTIME_EVENT_REPOSITORY, DELIVERY_REALTIME_FANOUT, type DeliveryPersistenceMode } from './delivery-provider-tokens';
import type { DeliveryAttemptRepositoryPort, DigestRepositoryPort, DigestScheduleRepositoryPort, DigestSourceReaderPort, NotificationPreferenceManagementPort, RealtimeFanoutPort, RealtimeEventRepositoryPort } from '../../ports';

export const deliveryApplicationProviders: Provider[] = [
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
      useFactory: (
        schedules: DigestScheduleRepositoryPort,
        enabledChannels: readonly DeliveryChannel[],
      ) =>
        new CreateDigestScheduleUseCase(
          schedules,
          new CryptoIdGenerator(),
          new SystemClock(),
          enabledChannels,
        ),
      inject: [DELIVERY_DIGEST_SCHEDULE_REPOSITORY, DELIVERY_ENABLED_CHANNELS],
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
      useFactory: (
        preferences: NotificationPreferenceManagementPort,
        enabledChannels: readonly DeliveryChannel[],
      ) => new SetNotificationPreferenceUseCase(preferences, enabledChannels),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER, DELIVERY_ENABLED_CHANNELS],
    },
    {
      provide: GetNotificationPreferenceUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new GetNotificationPreferenceUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
    },
    {
      provide: GetWorkspaceSettingsUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new GetWorkspaceSettingsUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
    },
    {
      provide: UpdateWorkspaceDigestPreferenceUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new UpdateWorkspaceDigestPreferenceUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
    },
    {
      provide: UpdateWorkspaceTelemetryConsentUseCase,
      useFactory: (preferences: NotificationPreferenceManagementPort) =>
        new UpdateWorkspaceTelemetryConsentUseCase(preferences),
      inject: [DELIVERY_NOTIFICATION_PREFERENCE_MANAGER],
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
      provide: ProjectReaderSummaryReadyEventUseCase,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryConnection | null,
        events: RealtimeEventRepositoryPort,
      ) => {
        const ids = new CryptoIdGenerator();
        if (mode === 'prisma') {
          if (prisma === null) throw new Error('Reader summary projection requires Prisma');
          return new ProjectReaderSummaryReadyEventUseCase(new PrismaReaderSummaryReadyProjectionStore(prisma, ids));
        }
        return new ProjectReaderSummaryReadyEventUseCase(new InMemoryReaderSummaryReadyProjectionStore(events, ids));
      },
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_REALTIME_EVENT_REPOSITORY],
    },
    {
      provide: ProjectSummaryReadyEventUseCase,
      useFactory: (
        mode: DeliveryPersistenceMode,
        prisma: PrismaDeliveryConnection | null,
        events: RealtimeEventRepositoryPort,
        fanout: RealtimeFanoutPort,
      ) => {
        if (mode === 'prisma') {
          if (prisma === null) throw new Error('Summary ready projection requires Prisma');
          return new ProjectSummaryReadyEventUseCase(new PrismaSummaryReadyProjectionStore(prisma), fanout);
        }
        return new ProjectSummaryReadyEventUseCase(new InMemorySummaryReadyProjectionStore(events), fanout);
      },
      inject: [DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_REALTIME_EVENT_REPOSITORY, DELIVERY_REALTIME_FANOUT],
    },
];
