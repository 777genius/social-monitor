import { Module } from '@nestjs/common';

import { InMemoryFeedItemReadRepository } from '../../adapters/persistence/in-memory-feed-item-read.repository';
import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
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
    {
      provide: GetFeedItemUseCase,
      useFactory: (feedItems: InMemoryFeedItemReadRepository) => new GetFeedItemUseCase(feedItems),
      inject: [InMemoryFeedItemReadRepository],
    },
  ],
  exports: [InMemoryFeedItemReadRepository],
})
export class FeedRestModule {}
