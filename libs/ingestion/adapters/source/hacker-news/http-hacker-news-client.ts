import type {
  HackerNewsClientPort,
  HackerNewsListStoryCommentsRequest,
  HackerNewsListing,
  HackerNewsSearchOptions,
  HackerNewsStory,
} from './hacker-news-client.port';
import {
  selectQueryMatchedHits,
  stripHtml,
} from "./hacker-news-query-match";

export type AlgoliaHit = {
  readonly objectID?: string;
  readonly title?: string;
  readonly story_title?: string;
  readonly story_id?: number;
  readonly parent_id?: number;
  readonly url?: string;
  readonly author?: string;
  readonly created_at_i?: number;
  readonly story_text?: string;
  readonly comment_text?: string;
  readonly points?: number;
  readonly num_comments?: number;
};

type AlgoliaSearchResponse = {
  readonly hits?: readonly AlgoliaHit[];
};

const firebaseBaseUrl = 'https://hacker-news.firebaseio.com/v0';
const algoliaBaseUrl = 'https://hn.algolia.com/api/v1';
const algoliaOverfetchMultiplier = 2;
const minAlgoliaStoryPoints = 2;
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
    const rootKids = root?.kids ?? [];

    if (rootKids.length === 0) {
      return [];
    }

    const comments = await this.fetchCommentTree({
      ids: rootKids,
      rootStoryId: request.storyId,
      limit: normalizeLimit(request.limit),
      maxDepth: normalizeCommentDepth(request.depth),
      currentDepth: 0,
    });

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
  }): Promise<readonly HackerNewsStory[]> {
    const comments: HackerNewsStory[] = [];

    for (const id of params.ids) {
      if (comments.length >= params.limit) {
        break;
      }

      const item = await this.getStory(id);
      if (item?.kind !== 'comment') {
        continue;
      }

      const comment = {
        ...item,
        storyId: params.rootStoryId,
        depth: params.currentDepth,
      };
      comments.push(comment);

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

    const response = await this.fetchJson<AlgoliaSearchResponse>(url.toString());
    const hits = filterAlgoliaHits(response.hits ?? [], kind, normalizedQuery)
      .slice(0, normalizedLimit);

    return hits.flatMap((hit) => normalizeAlgoliaHit(hit, kind));
  }

  async listStories(listing: HackerNewsListing, limit: number): Promise<readonly HackerNewsStory[]> {
    const endpoint = listingEndpoints[listing];
    const storyIds = await this.fetchJson<unknown>(`${firebaseBaseUrl}/${endpoint}.json`);

    if (!Array.isArray(storyIds)) {
      throw new Error('Hacker News listing response was not an array');
    }

    const ids = storyIds
      .filter((id): id is number => Number.isInteger(id))
      .slice(0, normalizeLimit(limit));

    return Promise.all(ids.map((id) => this.getStory(id)))
      .then((stories) => stories.filter((story): story is HackerNewsStory => story !== null));
  }

  private async fetchStory(id: number): Promise<HackerNewsStory | null> {
    const story = await this.fetchJson<unknown>(`${firebaseBaseUrl}/item/${id}.json`);

    if (!isRecord(story)) {
      return null;
    }

    return normalizeFirebaseStory(story);
  }

  private async fetchJson<TValue>(url: string): Promise<TValue> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'social-monitor-mvp/0.1',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
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

const algoliaFetchLimit = (limit: number): number =>
  Math.min(100, Math.max(limit, limit * algoliaOverfetchMultiplier));

const normalizeAlgoliaQuery = (query: string): string =>
  query.replace(/[-,]/g, ' ').split(/\s+/u).filter(Boolean).join(' ');

const optionalWordsForQuery = (query: string): string | undefined => {
  const [, ...optionalWords] = query.split(' ').filter(Boolean);

  return optionalWords.length === 0 ? undefined : optionalWords.join(' ');
};

const numericFiltersForSearchOptions = (
  options: HackerNewsSearchOptions | undefined,
): string | undefined => {
  const filters = [
    options?.from === undefined
      ? undefined
      : `created_at_i>${unixTimestamp(options.from)}`,
    options?.to === undefined ? undefined : `created_at_i<${unixTimestamp(options.to)}`,
  ].filter((filter): filter is string => filter !== undefined);

  return filters.length === 0 ? undefined : filters.join(',');
};

const unixTimestamp = (date: Date): number => Math.floor(date.getTime() / 1000);

const filterAlgoliaHits = (
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

const normalizeAlgoliaHit = (
  hit: AlgoliaHit,
  kind: 'story' | 'comment',
): readonly HackerNewsStory[] => {
  const id = Number(hit.objectID);
  if (!Number.isInteger(id)) {
    return [];
  }
  const storyId = readOptionalInteger(hit.story_id);
  const parentId = readOptionalInteger(hit.parent_id);
  const text = cleanOptionalText(hit.story_text ?? hit.comment_text);
  const score = readOptionalInteger(hit.points);
  const comments = readOptionalInteger(hit.num_comments);

  return [{
    kind,
    id,
    ...(hit.title === undefined ? {} : { title: hit.title }),
    ...(hit.story_title === undefined ? {} : { storyTitle: hit.story_title }),
    ...(storyId === undefined ? {} : { storyId }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(hit.url === undefined ? {} : { url: hit.url }),
    ...(hit.author === undefined ? {} : { by: hit.author }),
    ...(hit.created_at_i === undefined ? {} : { time: hit.created_at_i }),
    ...(text === undefined ? {} : { text }),
    ...(score === undefined ? {} : { score }),
    ...(comments === undefined ? {} : { comments }),
  }];
};

const normalizeFirebaseStory = (story: Readonly<Record<string, unknown>>): HackerNewsStory | null => {
  const id = readOptionalInteger(story.id);
  if (id === undefined) {
    return null;
  }
  const kind = readFirebaseKind(story.type);
  const parentId = readOptionalInteger(story.parent);
  const kids = readOptionalIntegerArray(story.kids);

  return {
    ...(kind === undefined ? {} : { kind }),
    id,
    title: readOptionalString(story.title),
    ...(parentId === undefined ? {} : { parentId }),
    ...(kids === undefined ? {} : { kids }),
    url: readOptionalString(story.url),
    by: readOptionalString(story.by),
    time: readOptionalInteger(story.time),
    text: cleanOptionalText(readOptionalString(story.text)),
    score: readOptionalInteger(story.score),
    comments: readOptionalInteger(story.descendants),
    deleted: story.deleted === true,
    dead: story.dead === true,
  };
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readFirebaseKind = (value: unknown): 'story' | 'comment' | undefined => {
  if (value === 'comment') {
    return 'comment';
  }

  return value === 'story' || value === 'job' || value === 'poll'
    ? 'story'
    : undefined;
};

const readOptionalIntegerArray = (
  value: unknown,
): readonly number[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is number => Number.isInteger(item));
};

const cleanOptionalText = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : stripHtml(value);

const readOptionalInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
