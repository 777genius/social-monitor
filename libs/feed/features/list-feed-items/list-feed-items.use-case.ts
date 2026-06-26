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
import { buildFeedSourceBreakdown } from '../shared/feed-source-breakdown-presenter';
import type { ListFeedItemsUseCaseQuery } from './list-feed-items.query';
import type { ListFeedItemsUseCaseResult } from './list-feed-items.result';

type ListFeedItemsFailure = DomainError | Error;

const MAX_LIMIT = 100;
const MAX_SEARCH_QUERY_LENGTH = 200;
const MAX_FILTER_VALUE_LENGTH = 80;
const REPOSITORY_TREND_WINDOWS = new Set(['24h', '48h', '7d', '30d', '90d']);

export class ListFeedItemsUseCase {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly signalBaseline: FeedSignalBaselineRepositoryPort,
    private readonly clock: Clock,
    private readonly signalNormalizer = new CohortBaselineFeedSignalNormalizer(),
  ) {}

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

    const invalidFilter = validateListFilter(query);

    if (invalidFilter !== undefined) {
      return err(invalidFilter);
    }

    const now = this.clock.now();
    const result = await this.feedItems.list(query);
    const baselineSamples = await loadFeedSignalBaselineSamples({
      signalBaseline: this.signalBaseline,
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      topicId: query.topicId,
      items: result.items,
      now,
    });
    const signalById = this.signalNormalizer.normalize({
      items: result.items,
      baselineSamples,
      now,
    });

    const items = result.items.map((item) =>
      presentFeedItem(item, signalById.get(item.toSnapshot().id)),
    );

    return ok({
      items,
      nextCursor: result.nextCursor,
      sourceBreakdown: buildFeedSourceBreakdown(items),
    });
  }
}

const validateListFilter = (query: ListFeedItemsUseCaseQuery): DomainError | undefined => {
  for (const [field, value] of [
    ['providerKey', query.providerKey],
    ['repositoryLanguage', query.repositoryLanguage],
    ['repositoryTopic', query.repositoryTopic],
  ] as const) {
    if (value !== undefined && value.trim().length > MAX_FILTER_VALUE_LENGTH) {
      return new DomainError('validation.failed', `Feed ${field} filter is too long`, {
        field,
        maxLength: MAX_FILTER_VALUE_LENGTH,
      });
    }
  }

  if (
    query.repositoryTrendWindow !== undefined &&
    !REPOSITORY_TREND_WINDOWS.has(query.repositoryTrendWindow.trim())
  ) {
    return new DomainError('validation.failed', 'Feed repository trend window filter is invalid', {
      allowedValues: [...REPOSITORY_TREND_WINDOWS],
    });
  }

  return undefined;
};
