import { selectQueryMatchedHits } from './hacker-news-query-match';
import type { AlgoliaHit, AlgoliaSearchResponse } from './hacker-news-algolia-contracts';
import type { HackerNewsSearchOptions } from './hacker-news-client.port';

const algoliaOverfetchMultiplier = 2;
const minAlgoliaStoryPoints = 2;

export const algoliaFetchLimit = (limit: number): number =>
  Math.min(100, Math.max(limit, limit * algoliaOverfetchMultiplier));

export const normalizeAlgoliaQuery = (query: string): string =>
  query.replace(/[-,]/g, ' ').split(/\s+/u).filter(Boolean).join(' ');

export const optionalWordsForQuery = (query: string): string | undefined => {
  const [, ...optionalWords] = query.split(' ').filter(Boolean);

  return optionalWords.length === 0 ? undefined : optionalWords.join(' ');
};

export const numericFiltersForSearchOptions = (
  options: HackerNewsSearchOptions | undefined,
): string | undefined => {
  const filters = [
    options?.from === undefined
      ? undefined
      : `created_at_i>${Math.ceil(options.from.getTime() / 1000) - 1}`,
    options?.to === undefined ? undefined : `created_at_i<${Math.ceil(options.to.getTime() / 1000)}`,
  ].filter((filter): filter is string => filter !== undefined);

  return filters.length === 0 ? undefined : filters.join(',');
};

export const filterAlgoliaHits = (
  hits: readonly AlgoliaHit[],
  kind: 'story' | 'comment',
  query: string,
): readonly AlgoliaHit[] => {
  const queryMatchedHits = selectQueryMatchedHits(hits, query);

  if (kind === 'comment') {
    return queryMatchedHits;
  }

  const qualifyingHits = queryMatchedHits.filter(
    (hit) => (hit.points ?? 0) > minAlgoliaStoryPoints,
  );

  return qualifyingHits.length === 0 ? queryMatchedHits : qualifyingHits;
};

/** Algolia's modern and deprecated flags must agree when both are supplied. */
export function hasExhaustiveHitCount(response: AlgoliaSearchResponse): boolean {
  const exhaustive = response.exhaustive;
  if (exhaustive !== undefined &&
      (exhaustive === null || typeof exhaustive !== 'object' || Array.isArray(exhaustive))) {
    return false;
  }
  const modern = exhaustive?.nbHits;
  const legacy = response.exhaustiveNbHits;
  if ((modern !== undefined && typeof modern !== 'boolean') ||
      (legacy !== undefined && typeof legacy !== 'boolean')) return false;
  if (modern !== undefined && legacy !== undefined && modern !== legacy) return false;
  return modern === true || legacy === true;
}
