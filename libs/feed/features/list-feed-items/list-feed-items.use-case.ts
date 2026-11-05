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
import type { FeedItemListEntry } from './list-feed-items.result';

type ListFeedItemsFailure = DomainError;

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
    const listSignalCandidates = this.feedItems.listSignalCandidates;
    const cursorOffset = listSignalCandidates === undefined
      ? 0
      : parseSignalCursor(query.cursor);
    if (cursorOffset instanceof DomainError) {
      return err(cursorOffset);
    }
    const signalCandidates = listSignalCandidates === undefined
      ? undefined
      : await listSignalCandidates.call(this.feedItems, query);
    const result = signalCandidates === undefined
      ? await this.feedItems.list(query)
      : { items: signalCandidates };
    const baselineSamples = await loadFeedSignalBaselineSamples({
      signalBaseline: this.signalBaseline,
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      interestId: query.interestId,
      items: result.items,
      now,
    });
    const signalById = this.signalNormalizer.normalize({
      items: result.items,
      baselineSamples,
      now,
    });

    const presentedItems = result.items.map((item) =>
      presentFeedItem(item, signalById.get(item.toSnapshot().id)),
    );
    const rankedPage = signalCandidates === undefined
      ? { items: presentedItems, nextCursor: result.nextCursor }
      : paginateSignalCandidates(presentedItems, cursorOffset, query.limit);

    return ok({
      items: rankedPage.items,
      nextCursor: rankedPage.nextCursor,
      sourceBreakdown: buildFeedSourceBreakdown(rankedPage.items),
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

const paginateSignalCandidates = (
  items: readonly FeedItemListEntry[],
  offset: number,
  limit: number,
): { readonly items: readonly FeedItemListEntry[]; readonly nextCursor?: string } => {
  const ranked = [...items].sort(compareNormalizedFeedItems);
  const page = ranked.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    nextCursor: nextOffset < ranked.length
      ? encodeSignalCursor(nextOffset)
      : undefined,
  };
};

const compareNormalizedFeedItems = (
  left: FeedItemListEntry,
  right: FeedItemListEntry,
): number =>
  (right.normalizedSignal?.score ?? 0) -
    (left.normalizedSignal?.score ?? 0) ||
  right.publishedAt.localeCompare(left.publishedAt, 'en-US') ||
  right.id.localeCompare(left.id, 'en-US');

const encodeSignalCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseSignalCursor = (cursor: string | undefined): number | DomainError => {
  if (cursor === undefined) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      readonly offset?: unknown;
    };
    if (Number.isSafeInteger(value.offset) && (value.offset as number) >= 0) {
      return value.offset as number;
    }
  } catch { /* Invalid encoded cursors are returned as typed failures below. */ }
  return new DomainError('validation.failed', 'Feed item cursor is invalid');
};
