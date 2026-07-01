import type {
  RedditClientPort,
  RedditComment,
  RedditCommentPage,
  RedditListingPage,
  RedditListPostCommentsRequest,
  RedditListSubredditPostsRequest,
  RedditPost,
  RedditPostListing,
  RedditRateLimitBudget,
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

type RedditApiThreadResponse = readonly RedditApiListingResponse[];

export class HttpRedditClient implements RedditClientPort {
  constructor(
    private readonly baseUrl = 'https://oauth.reddit.com',
    private readonly timeoutMs = 10_000,
  ) {}

  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    const url = this.url(`/r/${encodeURIComponent(request.subreddit)}/${request.listing}`, {
      limit: String(request.limit),
      ...(request.listing === 'top' && request.topTime !== undefined ? { t: request.topTime } : {}),
      ...(request.after === undefined ? {} : { after: request.after }),
      raw_json: '1',
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
      raw_json: '1',
    });

    return this.fetchListing(url, request.accessToken, request.userAgent);
  }

  async listPostComments(request: RedditListPostCommentsRequest): Promise<RedditCommentPage> {
    const path = request.subreddit === undefined
      ? `/comments/${encodeURIComponent(request.postId)}`
      : `/r/${encodeURIComponent(request.subreddit)}/comments/${encodeURIComponent(request.postId)}`;
    const url = this.url(path, {
      limit: String(request.limit),
      sort: request.sort ?? 'confidence',
      ...(request.depth === undefined ? {} : { depth: String(request.depth) }),
    });
    const response = await this.fetchJson<RedditApiThreadResponse>(
      url,
      request.accessToken,
      request.userAgent,
    );
    const commentListing = response.value[1];

    return {
      comments: normalizeCommentChildren(commentListing?.data?.children ?? []),
      rateLimit: response.rateLimit,
    };
  }

  private async fetchListing(
    url: URL,
    accessToken: string,
    userAgent: string | undefined,
  ): Promise<RedditListingPage> {
    const response = await this.fetchJson<RedditApiListingResponse>(url, accessToken, userAgent);
    const posts = (response.value.data?.children ?? []).flatMap((child) => normalizePost(child.data));

    return {
      posts,
      after: response.value.data?.after ?? undefined,
      rateLimit: response.rateLimit,
    };
  }

  private async fetchJson<TValue>(
    url: URL,
    accessToken: string,
    userAgent: string | undefined,
  ): Promise<{ readonly value: TValue; readonly rateLimit: RedditRateLimitBudget }> {
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

    return {
      value: await response.json() as TValue,
      rateLimit: readRateLimitBudget(response.headers),
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
      thumbnailUrl: readHttpUrl(data.thumbnail),
      previewImageUrl: readPreviewImageUrl(data.preview),
      postHint: readString(data.post_hint),
      isVideo: readBoolean(data.is_video),
      createdUtc: readNumber(data.created_utc),
      over18: readBoolean(data.over_18),
      stickied: readBoolean(data.stickied),
      removedByCategory: readString(data.removed_by_category),
      score: readNumber(data.score),
      numComments: readNumber(data.num_comments),
      upvoteRatio: readNumber(data.upvote_ratio),
    },
  ];
};

const normalizeCommentChildren = (
  children: readonly {
    readonly kind?: string;
    readonly data?: Readonly<Record<string, unknown>>;
  }[],
): readonly RedditComment[] =>
  children.flatMap((child) => {
    if (child.kind !== undefined && child.kind !== 't1') {
      return [];
    }

    const replies = readCommentReplies(child.data);

    return [
      ...normalizeComment(child.data, countDirectCommentReplies(replies)),
      ...normalizeCommentChildren(replies),
    ];
  });

const normalizeComment = (
  data: Readonly<Record<string, unknown>> | undefined,
  replyCount: number,
): readonly RedditComment[] => {
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
      body: readString(data.body),
      author: readString(data.author),
      permalink: readString(data.permalink),
      parentId: readString(data.parent_id),
      createdUtc: readNumber(data.created_utc),
      score: readNumber(data.score),
      replyCount,
      removedByCategory: readString(data.removed_by_category),
      depth: readNumber(data.depth),
    },
  ];
};

const countDirectCommentReplies = (
  children: readonly {
    readonly kind?: string;
    readonly data?: Readonly<Record<string, unknown>>;
  }[],
): number => children.filter((child) => child.kind === 't1').length;

const readCommentReplies = (
  data: Readonly<Record<string, unknown>> | undefined,
): readonly {
  readonly kind?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}[] => {
  if (data === undefined) {
    return [];
  }
  const replies = data.replies;
  if (typeof replies !== 'object' || replies === null || Array.isArray(replies)) {
    return [];
  }
  const children = (replies as RedditApiListingResponse).data?.children;

  return children ?? [];
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readHttpUrl = (value: unknown): string | undefined => {
  const text = decodeHtmlUrl(readString(value));
  if (text === undefined) {
    return undefined;
  }

  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

const readPreviewImageUrl = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const images = value.images;
  if (!Array.isArray(images)) {
    return undefined;
  }

  for (const image of images) {
    if (!isRecord(image)) {
      continue;
    }

    const source = image.source;
    if (!isRecord(source)) {
      continue;
    }

    const sourceUrl = readHttpUrl(source.url);
    if (sourceUrl !== undefined) {
      return sourceUrl;
    }
  }

  return undefined;
};

const decodeHtmlUrl = (value: string | undefined): string | undefined =>
  value
    ?.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRateLimitBudget = (headers: Headers): RedditRateLimitBudget => {
  const used = headers.get('x-ratelimit-used') ?? undefined;
  const remaining = headers.get('x-ratelimit-remaining') ?? undefined;
  const reset = headers.get('x-ratelimit-reset') ?? undefined;

  return {
    headersObserved: used !== undefined || remaining !== undefined || reset !== undefined,
    used,
    remaining,
    reset,
  };
};

export const redditListings: readonly RedditPostListing[] = ['hot', 'new', 'top', 'rising'];
export const redditTopTimes = ['hour', 'day', 'week', 'month', 'year', 'all'] as const;
