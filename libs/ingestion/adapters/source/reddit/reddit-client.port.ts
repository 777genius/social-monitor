export type RedditPostListing = 'hot' | 'new' | 'top' | 'rising';
export type RedditTopTime = 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
export type RedditSearchSort = 'relevance' | 'hot' | 'top' | 'new' | 'comments';
export type RedditSearchTime = RedditTopTime;
export type RedditCommentSort = 'confidence' | 'top' | 'new';

export type RedditPost = {
  readonly id: string;
  readonly name?: string;
  readonly subreddit?: string;
  readonly title?: string;
  readonly selftext?: string;
  readonly author?: string;
  readonly permalink?: string;
  readonly url?: string;
  readonly thumbnailUrl?: string;
  readonly previewImageUrl?: string;
  readonly postHint?: string;
  readonly isVideo?: boolean;
  readonly createdUtc?: number;
  readonly over18?: boolean;
  readonly stickied?: boolean;
  readonly removedByCategory?: string;
  readonly score?: number;
  readonly numComments?: number;
  readonly upvoteRatio?: number;
};

export type RedditComment = {
  readonly id: string;
  readonly name?: string;
  readonly subreddit?: string;
  readonly body?: string;
  readonly author?: string;
  readonly permalink?: string;
  readonly parentId?: string;
  readonly createdUtc?: number;
  readonly score?: number;
  readonly replyCount?: number;
  readonly removedByCategory?: string;
  readonly depth?: number;
};

export type RedditListingPage = {
  readonly posts: readonly RedditPost[];
  readonly after?: string;
  readonly rateLimit?: RedditRateLimitBudget;
};

export type RedditRateLimitBudget = {
  readonly headersObserved: boolean;
  readonly used?: string;
  readonly remaining?: string;
  readonly reset?: string;
};

export type RedditListSubredditPostsRequest = {
  readonly accessToken: string;
  readonly userAgent?: string;
  readonly subreddit: string;
  readonly listing: RedditPostListing;
  readonly topTime?: RedditTopTime;
  readonly limit: number;
  readonly after?: string;
};

export type RedditSearchPostsRequest = {
  readonly accessToken: string;
  readonly userAgent?: string;
  readonly query: string;
  readonly sort?: RedditSearchSort;
  readonly time?: RedditSearchTime;
  readonly limit: number;
  readonly after?: string;
};

export type RedditListPostCommentsRequest = {
  readonly accessToken: string;
  readonly userAgent?: string;
  readonly postId: string;
  readonly subreddit?: string;
  readonly limit: number;
  readonly sort?: RedditCommentSort;
  readonly depth?: number;
};

export type RedditCommentPage = {
  readonly comments: readonly RedditComment[];
  readonly rateLimit?: RedditRateLimitBudget;
};

export interface RedditClientPort {
  listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage>;
  searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage>;
  listPostComments(request: RedditListPostCommentsRequest): Promise<RedditCommentPage>;
}

// Capability-specific contract: ordinary collection clients need not support lookup.
export interface RedditPostsByIdsClient {
  getPostsByIds(request: {
    readonly accessToken: string; readonly userAgent?: string; readonly ids: readonly string[];
  }): Promise<{ readonly posts: readonly RedditPost[]; readonly omittedIds: readonly string[] }>;
}
