import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

import type { FeedItem } from '../../domain';
import type { ListFeedItemsQuery } from '../../ports';

export const requiresFeedItemScanFilter = (query: ListFeedItemsQuery): boolean =>
  hasSearch(query.searchQuery) ||
  hasFilter(query.repositoryTrendWindow) ||
  hasFilter(query.repositoryLanguage) ||
  hasFilter(query.repositoryTopic);

export const matchesFeedItemReadFilters = (item: FeedItem, query: ListFeedItemsQuery): boolean => {
  const snapshot = item.toSnapshot();

  if (query.providerKey !== undefined && snapshot.providerKey !== query.providerKey) {
    return false;
  }

  if (!matchesSearch(item, query.searchQuery)) {
    return false;
  }

  return matchesRepositoryTrendFilters(snapshot.providerMetadata, query);
};

const matchesSearch = (item: FeedItem, searchQuery: string | undefined): boolean => {
  if (!hasSearch(searchQuery)) {
    return true;
  }

  const normalizedQuery = normalizeSearchText(searchQuery);
  const snapshot = item.toSnapshot();
  const haystack = normalizeSearchText([
    snapshot.title,
    snapshot.bodyPreview,
    snapshot.canonicalUrl,
    snapshot.providerKey,
    snapshot.authorHandle ?? '',
  ].join(' '));

  return normalizedQuery
    .split(/\s+/u)
    .every((term) => haystack.includes(term));
};

const matchesRepositoryTrendFilters = (
  metadata: JsonObject | undefined,
  query: ListFeedItemsQuery,
): boolean => {
  if (
    !hasFilter(query.repositoryTrendWindow) &&
    !hasFilter(query.repositoryLanguage) &&
    !hasFilter(query.repositoryTopic)
  ) {
    return true;
  }

  const trendMetadata = readRepositoryTrendMetadata(metadata);

  if (trendMetadata === undefined) {
    return false;
  }

  if (
    hasFilter(query.repositoryTrendWindow) &&
    trendMetadata.primaryWindow !== query.repositoryTrendWindow
  ) {
    return false;
  }

  if (
    hasFilter(query.repositoryLanguage) &&
    normalizeSearchText(trendMetadata.language ?? '') !== normalizeSearchText(query.repositoryLanguage)
  ) {
    return false;
  }

  if (hasFilter(query.repositoryTopic)) {
    const normalizedTopic = normalizeSearchText(query.repositoryTopic);
    const hasTopic = trendMetadata.topics.some((topic) => normalizeSearchText(topic) === normalizedTopic);

    if (!hasTopic) {
      return false;
    }
  }

  return true;
};

type RepositoryTrendMetadata = {
  readonly language?: string;
  readonly topics: readonly string[];
  readonly primaryWindow: string;
};

const readRepositoryTrendMetadata = (metadata: JsonObject | undefined): RepositoryTrendMetadata | undefined => {
  if (metadata?.kind !== 'github_repository_trend') {
    return undefined;
  }

  const repository = readObject(metadata.repository);
  const trend = readObject(metadata.trend);
  const primaryWindow = readString(trend?.primaryWindow);

  if (repository === undefined || primaryWindow === undefined) {
    return undefined;
  }

  return {
    language: readString(repository.language),
    topics: readStringList(repository.topics),
    primaryWindow,
  };
};

const readObject = (value: JsonValue | undefined): JsonObject | undefined => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonObject;
};

const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readStringList = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

const hasSearch = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const hasFilter = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase('en-US');
