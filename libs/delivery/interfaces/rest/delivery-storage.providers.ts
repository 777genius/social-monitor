import type { Provider } from '@nestjs/common';
import { InMemoryDeliveryAttemptRepository } from '../../adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestScheduleRepository } from '../../adapters/persistence/in-memory-digest-schedule.repository';
import { InMemoryDigestRepository } from '../../adapters/persistence/in-memory-digest.repository';
import { InMemoryRealtimeEventRepository } from '../../adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryWebhookEndpointRepository } from '../../adapters/persistence/in-memory-webhook-endpoint.repository';
import { PrismaDeliveryAttemptRepository } from '../../adapters/persistence/prisma/prisma-delivery-attempt.repository';
import type { PrismaDeliveryClient } from '../../adapters/persistence/prisma/prisma-delivery-client';
import { PrismaDigestScheduleRepository } from '../../adapters/persistence/prisma/prisma-digest-schedule.repository';
import { PrismaDigestRepository } from '../../adapters/persistence/prisma/prisma-digest.repository';
import { PrismaRealtimeEventRepository } from '../../adapters/persistence/prisma/prisma-realtime-event.repository';
import { PrismaWebhookEndpointRepository } from '../../adapters/persistence/prisma/prisma-webhook-endpoint.repository';
import { InMemoryNotificationPreferenceReader } from '../../adapters/preferences/in-memory-notification-preference.reader';
import { PrismaNotificationPreferenceReader } from '../../adapters/preferences/prisma/prisma-notification-preference.reader';
import { InMemoryWebhookReplayStore } from '../../adapters/replay/in-memory-webhook-replay.store';
import { PrismaWebhookReplayStore } from '../../adapters/replay/prisma/prisma-webhook-replay.store';
import { InMemoryWebhookSecretVault } from '../../adapters/secrets/in-memory-webhook-secret.vault';
import { PrismaWebhookSecretVault, resolveWebhookSecretEncryptionKey } from '../../adapters/secrets/prisma/prisma-webhook-secret.vault';
import { InMemoryDigestSourceReader } from '../../adapters/source/in-memory-digest-source.reader';
import { PrismaDigestSourceReader } from '../../adapters/source/prisma/prisma-digest-source.reader';
import { DELIVERY_ATTEMPT_REPOSITORY, DELIVERY_DIGEST_REPOSITORY, DELIVERY_DIGEST_SCHEDULE_REPOSITORY, DELIVERY_DIGEST_SOURCE_READER, DELIVERY_NOTIFICATION_PREFERENCE_MANAGER, DELIVERY_NOTIFICATION_PREFERENCE_READER, DELIVERY_PERSISTENCE_MODE, DELIVERY_PRISMA_CLIENT, DELIVERY_REALTIME_EVENT_REPOSITORY, DELIVERY_WEBHOOK_ENDPOINT_REPOSITORY, DELIVERY_WEBHOOK_REPLAY_STORE, DELIVERY_WEBHOOK_SECRET_VAULT, type DeliveryPersistenceMode } from './delivery-provider-tokens';
import type { DeliveryAttemptRepositoryPort, DigestRepositoryPort, DigestScheduleRepositoryPort, DigestSourceReaderPort, NotificationPreferenceManagementPort, NotificationPreferenceReaderPort, RealtimeEventRepositoryPort, WebhookEndpointRepositoryPort, WebhookReplayStorePort, WebhookSecretVaultPort } from '../../ports';

export const deliveryStorageProviders: Provider[] = [
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
];

const requirePrismaDeliveryClient = (client: PrismaDeliveryClient | null): PrismaDeliveryClient => {
  if (client === null) {
    throw new Error('Prisma delivery client is required when DELIVERY_PERSISTENCE=prisma');
  }

  return client;
};
