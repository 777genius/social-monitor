import type { HackerNewsClientPort, HackerNewsListing, HackerNewsStory } from './hacker-news-client.port';

type AlgoliaHit = {
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

  async searchStories(query: string, limit: number): Promise<readonly HackerNewsStory[]> {
    return this.searchAlgolia(query, 'story', limit);
  }

  async searchComments(query: string, limit: number): Promise<readonly HackerNewsStory[]> {
    return this.searchAlgolia(query, 'comment', limit);
  }

  private async searchAlgolia(
    query: string,
    kind: 'story' | 'comment',
    limit: number,
  ): Promise<readonly HackerNewsStory[]> {
    const url = new URL(`${algoliaBaseUrl}/search_by_date`);
    url.searchParams.set('query', query);
    url.searchParams.set('tags', kind);
    url.searchParams.set('hitsPerPage', String(normalizeLimit(limit)));

    const response = await this.fetchJson<AlgoliaSearchResponse>(url.toString());

    return (response.hits ?? []).flatMap((hit) => normalizeAlgoliaHit(hit, kind));
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

    return Promise.all(ids.map((id) => this.fetchStory(id)))
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
  const text = hit.story_text ?? hit.comment_text;
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

  return {
    id,
    title: readOptionalString(story.title),
    url: readOptionalString(story.url),
    by: readOptionalString(story.by),
    time: readOptionalInteger(story.time),
    text: readOptionalString(story.text),
    score: readOptionalInteger(story.score),
    comments: readOptionalInteger(story.descendants),
    deleted: story.deleted === true,
    dead: story.dead === true,
  };
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readOptionalInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
