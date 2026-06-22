import { Module } from '@nestjs/common';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryRelevanceFeedbackRepository } from '../../adapters/persistence/in-memory-relevance-feedback.repository';
import { InMemoryUserRelevanceProfileRepository } from '../../adapters/persistence/in-memory-user-relevance-profile.repository';
import type { PrismaRelevanceClient } from '../../adapters/persistence/prisma/prisma-relevance-client';
import { PrismaRelevanceConnection } from '../../adapters/persistence/prisma/prisma-relevance-connection';
import { PrismaRelevanceFeedbackRepository } from '../../adapters/persistence/prisma/prisma-relevance-feedback.repository';
import { PrismaUserRelevanceProfileRepository } from '../../adapters/persistence/prisma/prisma-user-relevance-profile.repository';
import { BuildPersonalizedDigestUseCase } from '../../features/build-personalized-digest/build-personalized-digest.use-case';
import { RankFeedItemsUseCase } from '../../features/rank-feed-items/rank-feed-items.use-case';
import { RecordRelevanceFeedbackUseCase } from '../../features/record-relevance-feedback/record-relevance-feedback.use-case';
import { UpsertUserRelevanceProfileUseCase } from '../../features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case';
import type {
  RelevanceFeedbackRepositoryPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';
import {
  RELEVANCE_FEEDBACK_REPOSITORY,
  USER_RELEVANCE_PROFILE_REPOSITORY,
} from '../../ports';
import { RelevanceController } from './relevance.controller';
import {
  RELEVANCE_PERSISTENCE_MODE,
  RELEVANCE_PRISMA_CLIENT,
  relevancePersistenceModeProvider,
  type RelevancePersistenceMode,
} from './relevance-provider-tokens';

@Module({
  imports: [FeedRestModule, IdentityRestModule],
  controllers: [RelevanceController],
  providers: [
    relevancePersistenceModeProvider,
    {
      provide: RELEVANCE_PRISMA_CLIENT,
      useFactory: (mode: RelevancePersistenceMode): PrismaRelevanceClient | null =>
        mode === 'prisma' ? new PrismaRelevanceConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [RELEVANCE_PERSISTENCE_MODE],
    },
    InMemoryUserRelevanceProfileRepository,
    InMemoryRelevanceFeedbackRepository,
    {
      provide: USER_RELEVANCE_PROFILE_REPOSITORY,
      useFactory: (
        mode: RelevancePersistenceMode,
        prisma: PrismaRelevanceClient | null,
        inMemoryProfiles: InMemoryUserRelevanceProfileRepository,
      ): UserRelevanceProfileRepositoryPort =>
        mode === 'prisma'
          ? new PrismaUserRelevanceProfileRepository(requirePrismaRelevanceClient(prisma))
          : inMemoryProfiles,
      inject: [RELEVANCE_PERSISTENCE_MODE, RELEVANCE_PRISMA_CLIENT, InMemoryUserRelevanceProfileRepository],
    },
    {
      provide: RELEVANCE_FEEDBACK_REPOSITORY,
      useFactory: (
        mode: RelevancePersistenceMode,
        prisma: PrismaRelevanceClient | null,
        inMemoryFeedback: InMemoryRelevanceFeedbackRepository,
      ): RelevanceFeedbackRepositoryPort =>
        mode === 'prisma'
          ? new PrismaRelevanceFeedbackRepository(requirePrismaRelevanceClient(prisma))
          : inMemoryFeedback,
      inject: [RELEVANCE_PERSISTENCE_MODE, RELEVANCE_PRISMA_CLIENT, InMemoryRelevanceFeedbackRepository],
    },
    {
      provide: UpsertUserRelevanceProfileUseCase,
      useFactory: (profiles: UserRelevanceProfileRepositoryPort) =>
        new UpsertUserRelevanceProfileUseCase(profiles, new CryptoIdGenerator(), new SystemClock()),
      inject: [USER_RELEVANCE_PROFILE_REPOSITORY],
    },
    {
      provide: RankFeedItemsUseCase,
      useFactory: (
        feedItems: FeedItemReadRepositoryPort,
        profiles: UserRelevanceProfileRepositoryPort,
      ) => new RankFeedItemsUseCase(feedItems, profiles, new SystemClock()),
      inject: [FEED_ITEM_READ_REPOSITORY, USER_RELEVANCE_PROFILE_REPOSITORY],
    },
    {
      provide: RecordRelevanceFeedbackUseCase,
      useFactory: (
        profiles: UserRelevanceProfileRepositoryPort,
        feedback: RelevanceFeedbackRepositoryPort,
      ) => new RecordRelevanceFeedbackUseCase(profiles, feedback, new CryptoIdGenerator(), new SystemClock()),
      inject: [USER_RELEVANCE_PROFILE_REPOSITORY, RELEVANCE_FEEDBACK_REPOSITORY],
    },
    {
      provide: BuildPersonalizedDigestUseCase,
      useFactory: (rankFeedItems: RankFeedItemsUseCase) => new BuildPersonalizedDigestUseCase(rankFeedItems),
      inject: [RankFeedItemsUseCase],
    },
  ],
  exports: [
    BuildPersonalizedDigestUseCase,
    RankFeedItemsUseCase,
    RecordRelevanceFeedbackUseCase,
    UpsertUserRelevanceProfileUseCase,
    USER_RELEVANCE_PROFILE_REPOSITORY,
    RELEVANCE_FEEDBACK_REPOSITORY,
    InMemoryUserRelevanceProfileRepository,
    InMemoryRelevanceFeedbackRepository,
  ],
})
export class RelevanceRestModule {}

const requirePrismaRelevanceClient = (client: PrismaRelevanceClient | null): PrismaRelevanceClient => {
  if (client === null) {
    throw new Error('Prisma relevance client is required when RELEVANCE_PERSISTENCE=prisma');
  }

  return client;
};
