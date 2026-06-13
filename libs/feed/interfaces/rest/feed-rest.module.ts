import { Module } from '@nestjs/common';
import { IdentityAuthorizationModule } from '@social-monitor/identity/interfaces/authorization/identity-authorization.module';

import { InMemoryFeedItemReadRepository } from '../../adapters/persistence/in-memory-feed-item-read.repository';
import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import { FEED_ITEM_READ_REPOSITORY } from '../../ports';
import { FeedController } from './feed.controller';

@Module({
  imports: [IdentityAuthorizationModule],
  controllers: [FeedController],
  providers: [
    InMemoryFeedItemReadRepository,
    {
      provide: FEED_ITEM_READ_REPOSITORY,
      useExisting: InMemoryFeedItemReadRepository,
    },
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
  exports: [FEED_ITEM_READ_REPOSITORY, InMemoryFeedItemReadRepository],
})
export class FeedRestModule {}
