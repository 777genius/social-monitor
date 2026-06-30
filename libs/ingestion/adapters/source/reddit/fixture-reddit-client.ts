import type {
  RedditClientPort,
  RedditCommentPage,
  RedditListingPage,
  RedditListPostCommentsRequest,
  RedditListSubredditPostsRequest,
  RedditSearchPostsRequest,
} from './reddit-client.port';

export class FixtureRedditClient implements RedditClientPort {
  async listSubredditPosts(request: RedditListSubredditPostsRequest): Promise<RedditListingPage> {
    void request;

    return {
      posts: [
        {
          id: 'fixture-post-1',
          name: 't3_fixturepost1',
          subreddit: 'observability',
          title: 'Open-source monitoring pipeline lessons',
          selftext: 'A thread about durable queues, source policies and summarization evidence.',
          author: 'source_builder',
          permalink: '/r/observability/comments/fixturepost1/open_source_monitoring_pipeline_lessons/',
          createdUtc: 1_780_000_000,
        },
        {
          id: 'fixture-post-2',
          name: 't3_fixturepost2',
          subreddit: 'observability',
          title: 'Provider API reliability notes',
          selftext: 'Retries, rate limits and cursor contracts matter more than raw scraping volume.',
          author: 'api_researcher',
          permalink: '/r/observability/comments/fixturepost2/provider_api_reliability_notes/',
          createdUtc: 1_780_000_060,
        },
      ],
      after: 't3_fixturepost2',
    };
  }

  async searchPosts(request: RedditSearchPostsRequest): Promise<RedditListingPage> {
    void request;

    return {
      posts: [
        {
          id: 'fixture-search-1',
          name: 't3_fixturesearch1',
          subreddit: 'socialmonitoring',
          title: 'Searching Reddit with official OAuth APIs',
          selftext: 'Credential-scoped access keeps scanning policy-compliant.',
          author: 'search_operator',
          permalink: '/r/socialmonitoring/comments/fixturesearch1/searching_reddit_with_official_oauth_apis/',
          createdUtc: 1_780_000_120,
        },
      ],
      after: 't3_fixturesearch1',
    };
  }

  async listPostComments(request: RedditListPostCommentsRequest): Promise<RedditCommentPage> {
    return {
      comments: [
        {
          id: `${request.postId}-comment-1`,
          name: `t1_${request.postId}_comment_1`,
          subreddit: request.subreddit,
          body: 'This thread shows why official APIs and source policy matter.',
          author: 'comment_researcher',
          permalink: `/comments/${request.postId}/_/comment_1/`,
          parentId: `t3_${request.postId}`,
          createdUtc: 1_780_000_180,
          score: 12,
          replyCount: 1,
          depth: 0,
        },
        {
          id: `${request.postId}-comment-2`,
          name: `t1_${request.postId}_comment_2`,
          subreddit: request.subreddit,
          body: 'Comment-level evidence makes summaries easier to verify.',
          author: 'summary_builder',
          permalink: `/comments/${request.postId}/_/comment_2/`,
          parentId: `t1_${request.postId}_comment_1`,
          createdUtc: 1_780_000_240,
          score: 8,
          replyCount: 0,
          depth: 1,
        },
      ].slice(0, request.limit),
    };
  }
}
