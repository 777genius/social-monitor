import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { MemoStackUserSummaryPreferenceMemoryProjector } from '@social-monitor/summary/adapters/memory/memo-stack-user-summary-preference-memory.projector';
import { resolveMemoStackSummaryMemoryOptions } from '@social-monitor/summary/adapters/memory/memo-stack-summary-memory.adapter';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemorySourceTargetRepository } from '../../adapters/persistence/in-memory-source-target.repository';
import { InMemoryUserSubscriptionRepository } from '../../adapters/persistence/in-memory-user-subscription.repository';
import { InMemoryUserSubscriptionScheduleRepository } from '../../adapters/persistence/in-memory-user-subscription-schedule.repository';
import { InMemoryUserSummaryPreferenceRepository } from '../../adapters/persistence/in-memory-user-summary-preference.repository';
import type { PrismaSubscriptionsClient } from '../../adapters/persistence/prisma/prisma-subscriptions-client';
import { PrismaSubscriptionsConnection } from '../../adapters/persistence/prisma/prisma-subscriptions-connection';
import { PrismaSourceTargetRepository } from '../../adapters/persistence/prisma/prisma-source-target.repository';
import { PrismaUserSubscriptionRepository } from '../../adapters/persistence/prisma/prisma-user-subscription.repository';
import { PrismaUserSubscriptionScheduleRepository } from '../../adapters/persistence/prisma/prisma-user-subscription-schedule.repository';
import { PrismaUserSummaryPreferenceRepository } from '../../adapters/persistence/prisma/prisma-user-summary-preference.repository';
import { StaticSourceTargetCatalogAdapter } from '../../adapters/target-catalog/static-source-target-catalog.adapter';
import { CreateUserSubscriptionUseCase } from '../../features/create-user-subscription/create-user-subscription.use-case';
import { ListUserSubscriptionsUseCase } from '../../features/list-user-subscriptions/list-user-subscriptions.use-case';
import { UpsertUserSummaryPreferenceUseCase } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.use-case';
import {
  NOOP_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
  type SourceTargetCatalogPort,
  type SourceTargetRepositoryPort,
  type UserSubscriptionRepositoryPort,
  type UserSubscriptionScheduleRepositoryPort,
  type UserSummaryPreferenceMemoryProjectorPort,
  type UserSummaryPreferenceRepositoryPort,
} from '../../ports';
import {
  SUBSCRIPTIONS_PERSISTENCE_MODE,
  SUBSCRIPTIONS_PRISMA_CLIENT,
  SUBSCRIPTIONS_SOURCE_TARGET_CATALOG,
  SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY,
  SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
  SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY,
  SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
  SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
  type SubscriptionsPersistenceMode,
  subscriptionsPersistenceModeProvider,
} from './subscriptions-provider-tokens';
import { UserSummaryPreferencesController } from './user-summary-preferences.controller';
import { UserSubscriptionsController } from './user-subscriptions.controller';

