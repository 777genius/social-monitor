import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';

import { InMemoryFeedItemReadRepository } from '../../adapters/persistence/in-memory-feed-item-read.repository';
import { PrismaFeedConnection } from '../../adapters/persistence/prisma/prisma-feed-connection';
import type { PrismaFeedClient } from '../../adapters/persistence/prisma/prisma-feed-client';
import { PrismaFeedItemReadRepository } from '../../adapters/persistence/prisma/prisma-feed-item-read.repository';
import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import { FEED_ITEM_READ_REPOSITORY, type FeedItemReadRepositoryPort } from '../../ports';
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
      useFactory: (mode: FeedPersistenceMode): PrismaFeedClient | null =>
        mode === 'prisma' ? new PrismaFeedConnection(process.env.DATABASE_URL ?? '') : null,
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
      provide: ListFeedItemsUseCase,
      useFactory: (feedItems: FeedItemReadRepositoryPort) => new ListFeedItemsUseCase(feedItems),
      inject: [FEED_ITEM_READ_REPOSITORY],
    },
    {
      provide: GetFeedItemUseCase,
      useFactory: (feedItems: FeedItemReadRepositoryPort) => new GetFeedItemUseCase(feedItems),
      inject: [FEED_ITEM_READ_REPOSITORY],
    },
  ],
  exports: [FEED_ITEM_READ_REPOSITORY, InMemoryFeedItemReadRepository],
})
export class FeedRestModule {}

const requirePrismaFeedClient = (client: PrismaFeedClient | null): PrismaFeedClient => {
  if (client === null) {
    throw new Error('Prisma feed client is required when FEED_PERSISTENCE=prisma');
  }

  return client;
};
