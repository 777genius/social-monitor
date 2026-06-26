import { Module } from '@nestjs/common';
import { FeedRestModule } from '@social-monitor/feed/interfaces/rest/feed-rest.module';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import {
  MemoStackRelevanceMemoryGuidanceReader,
  resolveMemoStackRelevanceMemoryGuidanceReaderOptions,
} from '../../adapters/memory/memo-stack-relevance-memory-guidance.reader';
import {
  MemoStackRelevanceMemoryProjector,
  resolveMemoStackRelevanceMemoryProjectorOptions,
} from '../../adapters/memory/memo-stack-relevance-memory.projector';
import { InMemoryRelevanceFeedbackLearningStore } from '../../adapters/persistence/in-memory-relevance-feedback-learning.store';
import { InMemoryRelevanceFeedbackRepository } from '../../adapters/persistence/in-memory-relevance-feedback.repository';
import { InMemoryRelevanceMemoryProjectionRepository } from '../../adapters/persistence/in-memory-relevance-memory-projection.repository';
import { InMemoryUserRelevanceProfileRepository } from '../../adapters/persistence/in-memory-user-relevance-profile.repository';
import type { PrismaRelevanceClient } from '../../adapters/persistence/prisma/prisma-relevance-client';
import { PrismaRelevanceConnection } from '../../adapters/persistence/prisma/prisma-relevance-connection';
import { PrismaRelevanceFeedbackLearningStore } from '../../adapters/persistence/prisma/prisma-relevance-feedback-learning.store';
import { PrismaRelevanceFeedbackRepository } from '../../adapters/persistence/prisma/prisma-relevance-feedback.repository';
import { PrismaRelevanceMemoryProjectionRepository } from '../../adapters/persistence/prisma/prisma-relevance-memory-projection.repository';
import { PrismaUserRelevanceProfileRepository } from '../../adapters/persistence/prisma/prisma-user-relevance-profile.repository';
import { BuildPersonalizedDigestUseCase } from '../../features/build-personalized-digest/build-personalized-digest.use-case';
import { ProjectRelevanceMemoryBatchUseCase } from '../../features/project-relevance-memory/project-relevance-memory-batch.use-case';
import { RankFeedItemsUseCase } from '../../features/rank-feed-items/rank-feed-items.use-case';
import { RecordRelevanceFeedbackUseCase } from '../../features/record-relevance-feedback/record-relevance-feedback.use-case';
import { UpsertUserRelevanceProfileUseCase } from '../../features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case';
import type {
  RelevanceFeedbackLearningStorePort,
  RelevanceFeedbackRepositoryPort,
  RelevanceMemoryGuidanceReaderPort,
  RelevanceMemoryProjectionRepositoryPort,
  RelevanceMemoryProjectorPort,
  UserRelevanceProfileRepositoryPort,
} from '../../ports';
import {
  NOOP_RELEVANCE_MEMORY_GUIDANCE_READER,
  NOOP_RELEVANCE_MEMORY_PROJECTOR,
  RELEVANCE_FEEDBACK_LEARNING_STORE,
  RELEVANCE_FEEDBACK_REPOSITORY,
  RELEVANCE_MEMORY_GUIDANCE_READER,
  RELEVANCE_MEMORY_PROJECTION_REPOSITORY,
  RELEVANCE_MEMORY_PROJECTOR,
  USER_RELEVANCE_PROFILE_REPOSITORY,
} from '../../ports';
import { RelevanceController } from './relevance.controller';
import {
  RELEVANCE_PERSISTENCE_MODE,
  RELEVANCE_MEMORY_PROJECTION_MODE,
  RELEVANCE_PRISMA_CLIENT,
  relevanceMemoryProjectionModeProvider,
  relevancePersistenceModeProvider,
  type RelevanceMemoryProjectionMode,
  type RelevancePersistenceMode,
} from './relevance-provider-tokens';

