import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import { CohortBaselineFeedSignalNormalizer } from '../../domain';
import type { FeedItemReadRepositoryPort, FeedSignalBaselineRepositoryPort } from '../../ports';
import { presentFeedItem } from '../shared/feed-item-presenter';
import type { GetFeedItemQuery } from './get-feed-item.query';
import type { GetFeedItemResult } from './get-feed-item.result';

type GetFeedItemFailure = DomainError;
const MAX_HISTORICAL_BASELINE_ITEMS = 2000;
const HISTORICAL_BASELINE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
    const baselineSamples = await this.signalBaseline.listSamples({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: snapshot.topicId,
      observedAfter: new Date(now.getTime() - HISTORICAL_BASELINE_WINDOW_MS),
      limit: MAX_HISTORICAL_BASELINE_ITEMS,
    });
    const signalById = this.signalNormalizer.normalize({
      items: [item],
      baselineSamples,
      now,
    });

    return ok(presentFeedItem(item, signalById.get(snapshot.id)));
  }
}
