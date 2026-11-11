import type {
  HackerNewsClientPort,
  HackerNewsListStoryCommentsRequest,
  HackerNewsListing,
  HackerNewsSearchOptions,
  HackerNewsStory,
} from './hacker-news-client.port';
import type { AlgoliaSearchResponse } from './hacker-news-algolia-contracts';
import {
  algoliaFetchLimit,
  filterAlgoliaHits,
  normalizeAlgoliaQuery,
  numericFiltersForSearchOptions,
  optionalWordsForQuery,
} from './hacker-news-algolia-policy';
import { normalizeAlgoliaHit, normalizeFirebaseStory, isRecord } from './hacker-news-provider-mappers';
import { searchCompleteHackerNewsWindow } from './hacker-news-historical-search';

export type { AlgoliaHit } from './hacker-news-algolia-contracts';

const firebaseBaseUrl = 'https://hacker-news.firebaseio.com/v0';
const algoliaBaseUrl = 'https://hn.algolia.com/api/v1';
const listingEndpoints: Readonly<Record<HackerNewsListing, string>> = {
  top: 'topstories',
  new: 'newstories',
  best: 'beststories',
  ask: 'askstories',
  show: 'showstories',
  job: 'jobstories',
};

export class HttpHackerNewsClient implements HackerNewsClientPort {
  constructor(private readonly timeoutMs = 10_000) {}

  async searchStories(
    query: string,
    limit: number,
    options?: HackerNewsSearchOptions,
  ): Promise<readonly HackerNewsStory[]> {
    return this.searchAlgolia(query, 'story', limit, options);
  }

  async searchComments(
    query: string,
    limit: number,
    options?: HackerNewsSearchOptions,
  ): Promise<readonly HackerNewsStory[]> {
    return this.searchAlgolia(query, 'comment', limit, options);
  }

  async getStory(id: number): Promise<HackerNewsStory | null> {
    return this.fetchStory(id);
  }

  async listStoryComments(
    request: HackerNewsListStoryCommentsRequest,
  ): Promise<readonly HackerNewsStory[]> {
    const root = await this.getStory(request.storyId);
    if (request.requireComplete === true && root === null) {
      throw new Error('Hacker News comment expansion incomplete: root unavailable');
    }
    const rootKids = root?.kids;

    if (rootKids === undefined || rootKids.length === 0) {
      if (request.requireComplete === true) {
        const expectedComments = Math.max(root?.comments ?? 0, request.expectedComments ?? 0);
        if (expectedComments > 0) {
          throw new Error('Hacker News comment expansion incomplete: children unavailable');
        }
        if (rootKids === undefined && root?.comments !== 0) {
          throw new Error('Hacker News comment expansion incomplete: child coverage unknown');
        }
      }
      return [];
    }

    const comments = await this.fetchCommentTree({
      ids: rootKids,
      rootStoryId: request.storyId,
      limit: normalizeLimit(request.limit),
      maxDepth: normalizeCommentDepth(request.depth),
      currentDepth: 0,
      requireComplete: request.requireComplete === true,
    });

    if (request.requireComplete === true && comments.length >= normalizeLimit(request.limit)) {
      throw new Error('Hacker News comment expansion incomplete: comment limit');
    }

    if (request.requireComplete === true &&
        Math.max(root?.comments ?? 0, request.expectedComments ?? 0) > comments.length) {
      throw new Error('Hacker News comment expansion incomplete: fewer children than expected count');
    }

    return comments.map((comment, index) => ({
      ...comment,
      rank: index + 1,
    }));
  }

  private async fetchCommentTree(params: {
    readonly ids: readonly number[];
    readonly rootStoryId: number;
    readonly limit: number;
    readonly maxDepth: number;
    readonly currentDepth: number;
    readonly requireComplete: boolean;
  }): Promise<readonly HackerNewsStory[]> {
    const comments: HackerNewsStory[] = [];

    for (const id of params.ids) {
      if (comments.length >= params.limit) {
        break;
      }

      const item = await this.getStory(id);
      if (item?.kind !== 'comment') {
        if (params.requireComplete) throw new Error('Hacker News comment expansion incomplete: child unavailable');
        continue;
      }

      const comment = {
        ...item,
        storyId: params.rootStoryId,
        depth: params.currentDepth,
      };
      comments.push(comment);

      if (params.requireComplete && params.currentDepth >= params.maxDepth && (item.kids?.length ?? 0) > 0) {
        throw new Error('Hacker News comment expansion incomplete: depth limit');
      }

      if (
        comments.length >= params.limit ||
        params.currentDepth >= params.maxDepth ||
        item.kids === undefined ||
        item.kids.length === 0
      ) {
        continue;
      }

      comments.push(
        ...(await this.fetchCommentTree({
          ids: item.kids,
          rootStoryId: params.rootStoryId,
          limit: params.limit - comments.length,
          maxDepth: params.maxDepth,
          currentDepth: params.currentDepth + 1,
          requireComplete: params.requireComplete,
        })),
      );
    }

    return comments;
  }

