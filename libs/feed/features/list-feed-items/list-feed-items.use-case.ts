import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { FeedItemReadRepositoryPort } from '../../ports';
import type { ListFeedItemsUseCaseQuery } from './list-feed-items.query';
import type { ListFeedItemsUseCaseResult } from './list-feed-items.result';

type ListFeedItemsFailure = DomainError | Error;

const MAX_LIMIT = 100;
const MAX_SEARCH_QUERY_LENGTH = 200;

export class ListFeedItemsUseCase {
  constructor(private readonly feedItems: FeedItemReadRepositoryPort) {}

  async execute(
    query: ListFeedItemsUseCaseQuery,
  ): Promise<Result<ListFeedItemsUseCaseResult, ListFeedItemsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT) {
      return err(new DomainError('validation.failed', 'Feed page limit must be between 1 and 100', {
        limit: query.limit,
      }));
    }

    if (query.searchQuery !== undefined && query.searchQuery.trim().length > MAX_SEARCH_QUERY_LENGTH) {
      return err(new DomainError('validation.failed', 'Feed search query is too long', {
        maxLength: MAX_SEARCH_QUERY_LENGTH,
      }));
    }

    const result = await this.feedItems.list(query);

    return ok({
      items: result.items.map((item) => {
        const snapshot = item.toSnapshot();

        return {
          id: snapshot.id,
          topicId: snapshot.topicId,
          sourceItemId: snapshot.sourceItemId,
          sourceBindingId: snapshot.sourceBindingId,
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview: snapshot.bodyPreview,
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt.toISOString(),
          observedAt: snapshot.observedAt.toISOString(),
        };
      }),
      nextCursor: result.nextCursor,
    });
  }
}
