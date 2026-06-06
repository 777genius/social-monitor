import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { FeedItemReadRepositoryPort } from '../../ports';
import type { GetFeedItemQuery } from './get-feed-item.query';
import type { GetFeedItemResult } from './get-feed-item.result';

type GetFeedItemFailure = DomainError;

export class GetFeedItemUseCase {
  constructor(private readonly feedItems: FeedItemReadRepositoryPort) {}

  async execute(query: GetFeedItemQuery): Promise<Result<GetFeedItemResult, GetFeedItemFailure>> {
    if (query.feedItemId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Feed item id must be non-empty'));
    }

    const item = await this.feedItems.findById(query);

    if (item === null) {
      return err(new DomainError('resource.not_found', 'Feed item not found', { feedItemId: query.feedItemId }));
    }

    const snapshot = item.toSnapshot();

    return ok({
      id: snapshot.id,
      sourceItemId: snapshot.sourceItemId,
      sourceBindingId: snapshot.sourceBindingId,
      canonicalUrl: snapshot.canonicalUrl,
      title: snapshot.title,
      bodyPreview: snapshot.bodyPreview,
      authorHandle: snapshot.authorHandle,
      publishedAt: snapshot.publishedAt.toISOString(),
      observedAt: snapshot.observedAt.toISOString(),
    });
  }
}
