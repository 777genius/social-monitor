export type RedditPostListing = 'hot' | 'new' | 'top' | 'rising';

export type RedditPost = {
  readonly id: string;
  readonly name?: string;
  readonly subreddit?: string;
  readonly title?: string;
  readonly selftext?: string;
  readonly author?: string;
  readonly permalink?: string;
  readonly url?: string;
  readonly createdUtc?: number;
  readonly over18?: boolean;
  readonly stickied?: boolean;
  readonly removedByCategory?: string;
};

export type RedditListingPage = {
  readonly posts: readonly RedditPost[];
  readonly after?: string;
};

export type RedditListSubredditPostsRequest = {
  readonly accessToken: string;
  readonly userAgent?: string;
  readonly subreddit: string;
  readonly listing: RedditPostListing;
  readonly limit: number;
  readonly after?: string;
};

export type RedditSearchPostsRequest = {
  readonly accessToken: string;
  readonly userAgent?: string;
  readonly query: string;
  readonly limit: number;
  readonly after?: string;
};

export interface RedditClientPort {
  listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage>;
  searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage>;
}
