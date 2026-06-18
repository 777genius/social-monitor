import type {
  RedditClientPort,
  RedditListingPage,
  RedditListSubredditPostsRequest,
  RedditPost,
  RedditPostListing,
  RedditSearchPostsRequest,
} from './reddit-client.port';

type RedditApiListingResponse = {
  readonly data?: {
    readonly after?: string | null;
    readonly children?: readonly {
      readonly data?: Readonly<Record<string, unknown>>;
    }[];
  };
};

export class HttpRedditClient implements RedditClientPort {
  constructor(
    private readonly baseUrl = 'https://oauth.reddit.com',
    private readonly timeoutMs = 10_000,
  ) {}

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    const url = this.url(`/r/${encodeURIComponent(request.subreddit)}/${request.listing}`, {
      limit: String(request.limit),
      ...(request.after === undefined ? {} : { after: request.after }),
    });

    return this.fetchListing(url, request.accessToken, request.userAgent);
  }

  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    const url = this.url('/search', {
      q: request.query,
      type: 'link',
      sort: 'new',
      limit: String(request.limit),
      ...(request.after === undefined ? {} : { after: request.after }),
    });

    return this.fetchListing(url, request.accessToken, request.userAgent);
  }

  private async fetchListing(
    url: URL,
    accessToken: string,
    userAgent: string | undefined,
  ): Promise<RedditListingPage> {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': userAgent ?? 'social-monitor-mvp/0.1',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}`);
    }

    const json = await response.json() as RedditApiListingResponse;
    const posts = (json.data?.children ?? []).flatMap((child) => normalizePost(child.data));

    return {
      posts,
      after: json.data?.after ?? undefined,
    };
  }

  private url(path: string, query: Readonly<Record<string, string>>): URL {
    const url = new URL(path, this.baseUrl);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    return url;
  }
}

const normalizePost = (data: Readonly<Record<string, unknown>> | undefined): readonly RedditPost[] => {
  if (data === undefined) {
    return [];
  }

  const id = readString(data.id);

  if (id === undefined) {
    return [];
  }

  return [
    {
      id,
      name: readString(data.name),
      subreddit: readString(data.subreddit),
      title: readString(data.title),
      selftext: readString(data.selftext),
      author: readString(data.author),
      permalink: readString(data.permalink),
      url: readString(data.url),
      createdUtc: readNumber(data.created_utc),
      over18: readBoolean(data.over_18),
      stickied: readBoolean(data.stickied),
      removedByCategory: readString(data.removed_by_category),
    },
  ];
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

export const redditListings: readonly RedditPostListing[] = ['hot', 'new', 'top', 'rising'];