@Module({
  imports: [FeedRestModule, IdentityRestModule],
  controllers: [RelevanceController],
  providers: [
    relevancePersistenceModeProvider,
    relevanceMemoryProjectionModeProvider,
    {
      provide: RELEVANCE_PRISMA_CLIENT,
      useFactory: (mode: RelevancePersistenceMode): PrismaRelevanceClient | null =>
        mode === 'prisma' ? new PrismaRelevanceConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [RELEVANCE_PERSISTENCE_MODE],
    },
    InMemoryUserRelevanceProfileRepository,
    InMemoryRelevanceFeedbackRepository,
    InMemoryRelevanceMemoryProjectionRepository,
    {
      provide: RELEVANCE_FEEDBACK_LEARNING_STORE,
      useFactory: (
        mode: RelevancePersistenceMode,
        prisma: PrismaRelevanceClient | null,
        inMemoryProfiles: InMemoryUserRelevanceProfileRepository,
        inMemoryFeedback: InMemoryRelevanceFeedbackRepository,
        inMemoryProjections: InMemoryRelevanceMemoryProjectionRepository,
      ): RelevanceFeedbackLearningStorePort =>
        mode === 'prisma'
          ? new PrismaRelevanceFeedbackLearningStore(requirePrismaRelevanceClient(prisma))
          : new InMemoryRelevanceFeedbackLearningStore(inMemoryProfiles, inMemoryFeedback, inMemoryProjections),
      inject: [
        RELEVANCE_PERSISTENCE_MODE,
        RELEVANCE_PRISMA_CLIENT,
        InMemoryUserRelevanceProfileRepository,
        InMemoryRelevanceFeedbackRepository,
        InMemoryRelevanceMemoryProjectionRepository,
      ],
    },
    {
      provide: RELEVANCE_MEMORY_PROJECTION_REPOSITORY,
      useFactory: (
        mode: RelevancePersistenceMode,
        prisma: PrismaRelevanceClient | null,
        inMemoryProjections: InMemoryRelevanceMemoryProjectionRepository,
      ): RelevanceMemoryProjectionRepositoryPort =>
        mode === 'prisma'
          ? new PrismaRelevanceMemoryProjectionRepository(requirePrismaRelevanceClient(prisma))
          : inMemoryProjections,
      inject: [RELEVANCE_PERSISTENCE_MODE, RELEVANCE_PRISMA_CLIENT, InMemoryRelevanceMemoryProjectionRepository],
    },
    {
      provide: RELEVANCE_MEMORY_PROJECTOR,
      useFactory: (mode: RelevanceMemoryProjectionMode): RelevanceMemoryProjectorPort =>
        mode === 'memo-stack'
          ? new MemoStackRelevanceMemoryProjector(resolveMemoStackRelevanceMemoryProjectorOptions(process.env))
          : NOOP_RELEVANCE_MEMORY_PROJECTOR,
      inject: [RELEVANCE_MEMORY_PROJECTION_MODE],
    },
    {
      provide: RELEVANCE_MEMORY_GUIDANCE_READER,
      useFactory: (mode: RelevanceMemoryProjectionMode): RelevanceMemoryGuidanceReaderPort =>
        mode === 'memo-stack'
          ? new MemoStackRelevanceMemoryGuidanceReader(
              resolveMemoStackRelevanceMemoryGuidanceReaderOptions(process.env),
            )
          : NOOP_RELEVANCE_MEMORY_GUIDANCE_READER,
      inject: [RELEVANCE_MEMORY_PROJECTION_MODE],
    },
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
        memoryGuidance: RelevanceMemoryGuidanceReaderPort,
      ) => new RankFeedItemsUseCase(feedItems, profiles, new SystemClock(), undefined, memoryGuidance),
      inject: [FEED_ITEM_READ_REPOSITORY, USER_RELEVANCE_PROFILE_REPOSITORY, RELEVANCE_MEMORY_GUIDANCE_READER],
    },
    {
      provide: RecordRelevanceFeedbackUseCase,
      useFactory: (learning: RelevanceFeedbackLearningStorePort) =>
        new RecordRelevanceFeedbackUseCase(learning, new CryptoIdGenerator(), new SystemClock()),
      inject: [RELEVANCE_FEEDBACK_LEARNING_STORE],
    },
    {
      provide: ProjectRelevanceMemoryBatchUseCase,
      useFactory: (
        projections: RelevanceMemoryProjectionRepositoryPort,
        memory: RelevanceMemoryProjectorPort,
      ) => new ProjectRelevanceMemoryBatchUseCase(projections, memory, new SystemClock()),
      inject: [RELEVANCE_MEMORY_PROJECTION_REPOSITORY, RELEVANCE_MEMORY_PROJECTOR],
    },
    {
      provide: BuildPersonalizedDigestUseCase,
      useFactory: (rankFeedItems: RankFeedItemsUseCase) => new BuildPersonalizedDigestUseCase(rankFeedItems),
      inject: [RankFeedItemsUseCase],
    },
  ],
  exports: [
    BuildPersonalizedDigestUseCase,
    ProjectRelevanceMemoryBatchUseCase,
    RankFeedItemsUseCase,
    RecordRelevanceFeedbackUseCase,
    UpsertUserRelevanceProfileUseCase,
    USER_RELEVANCE_PROFILE_REPOSITORY,
    RELEVANCE_FEEDBACK_REPOSITORY,
    RELEVANCE_FEEDBACK_LEARNING_STORE,
    RELEVANCE_MEMORY_PROJECTION_REPOSITORY,
    RELEVANCE_MEMORY_PROJECTOR,
    RELEVANCE_MEMORY_GUIDANCE_READER,
    InMemoryUserRelevanceProfileRepository,
    InMemoryRelevanceFeedbackRepository,
    InMemoryRelevanceMemoryProjectionRepository,
  ],
})
export class RelevanceRestModule {}

const requirePrismaRelevanceClient = (client: PrismaRelevanceClient | null): PrismaRelevanceClient => {
  if (client === null) {
    throw new Error('Prisma relevance client is required when RELEVANCE_PERSISTENCE=prisma');
  }

  return client;
};
