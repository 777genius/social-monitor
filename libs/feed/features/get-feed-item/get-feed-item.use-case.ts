import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { CohortBaselineFeedSignalNormalizer } from '../../domain';
import type { FeedItemReadRepositoryPort, FeedSignalBaselineRepositoryPort } from '../../ports';
import { loadFeedSignalBaselineSamples } from '../shared/feed-signal-baseline-loader';
import { presentFeedItem } from '../shared/feed-item-presenter';
import type { GetFeedItemQuery } from './get-feed-item.query';
import type { GetFeedItemResult } from './get-feed-item.result';

type GetFeedItemFailure = DomainError;

export class GetFeedItemUseCase {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly signalBaseline: FeedSignalBaselineRepositoryPort,
    private readonly clock: Clock,
    private readonly signalNormalizer = new CohortBaselineFeedSignalNormalizer(),
  ) {}

  async execute(query: GetFeedItemQuery): Promise<Result<GetFeedItemResult, GetFeedItemFailure>> {
    if (query.feedItemId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Feed item id must be non-empty'));
    }

    const now = this.clock.now();
    const item = await this.feedItems.findById(query);

    if (item === null) {
      return err(new DomainError('resource.not_found', 'Feed item not found', { feedItemId: query.feedItemId }));
    }

    const snapshot = item.toSnapshot();
    const baselineSamples = await loadFeedSignalBaselineSamples({
      signalBaseline: this.signalBaseline,
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      interestId: snapshot.interestId,
      items: [item],
      now,
    });
    const signalById = this.signalNormalizer.normalize({
      items: [item],
      baselineSamples,
      now,
    });

    return ok(presentFeedItem(item, signalById.get(snapshot.id)));
  }
}
