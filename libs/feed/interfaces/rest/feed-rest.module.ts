import { Module } from '@nestjs/common';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { SystemClock } from '@social-monitor/shared-kernel';

import { InMemoryFeedItemReadRepository } from '../../adapters/persistence/in-memory-feed-item-read.repository';
import { PrismaFeedConnection } from '../../adapters/persistence/prisma/prisma-feed-connection';
import type { PrismaFeedClient } from '../../adapters/persistence/prisma/prisma-feed-client';
import { PrismaFeedItemReadRepository } from '../../adapters/persistence/prisma/prisma-feed-item-read.repository';
import { PrismaFeedSignalBaselineRepository } from '../../adapters/persistence/prisma/prisma-feed-signal-baseline.repository';
import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import {
  FEED_ITEM_READ_REPOSITORY,
  FEED_SIGNAL_BASELINE_REPOSITORY,
  type FeedItemReadRepositoryPort,
  type FeedSignalBaselineRepositoryPort,
} from '../../ports';
import {
  FEED_PERSISTENCE_MODE,
  FEED_PRISMA_CLIENT,
  feedPersistenceModeProvider,
  type FeedPersistenceMode,
} from './feed-provider-tokens';
import { FeedController } from './feed.controller';

@Module({
  imports: [IdentityRestModule],
  controllers: [FeedController],
  providers: [
    feedPersistenceModeProvider,
    {
      provide: FEED_PRISMA_CLIENT,
      useFactory: async (
        mode: FeedPersistenceMode,
      ): Promise<PrismaFeedClient | null> =>
        mode === 'prisma'
          ? PrismaFeedConnection.create(
              resolvePostgresRuntimePoolConfig(process.env),
            )
          : null,
      inject: [FEED_PERSISTENCE_MODE],
    },
    InMemoryFeedItemReadRepository,
    {
      provide: FEED_ITEM_READ_REPOSITORY,
      useFactory: (
        mode: FeedPersistenceMode,
        prisma: PrismaFeedClient | null,
        inMemoryFeedItems: InMemoryFeedItemReadRepository,
      ): FeedItemReadRepositoryPort =>
        mode === 'prisma'
          ? new PrismaFeedItemReadRepository(requirePrismaFeedClient(prisma))
          : inMemoryFeedItems,
      inject: [FEED_PERSISTENCE_MODE, FEED_PRISMA_CLIENT, InMemoryFeedItemReadRepository],
    },
    {
      provide: FEED_SIGNAL_BASELINE_REPOSITORY,
      useFactory: (
        mode: FeedPersistenceMode,
        prisma: PrismaFeedClient | null,
        inMemoryFeedItems: InMemoryFeedItemReadRepository,
      ): FeedSignalBaselineRepositoryPort =>
        mode === 'prisma'
          ? new PrismaFeedSignalBaselineRepository(requirePrismaFeedClient(prisma))
          : inMemoryFeedItems,
      inject: [FEED_PERSISTENCE_MODE, FEED_PRISMA_CLIENT, InMemoryFeedItemReadRepository],
    },
    {
      provide: ListFeedItemsUseCase,
      useFactory: (
        feedItems: FeedItemReadRepositoryPort,
        signalBaseline: FeedSignalBaselineRepositoryPort,
      ) => new ListFeedItemsUseCase(feedItems, signalBaseline, new SystemClock()),
      inject: [FEED_ITEM_READ_REPOSITORY, FEED_SIGNAL_BASELINE_REPOSITORY],
    },
    {
      provide: GetFeedItemUseCase,
      useFactory: (
        feedItems: FeedItemReadRepositoryPort,
        signalBaseline: FeedSignalBaselineRepositoryPort,
      ) => new GetFeedItemUseCase(feedItems, signalBaseline, new SystemClock()),
      inject: [FEED_ITEM_READ_REPOSITORY, FEED_SIGNAL_BASELINE_REPOSITORY],
    },
  ],
  exports: [FEED_ITEM_READ_REPOSITORY, FEED_SIGNAL_BASELINE_REPOSITORY, InMemoryFeedItemReadRepository],
})
export class FeedRestModule {}

const requirePrismaFeedClient = (client: PrismaFeedClient | null): PrismaFeedClient => {
  if (client === null) {
    throw new Error('Prisma feed client is required when FEED_PERSISTENCE=prisma');
  }

  return client;
};
