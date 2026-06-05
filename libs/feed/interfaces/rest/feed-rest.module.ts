import { Module } from '@nestjs/common';

import { InMemoryFeedItemReadRepository } from '../../adapters/persistence/in-memory-feed-item-read.repository';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import { FeedController } from './feed.controller';

@Module({
  controllers: [FeedController],
  providers: [
    InMemoryFeedItemReadRepository,
    {
      provide: ListFeedItemsUseCase,
      useFactory: (feedItems: InMemoryFeedItemReadRepository) => new ListFeedItemsUseCase(feedItems),
      inject: [InMemoryFeedItemReadRepository],
    },
  ],
  exports: [InMemoryFeedItemReadRepository],
})
export class FeedRestModule {}