  private async searchAlgolia(
    query: string,
    kind: 'story' | 'comment',
    limit: number,
    options: HackerNewsSearchOptions | undefined,
  ): Promise<readonly HackerNewsStory[]> {
    const normalizedLimit = normalizeLimit(limit);
    const normalizedQuery = normalizeAlgoliaQuery(query);
    const url = new URL(`${algoliaBaseUrl}/search_by_date`);
    url.searchParams.set('query', normalizedQuery);
    url.searchParams.set('tags', kind);
    url.searchParams.set('hitsPerPage', String(algoliaFetchLimit(normalizedLimit)));

    const optionalWords = optionalWordsForQuery(normalizedQuery);
    if (optionalWords !== undefined) {
      url.searchParams.set('optionalWords', optionalWords);
    }

    const numericFilters = numericFiltersForSearchOptions(options);
    if (numericFilters !== undefined) {
      url.searchParams.set('numericFilters', numericFilters);
    }

    if (options?.requireComplete === true) {
      if (options.from === undefined || options.to === undefined) {
        throw new Error('Hacker News historical search requires a bounded window');
      }
      const hits = await searchCompleteHackerNewsWindow(url, options.from, options.to, (targetUrl, signal) => this.fetchJson<AlgoliaSearchResponse>(targetUrl, signal), options.deadline);
      return filterAlgoliaHits(hits, kind, normalizedQuery)
        .flatMap((hit) => normalizeAlgoliaHit(hit, kind));
    }

    const response = await this.fetchJson<AlgoliaSearchResponse>(url.toString());
    const rawHits = response.hits ?? [];
    const filteredHits = filterAlgoliaHits(rawHits, kind, normalizedQuery);
    const items = filteredHits.slice(0, normalizedLimit).flatMap((hit) => normalizeAlgoliaHit(hit, kind));
    if (response.hits === undefined || response.exhaustiveNbHits === false ||
        response.exhaustive?.nbHits === false ||
        (response.nbHits !== undefined && response.nbHits > rawHits.length) ||
        (response.nbPages !== undefined && response.nbPages > 1) ||
        (response.nbHits === undefined && rawHits.length >= algoliaFetchLimit(normalizedLimit)) ||
        filteredHits.length > normalizedLimit || items.length < Math.min(filteredHits.length, normalizedLimit)) {
      options?.onIncomplete?.();
    }
    return items;
  }

  async listStories(listing: HackerNewsListing, limit: number, onIncomplete?: () => void): Promise<readonly HackerNewsStory[]> {
    const endpoint = listingEndpoints[listing];
    const storyIds = await this.fetchJson<unknown>(`${firebaseBaseUrl}/${endpoint}.json`);

    if (!Array.isArray(storyIds)) {
      throw new Error('Hacker News listing response was not an array');
    }

    const validIds = storyIds.filter((id): id is number => Number.isInteger(id));
    const ids = validIds.slice(0, normalizeLimit(limit));
    if (validIds.length > ids.length || validIds.length < storyIds.length) onIncomplete?.();
    const stories = await Promise.all(ids.map((id) => this.getStory(id)));
    if (stories.some((story) => story === null)) onIncomplete?.();
    return stories.filter((story): story is HackerNewsStory => story !== null);
  }

  private async fetchStory(id: number): Promise<HackerNewsStory | null> {
    const story = await this.fetchJson<unknown>(`${firebaseBaseUrl}/item/${id}.json`);

    if (!isRecord(story)) {
      return null;
    }

    return normalizeFirebaseStory(story);
  }

  private async fetchJson<TValue>(url: string, deadline?: AbortSignal): Promise<TValue> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'social-monitor-mvp/0.1',
      },
      signal: deadline === undefined
        ? AbortSignal.timeout(this.timeoutMs)
        : AbortSignal.any([deadline, AbortSignal.timeout(this.timeoutMs)]),
    });

    if (!response.ok) {
      throw new Error(`Hacker News provider returned HTTP ${response.status}`);
    }

    return response.json() as Promise<TValue>;
  }
}

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 100);
};

const normalizeCommentDepth = (depth: number): number => {
  if (!Number.isInteger(depth) || depth < 0) {
    return 0;
  }

  return Math.min(depth, 10);
};