@Module({
  imports: [IdentityRestModule],
  controllers: [UserSubscriptionsController, UserSummaryPreferencesController],
  providers: [
    subscriptionsPersistenceModeProvider,
    {
      provide: SUBSCRIPTIONS_PRISMA_CLIENT,
      useFactory: (mode: SubscriptionsPersistenceMode): PrismaSubscriptionsClient | null =>
        mode === 'prisma' ? new PrismaSubscriptionsConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [SUBSCRIPTIONS_PERSISTENCE_MODE],
    },
    InMemorySourceTargetRepository,
    InMemoryUserSubscriptionRepository,
    InMemoryUserSubscriptionScheduleRepository,
    InMemoryUserSummaryPreferenceRepository,
    StaticSourceTargetCatalogAdapter,
    {
      provide: SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY,
      useFactory: (
        mode: SubscriptionsPersistenceMode,
        prisma: PrismaSubscriptionsClient | null,
        inMemoryTargets: InMemorySourceTargetRepository,
      ): SourceTargetRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSourceTargetRepository(requirePrismaSubscriptionsClient(prisma))
          : inMemoryTargets,
      inject: [SUBSCRIPTIONS_PERSISTENCE_MODE, SUBSCRIPTIONS_PRISMA_CLIENT, InMemorySourceTargetRepository],
    },
    {
      provide: SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
      useFactory: (
        mode: SubscriptionsPersistenceMode,
        prisma: PrismaSubscriptionsClient | null,
        inMemorySubscriptions: InMemoryUserSubscriptionRepository,
      ): UserSubscriptionRepositoryPort =>
        mode === 'prisma'
          ? new PrismaUserSubscriptionRepository(requirePrismaSubscriptionsClient(prisma))
          : inMemorySubscriptions,
      inject: [SUBSCRIPTIONS_PERSISTENCE_MODE, SUBSCRIPTIONS_PRISMA_CLIENT, InMemoryUserSubscriptionRepository],
    },
    {
      provide: SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY,
      useFactory: (
        mode: SubscriptionsPersistenceMode,
        prisma: PrismaSubscriptionsClient | null,
        inMemorySchedules: InMemoryUserSubscriptionScheduleRepository,
      ): UserSubscriptionScheduleRepositoryPort =>
        mode === 'prisma'
          ? new PrismaUserSubscriptionScheduleRepository(requirePrismaSubscriptionsClient(prisma))
          : inMemorySchedules,
      inject: [
        SUBSCRIPTIONS_PERSISTENCE_MODE,
        SUBSCRIPTIONS_PRISMA_CLIENT,
        InMemoryUserSubscriptionScheduleRepository,
      ],
    },
    {
      provide: SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
      useFactory: (
        mode: SubscriptionsPersistenceMode,
        prisma: PrismaSubscriptionsClient | null,
        inMemoryPreferences: InMemoryUserSummaryPreferenceRepository,
      ): UserSummaryPreferenceRepositoryPort =>
        mode === 'prisma'
          ? new PrismaUserSummaryPreferenceRepository(requirePrismaSubscriptionsClient(prisma))
          : inMemoryPreferences,
      inject: [SUBSCRIPTIONS_PERSISTENCE_MODE, SUBSCRIPTIONS_PRISMA_CLIENT, InMemoryUserSummaryPreferenceRepository],
    },
    {
      provide: SUBSCRIPTIONS_SOURCE_TARGET_CATALOG,
      useExisting: StaticSourceTargetCatalogAdapter,
    },
    {
      provide: SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
      useFactory: (): UserSummaryPreferenceMemoryProjectorPort =>
        process.env.SUMMARY_MEMORY_MODE === 'memo-stack'
          ? new MemoStackUserSummaryPreferenceMemoryProjector(resolveMemoStackSummaryMemoryOptions(process.env))
          : NOOP_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
    },
    {
      provide: CreateUserSubscriptionUseCase,
      useFactory: (
        targets: SourceTargetRepositoryPort,
        subscriptions: UserSubscriptionRepositoryPort,
        schedules: UserSubscriptionScheduleRepositoryPort,
        preferences: UserSummaryPreferenceRepositoryPort,
        catalog: SourceTargetCatalogPort,
      ) =>
        new CreateUserSubscriptionUseCase(
          targets,
          subscriptions,
          schedules,
          preferences,
          catalog,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY,
        SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
        SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY,
        SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
        SUBSCRIPTIONS_SOURCE_TARGET_CATALOG,
      ],
    },
    {
      provide: ListUserSubscriptionsUseCase,
      useFactory: (
        targets: SourceTargetRepositoryPort,
        subscriptions: UserSubscriptionRepositoryPort,
        schedules: UserSubscriptionScheduleRepositoryPort,
        preferences: UserSummaryPreferenceRepositoryPort,
      ) => new ListUserSubscriptionsUseCase(targets, subscriptions, schedules, preferences),
      inject: [
        SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY,
        SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
        SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY,
        SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
      ],
    },
    {
      provide: UpsertUserSummaryPreferenceUseCase,
      useFactory: (
        subscriptions: UserSubscriptionRepositoryPort,
        preferences: UserSummaryPreferenceRepositoryPort,
        memoryProjector: UserSummaryPreferenceMemoryProjectorPort,
      ) =>
        new UpsertUserSummaryPreferenceUseCase(
          subscriptions,
          preferences,
          new CryptoIdGenerator(),
          new SystemClock(),
          memoryProjector,
        ),
      inject: [
        SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
        SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
        SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
      ],
    },
  ],
  exports: [
    CreateUserSubscriptionUseCase,
    InMemorySourceTargetRepository,
    InMemoryUserSubscriptionRepository,
    InMemoryUserSubscriptionScheduleRepository,
    InMemoryUserSummaryPreferenceRepository,
    ListUserSubscriptionsUseCase,
    SUBSCRIPTIONS_SOURCE_TARGET_REPOSITORY,
    SUBSCRIPTIONS_USER_SUBSCRIPTION_REPOSITORY,
    SUBSCRIPTIONS_USER_SUBSCRIPTION_SCHEDULE_REPOSITORY,
    SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR,
    SUBSCRIPTIONS_USER_SUMMARY_PREFERENCE_REPOSITORY,
    UpsertUserSummaryPreferenceUseCase,
  ],
})
export class SubscriptionsRestModule {}

const requirePrismaSubscriptionsClient = (
  client: PrismaSubscriptionsClient | null,
): PrismaSubscriptionsClient => {
  if (client === null) {
    throw new Error('Prisma subscriptions client is required when SUBSCRIPTIONS_PERSISTENCE=prisma');
  }

  return client;
};
